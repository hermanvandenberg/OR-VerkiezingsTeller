-- OR-VerkiezingsTeller · update: stemmen vernietigen na de bewaartermijn
-- Eenmalig uitvoeren in Supabase > SQL Editor als je de database al eerder
-- hebt aangemaakt met schema.sql (nieuwe installaties hebben dit al).

alter table public.verkiezingen
  add column if not exists vernietigen_op  date,
  add column if not exists vernietigd_at   timestamptz,
  add column if not exists uitslag_archief jsonb;

create or replace function private.verkiezing_bewaken() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.vernietigd_at := null;
    new.uitslag_archief := null;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    -- Standaard bewaartermijn: 3 maanden na sluiting.
    if new.vernietigen_op is null then
      new.vernietigen_op := ((new.eind_at at time zone 'Europe/Amsterdam') + interval '3 months')::date;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    -- Interne wijziging tijdens het vernietigen zelf.
    if coalesce(current_setting('or.vernietigen', true), '') = 'aan' then
      return new;
    end if;
    if new.vernietigd_at is distinct from old.vernietigd_at
       or new.uitslag_archief is distinct from old.uitslag_archief then
      raise exception 'Vernietigen kan alleen via de knop in het beheerscherm';
    end if;
    if old.vernietigd_at is not null
       and (new.vernietigen_op is distinct from old.vernietigen_op or new.eind_at is distinct from old.eind_at) then
      raise exception 'De stemmen van deze verkiezing zijn al vernietigd';
    end if;
    if old.start_at <= now() then
      if new.start_at <> old.start_at
         or new.uitslag_zichtbaar <> old.uitslag_zichtbaar then
        raise exception 'Start en zichtbaarheid van de uitslag liggen vast zodra de stemming is begonnen';
      end if;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and new.vernietigen_op <= (new.eind_at at time zone 'Europe/Amsterdam')::date then
    raise exception 'De datum om de stemmen te vernietigen moet na het einde van de stemming liggen';
  end if;
  if tg_op = 'DELETE' then
    if old.start_at <= now() then
      raise exception 'Een verkiezing die al begonnen is kan niet verwijderd worden';
    end if;
    perform private.log('verkiezing verwijderd', jsonb_build_object('titel', old.titel), null);
    return old;
  end if;
  perform private.log(case when tg_op = 'INSERT' then 'verkiezing aangemaakt' else 'verkiezing gewijzigd' end,
                      jsonb_build_object('titel', new.titel, 'start', new.start_at, 'eind', new.eind_at,
                                         'uitslag', new.uitslag_zichtbaar,
                                         'verzendwijze', new.verzendwijze,
                                         'vernietigen_op', new.vernietigen_op),
                      new.id);
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Bewaartermijn: stemmen en kiezersgegevens vernietigen
-- ---------------------------------------------------------------------
-- Op de ingestelde datum (standaard 3 maanden na sluiting) worden de stemmen,
-- de kiezerslijst (namen, e-mailadressen, wie gestemd heeft), de meldingen en
-- de mailwachtrij van een verkiezing gewist. De uitslag in aantallen blijft
-- bewaard, zodat het archief compleet blijft. Dit kan niet ongedaan worden.

create or replace function private.vandaag() returns date
language sql stable as $$
  select (now() at time zone 'Europe/Amsterdam')::date
$$;

