-- OR-VerkiezingsTeller · update: verkiezing verwijderen
-- Eenmalig uitvoeren in Supabase > SQL Editor als je de database al eerder
-- hebt aangemaakt met schema.sql (nieuwe installaties hebben dit al).
-- Voer eerst 002-bewaartermijn.sql uit als je dat nog niet gedaan hebt.

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
    -- Via public.verkiezing_verwijderen (met naamcontrole); die logt zelf.
    if coalesce(current_setting('or.verwijderen', true), '') = 'aan' then
      return old;
    end if;
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

-- Een hele verkiezing verwijderen: kandidaten, kiezers, stemmen, meldingen en
-- uitslag. Alleen de beheerder, en alleen als de naam precies wordt overgetypt.
-- Huisstijl, logo en commissie blijven staan. In het logboek blijft een regel
-- "verkiezing verwijderd" staan; e-mailadressen van kiezers worden eruit gehaald.
create or replace function public.verkiezing_verwijderen(p_verkiezing uuid, p_titel text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.verkiezingen;
  v_stemmen int;
  v_kiezers int;
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  select * into v from public.verkiezingen where id = p_verkiezing for update;
  if not found then
    raise exception 'Verkiezing niet gevonden';
  end if;
  if btrim(coalesce(p_titel, '')) <> btrim(v.titel) then
    raise exception 'De naam klopt niet. Typ de naam van de verkiezing precies over.';
  end if;

  select count(*) into v_stemmen from public.stemmen where verkiezing_id = v.id;
  select count(*) into v_kiezers from public.kiezers where verkiezing_id = v.id;

  update public.logboek set details = details - 'email'
   where verkiezing_id = v.id and details ? 'email';
  delete from public.meldingen where verkiezing_id = v.id;
  delete from public.stemmen where verkiezing_id = v.id;

  perform set_config('or.verwijderen', 'aan', true);
  delete from public.verkiezingen where id = v.id;   -- kandidaten, kiezers en wachtrij gaan mee
  perform set_config('or.verwijderen', '', true);

  perform private.log('verkiezing verwijderd',
                      jsonb_build_object('titel', v.titel, 'status', private.status_van(v),
                                         'stemmen', v_stemmen, 'kiezers', v_kiezers),
                      null);
end $$;

revoke execute on function public.verkiezing_verwijderen(uuid, text) from public, anon;
grant execute on function public.verkiezing_verwijderen(uuid, text) to authenticated;