create or replace function private.uitslag_tellen(p_verkiezing uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_agg(r order by r.volgorde)
  from (
    select c.naam, c.volgorde,
           (select count(*) from public.stemmen s
             where s.verkiezing_id = p_verkiezing and s.kandidaat_id = c.id and s.status = 'geldig') as stemmen
    from public.kandidaten c where c.verkiezing_id = p_verkiezing
    union all
    select 'Onthouden', 1000000,
           (select count(*) from public.stemmen s
             where s.verkiezing_id = p_verkiezing and s.kandidaat_id is null and s.status = 'geldig')
  ) r
$$;

create or replace function private.stemmen_vernietigen(p_verkiezing uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.verkiezingen;
  v_archief jsonb;
begin
  select * into v from public.verkiezingen where id = p_verkiezing for update;
  if not found then
    raise exception 'Verkiezing niet gevonden';
  end if;
  if v.vernietigd_at is not null then
    return;
  end if;
  if private.status_van(v) <> 'gesloten' then
    raise exception 'Stemmen kunnen pas vernietigd worden als de stemming gesloten is';
  end if;

  v_archief := jsonb_build_object(
    'kiezers', (select count(*) from public.kiezers where verkiezing_id = v.id),
    'gestemd', (select count(*) from public.kiezers where verkiezing_id = v.id and gestemd),
    'apart', (select count(*) from public.stemmen where verkiezing_id = v.id and status = 'apart'),
    'afgekeurd', (select count(*) from public.stemmen where verkiezing_id = v.id and status = 'afgekeurd'),
    'uitslag', private.uitslag_tellen(v.id));

  perform set_config('or.vernietigen', 'aan', true);
  update public.verkiezingen set vernietigd_at = now(), uitslag_archief = v_archief where id = v.id;
  perform set_config('or.vernietigen', '', true);

  delete from public.meldingen where verkiezing_id = v.id;
  delete from public.mail_wachtrij where verkiezing_id = v.id;
  delete from public.stemmen where verkiezing_id = v.id;
  delete from public.kiezers where verkiezing_id = v.id;
  delete from public.herinneringen_verwerkt where verkiezing_id = v.id;
  -- Ook e-mailadressen van kiezers uit het logboek halen.
  update public.logboek set details = details - 'email'
   where verkiezing_id = v.id and details ? 'email';

  perform private.log('stemmen vernietigd',
                      jsonb_build_object('kiezers', v_archief->'kiezers', 'gestemd', v_archief->'gestemd'),
                      v.id);
end $$;

-- Handmatig, door de beheerder (knop in het beheerscherm).
create or replace function public.stemmen_vernietigen(p_verkiezing uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  perform private.stemmen_vernietigen(p_verkiezing);
end $$;

-- Alles vernietigen waarvan de datum is bereikt. Draait elke nacht via de planner,
-- en voor de zekerheid ook als het beheer- of commissiescherm wordt geopend.
create or replace function private.vernietigen_verlopen() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from public.verkiezingen
    where vernietigd_at is null and vernietigen_op <= private.vandaag() and now() >= eind_at
  loop
    perform private.stemmen_vernietigen(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.vernietigen_verlopen() returns int
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_commissie() then
    raise exception 'Geen toegang';
  end if;
  return private.vernietigen_verlopen();
end $$;

create or replace function public.dashboard(p_verkiezing uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.verkiezingen;
  v_status text;
  v_zichtbaar boolean;
begin
  if not public.is_commissie() then
    raise exception 'Geen toegang';
  end if;
  select * into v from public.verkiezingen where id = p_verkiezing;
  if not found then
    raise exception 'Verkiezing niet gevonden';
  end if;
  v_status := private.status_van(v);
  v_zichtbaar := v_status = 'gesloten' or v.uitslag_zichtbaar = 'live';

  -- Na vernietigen: de bewaarde aantallen tonen.
  if v.vernietigd_at is not null then
    return coalesce(v.uitslag_archief, '{}'::jsonb) || jsonb_build_object(
      'titel', v.titel,
      'status', v_status,
      'start_at', v.start_at,
      'eind_at', v.eind_at,
      'uitslag_zichtbaar', v.uitslag_zichtbaar,
      'open_meldingen', 0,
      'vernietigen_op', v.vernietigen_op,
      'vernietigd_at', v.vernietigd_at);
  end if;

  return jsonb_build_object(
    'titel', v.titel,
    'status', v_status,
    'start_at', v.start_at,
    'eind_at', v.eind_at,
    'uitslag_zichtbaar', v.uitslag_zichtbaar,
    'vernietigen_op', v.vernietigen_op,
    'vernietigd_at', null,
    'kiezers', (select count(*) from public.kiezers where verkiezing_id = v.id),
    'gestemd', (select count(*) from public.kiezers where verkiezing_id = v.id and gestemd),
    'apart', (select count(*) from public.stemmen where verkiezing_id = v.id and status = 'apart'),
    'afgekeurd', (select count(*) from public.stemmen where verkiezing_id = v.id and status = 'afgekeurd'),
    'open_meldingen', (select count(*) from public.meldingen
                       where (verkiezing_id = v.id or verkiezing_id is null) and status = 'open'),
    'uitslag', case when v_zichtbaar then private.uitslag_tellen(v.id) else null end
  );
end $$;

revoke execute on function private.vandaag(), private.uitslag_tellen(uuid), private.stemmen_vernietigen(uuid),
                           private.vernietigen_verlopen() from public, anon, authenticated;
revoke execute on function public.stemmen_vernietigen(uuid), public.vernietigen_verlopen() from public, anon;
grant execute on function public.stemmen_vernietigen(uuid), public.vernietigen_verlopen() to authenticated;

-- Bestaande verkiezingen krijgen de standaarddatum: 3 maanden na sluiting.
do $do$
begin
  perform set_config('or.vernietigen', 'aan', true);
  update public.verkiezingen
     set vernietigen_op = ((eind_at at time zone 'Europe/Amsterdam') + interval '3 months')::date
   where vernietigen_op is null;
end $do$;

-- Elke nacht om 03:15 de stemmen vernietigen waarvan de datum is bereikt.
do $do$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('or-stemmen-vernietigen', '15 3 * * *', 'select private.vernietigen_verlopen()');
exception when others then
  raise notice 'Planner (pg_cron) niet beschikbaar: %. Vernietigen gebeurt dan bij het openen van het beheerscherm.', sqlerrm;
end $do$;
