-- =====================================================================
-- OR-VerkiezingsTeller · database
-- Plak dit hele bestand één keer in Supabase > SQL Editor en klik Run.
-- Vervang eerst JOUW-EMAIL@BEDRIJF.NL (onderaan) door het e-mailadres
-- van de beheerder.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Privé schema: niet bereikbaar via de website, alleen via functies.
create schema if not exists private;
revoke all on schema private from public;

create table private.geheim (
  id      int primary key default 1 check (id = 1),
  sleutel bytea not null default extensions.gen_random_bytes(32)
);
insert into private.geheim default values;

create table private.ongeldige_pogingen (
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------

create table public.app_instellingen (
  id          int primary key default 1 check (id = 1),
  organisatie text not null default 'Ondernemingsraad',
  logo_url    text,
  site_url    text,
  thema       jsonb,   -- {"primair":"#..","accent":"#..","lettertype":"..."}
  bedrijf_website text
);
insert into public.app_instellingen default values;

-- Wie mag inloggen. Alleen adressen in deze lijst kunnen een account maken.
create table public.toegang (
  email          text primary key check (email = lower(email)),
  naam           text not null,
  rol            text not null check (rol in ('beheerder', 'commissie')),
  user_id        uuid unique references auth.users (id) on delete set null,
  uitgenodigd_at timestamptz not null default now()
);

create table public.verkiezingen (
  id                uuid primary key default gen_random_uuid(),
  titel             text not null,
  toelichting       text,
  start_at          timestamptz not null,
  eind_at           timestamptz not null,
  uitslag_zichtbaar text not null default 'na_sluiting'
                    check (uitslag_zichtbaar in ('na_sluiting', 'live')),
  verzendwijze      text not null default 'samenvoegen'
                    check (verzendwijze in ('samenvoegen', 'outlook_automatisch')),
  herinneringen     timestamptz[] not null default '{}',
  vernietigen_op    date,          -- stemmen en kiezersgegevens wissen op deze dag
  vernietigd_at     timestamptz,   -- moment waarop dat is gebeurd
  uitslag_archief   jsonb,         -- bewaarde aantallen na het vernietigen
  aangemaakt_at     timestamptz not null default now(),
  check (eind_at > start_at)
);

create table public.kandidaten (
  id            uuid primary key default gen_random_uuid(),
  verkiezing_id uuid not null references public.verkiezingen (id) on delete cascade,
  naam          text not null,
  functie       text,
  tekst         text,
  foto_url      text,
  volgorde      int not null default 0
);

create table public.kiezers (
  id             uuid primary key default gen_random_uuid(),
  verkiezing_id  uuid not null references public.verkiezingen (id) on delete cascade,
  naam           text not null default '',
  email          text not null check (email = lower(email)),
  token_versie   int not null default 1,
  uitgenodigd_at timestamptz,
  gestemd        boolean not null default false,
  unique (verkiezing_id, email)
);

-- Stemmen zijn volledig anoniem: geen tijdstip en geen verwijzing naar de kiezer.
-- Nergens wordt opgeslagen wie op wie heeft gestemd.
create table public.stemmen (
  id            uuid primary key default gen_random_uuid(),
  verkiezing_id uuid not null references public.verkiezingen (id) on delete cascade,
  kandidaat_id  uuid references public.kandidaten (id),   -- leeg = onthouden
  status        text not null default 'geldig'
                check (status in ('geldig', 'apart', 'afgekeurd'))
);

create table public.meldingen (
  id               bigint generated always as identity primary key,
  verkiezing_id    uuid references public.verkiezingen (id) on delete cascade,
  soort            text not null,
  omschrijving     text not null,
  kiezer_id        uuid references public.kiezers (id) on delete set null,
  stem_id          uuid references public.stemmen (id) on delete set null,
  ingevulde_naam   text,
  ingevulde_email  text,
  aantal           int not null default 1,
  status           text not null default 'open'
                   check (status in ('open', 'goedgekeurd', 'afgekeurd', 'gezien')),
  afgehandeld_door text,
  afgehandeld_at   timestamptz,
  aangemaakt_at    timestamptz not null default now()
);

create table public.logboek (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  wie           text not null,
  actie         text not null,
  details       jsonb,
  verkiezing_id uuid
);

create table public.mail_wachtrij (
  id            bigint generated always as identity primary key,
  verkiezing_id uuid not null references public.verkiezingen (id) on delete cascade,
  kiezer_id     uuid not null references public.kiezers (id) on delete cascade,
  soort         text not null check (soort in ('uitnodiging', 'herinnering')),
  status        text not null default 'wacht'
                check (status in ('wacht', 'bezig', 'verzonden', 'fout')),
  pogingen      int not null default 0,
  fout          text,
  aangemaakt_at timestamptz not null default now(),
  bijgewerkt_at timestamptz not null default now()
);

create table public.herinneringen_verwerkt (
  verkiezing_id uuid not null references public.verkiezingen (id) on delete cascade,
  moment        timestamptz not null,
  primary key (verkiezing_id, moment)
);

-- ---------------------------------------------------------------------
-- Hulpfuncties voor rollen
-- ---------------------------------------------------------------------

-- Rol van de ingelogde gebruiker, alleen als tweestapsverificatie is gedaan.
create function public.mijn_rol() returns text
language sql stable security definer set search_path = '' as $$
  select t.rol
  from public.toegang t
  where t.user_id = auth.uid()
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create function public.is_beheerder() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.mijn_rol() = 'beheerder', false)
$$;

create function public.is_commissie() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.mijn_rol() in ('beheerder', 'commissie'), false)
$$;

-- Voor de inlogpagina: wie ben ik (ook vóór de tweede stap).
create function public.mijn_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('naam', t.naam, 'email', t.email, 'rol', t.rol)
  from public.toegang t
  where t.user_id = auth.uid()
$$;

create function private.mijn_naam() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select t.naam from public.toegang t where t.user_id = auth.uid()), 'systeem')
$$;

create function private.log(p_actie text, p_details jsonb, p_verkiezing uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.logboek (wie, actie, details, verkiezing_id)
  values (private.mijn_naam(), p_actie, p_details, p_verkiezing)
$$;

-- ---------------------------------------------------------------------
-- Accounts: alleen uitgenodigde adressen kunnen registreren
-- ---------------------------------------------------------------------

create function private.registratie_controleren() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.toegang where email = lower(new.email)) then
    raise exception 'Dit e-mailadres is niet uitgenodigd';
  end if;
  return new;
end $$;

create function private.registratie_koppelen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.toegang set user_id = new.id where email = lower(new.email);
  return new;
end $$;

create trigger or_registratie_controleren before insert on auth.users
  for each row execute function private.registratie_controleren();
create trigger or_registratie_koppelen after insert on auth.users
  for each row execute function private.registratie_koppelen();

-- ---------------------------------------------------------------------
-- Stemlinks: token = kiezer-id + HMAC met een geheime sleutel.
-- De sleutel staat in het privé schema; tokens worden nergens opgeslagen.
-- ---------------------------------------------------------------------

create function private.token_voor(p_kiezer uuid, p_versie int) returns text
language sql stable security definer set search_path = '' as $$
  select replace(p_kiezer::text, '-', '') ||
         substr(encode(extensions.hmac(convert_to(p_kiezer::text || ':' || p_versie::text, 'UTF8'),
                                       (select sleutel from private.geheim), 'sha256'), 'hex'), 1, 32)
$$;

create function private.kiezer_bij_token(p_token text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid;
  v_versie int;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  v_id := (substr(p_token, 1, 8) || '-' || substr(p_token, 9, 4) || '-' ||
           substr(p_token, 13, 4) || '-' || substr(p_token, 17, 4) || '-' ||
           substr(p_token, 21, 12))::uuid;
  select token_versie into v_versie from public.kiezers where id = v_id;
  if v_versie is null or private.token_voor(v_id, v_versie) <> p_token then
    return null;
  end if;
  return v_id;
end $$;

create function private.ongeldige_poging() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.ongeldige_pogingen default values;
  delete from private.ongeldige_pogingen where at < now() - interval '1 day';
  if (select count(*) from private.ongeldige_pogingen where at > now() - interval '10 minutes') >= 20
     and not exists (select 1 from public.meldingen
                     where soort = 'veel_ongeldige_links'
                       and aangemaakt_at > now() - interval '1 hour') then
    insert into public.meldingen (soort, omschrijving)
    values ('veel_ongeldige_links',
            'Meer dan 20 pogingen met een ongeldige stemlink in 10 minuten. Mogelijk probeert iemand links te raden.');
  end if;
end $$;

create function private.status_van(v public.verkiezingen) returns text
language sql stable as $$
  select case when now() < v.start_at then 'nog_niet_open'
              when now() >= v.eind_at then 'gesloten'
              else 'open' end
$$;

-- ---------------------------------------------------------------------
-- Openbare functies voor de stempagina (zonder inloggen)
-- ---------------------------------------------------------------------

create function public.stembiljet(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_kiezer uuid;
  k public.kiezers;
  v public.verkiezingen;
  a public.app_instellingen;
begin
  v_kiezer := private.kiezer_bij_token(p_token);
  if v_kiezer is null then
    perform private.ongeldige_poging();
    return jsonb_build_object('fout', 'ongeldig');
  end if;
  select * into k from public.kiezers where id = v_kiezer;
  select * into v from public.verkiezingen where id = k.verkiezing_id;
  select * into a from public.app_instellingen where id = 1;
  return jsonb_build_object(
    'titel', v.titel,
    'toelichting', v.toelichting,
    'start_at', v.start_at,
    'eind_at', v.eind_at,
    'status', private.status_van(v),
    'al_gestemd', k.gestemd,
    'organisatie', a.organisatie,
    'logo_url', a.logo_url,
    'kandidaten', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'naam', c.naam, 'functie', c.functie,
                                          'tekst', c.tekst, 'foto_url', c.foto_url)
                       order by c.volgorde, c.naam)
      from public.kandidaten c where c.verkiezing_id = v.id), '[]'::jsonb));
end $$;

create function public.stem_uitbrengen(
  p_token text, p_kandidaat uuid, p_onthouden boolean, p_naam text, p_email text
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_kiezer uuid;
  k public.kiezers;
  v public.verkiezingen;
  v_stem uuid;
  v_status text := 'geldig';
  v_email text := lower(trim(coalesce(p_email, '')));
  v_naam text := trim(coalesce(p_naam, ''));
begin
  v_kiezer := private.kiezer_bij_token(p_token);
  if v_kiezer is null then
    perform private.ongeldige_poging();
    return jsonb_build_object('fout', 'ongeldig');
  end if;

  -- Rij vergrendelen zodat twee gelijktijdige pogingen niet allebei slagen.
  select * into k from public.kiezers where id = v_kiezer for update;
  select * into v from public.verkiezingen where id = k.verkiezing_id;

  if k.gestemd then
    update public.meldingen
       set aantal = aantal + 1
     where kiezer_id = k.id and soort = 'opnieuw_geprobeerd' and status = 'open';
    if not found then
      insert into public.meldingen (verkiezing_id, soort, omschrijving, kiezer_id, ingevulde_naam, ingevulde_email)
      values (v.id, 'opnieuw_geprobeerd',
              'Iemand probeerde opnieuw te stemmen met een link die al gebruikt is. De eerste stem blijft gelden.',
              k.id, left(v_naam, 200), left(v_email, 200));
    end if;
    return jsonb_build_object('fout', 'al_gestemd');
  end if;

  if private.status_van(v) = 'nog_niet_open' then
    return jsonb_build_object('fout', 'nog_niet_open');
  elsif private.status_van(v) = 'gesloten' then
    return jsonb_build_object('fout', 'gesloten');
  end if;

  if (p_kandidaat is null) = (coalesce(p_onthouden, false) = false) then
    return jsonb_build_object('fout', 'geen_keuze');
  end if;
  if p_kandidaat is not null and not exists (
       select 1 from public.kandidaten where id = p_kandidaat and verkiezing_id = v.id) then
    return jsonb_build_object('fout', 'geen_keuze');
  end if;
  if v_naam = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('fout', 'gegevens');
  end if;

  if v_email <> k.email then
    v_status := 'apart';
  end if;

  insert into public.stemmen (verkiezing_id, kandidaat_id, status)
  values (v.id, p_kandidaat, v_status)
  returning id into v_stem;

  update public.kiezers set gestemd = true where id = k.id;

  if v_status = 'apart' then
    insert into public.meldingen (verkiezing_id, soort, omschrijving, kiezer_id, stem_id, ingevulde_naam, ingevulde_email)
    values (v.id, 'ander_emailadres',
            'Het ingevulde e-mailadres wijkt af van het adres waar de stemlink naartoe ging. De stem is apart gezet en telt pas mee na goedkeuring.',
            k.id, v_stem, left(v_naam, 200), left(v_email, 200));
  end if;

  return jsonb_build_object('ok', true, 'apart', v_status = 'apart');
end $$;

-- ---------------------------------------------------------------------
-- Kiescommissie
-- ---------------------------------------------------------------------

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

create function public.meldingen_lijst(p_verkiezing uuid)
returns table (id bigint, soort text, omschrijving text, kiezer_naam text, kiezer_email text,
               ingevulde_naam text, ingevulde_email text, aantal int, status text,
               afgehandeld_door text, afgehandeld_at timestamptz, aangemaakt_at timestamptz,
               heeft_stem boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_commissie() then
    raise exception 'Geen toegang';
  end if;
  return query
    select m.id, m.soort, m.omschrijving, k.naam, k.email, m.ingevulde_naam, m.ingevulde_email,
           m.aantal, m.status, m.afgehandeld_door, m.afgehandeld_at, m.aangemaakt_at,
           m.stem_id is not null
    from public.meldingen m
    left join public.kiezers k on k.id = m.kiezer_id
    where m.verkiezing_id = p_verkiezing or m.verkiezing_id is null
    order by (m.status = 'open') desc, m.id desc
    limit 200;
end $$;

create function public.melding_afhandelen(p_id bigint, p_besluit text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  m public.meldingen;
begin
  if not public.is_commissie() then
    raise exception 'Geen toegang';
  end if;
  select * into m from public.meldingen where id = p_id for update;
  if not found or m.status <> 'open' then
    raise exception 'Deze melding is al afgehandeld';
  end if;
  if p_besluit in ('goedgekeurd', 'afgekeurd') then
    if m.stem_id is null then
      raise exception 'Deze melding heeft geen stem om goed of af te keuren';
    end if;
    update public.stemmen
       set status = case when p_besluit = 'goedgekeurd' then 'geldig' else 'afgekeurd' end
     where id = m.stem_id and status = 'apart';
    -- Bij afkeuren mag de echte collega opnieuw stemmen met een nieuwe link;
    -- de oude link werkt dan niet meer.
    if p_besluit = 'afgekeurd' and m.kiezer_id is not null then
      update public.kiezers set gestemd = false, token_versie = token_versie + 1
       where id = m.kiezer_id;
    end if;
  elsif p_besluit <> 'gezien' then
    raise exception 'Onbekend besluit';
  end if;

  -- Verwijzing naar de stem wissen zodat de melding niet naar de keuze leidt.
  update public.meldingen
     set status = p_besluit, afgehandeld_door = private.mijn_naam(),
         afgehandeld_at = now(), stem_id = null
   where id = p_id;

  perform private.log('melding ' || p_besluit,
                      jsonb_build_object('melding', p_id, 'soort', m.soort), m.verkiezing_id);
end $$;

-- ---------------------------------------------------------------------
-- Beheer
-- ---------------------------------------------------------------------

create function public.kiezers_toevoegen(p_verkiezing uuid, p_lijst jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  r jsonb;
  v_email text;
  v_nieuw int := 0;
  v_dubbel int := 0;
  v_ongeldig int := 0;
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  if (select eind_at from public.verkiezingen where id = p_verkiezing) <= now() then
    raise exception 'Deze verkiezing is al gesloten';
  end if;
  for r in select * from jsonb_array_elements(p_lijst) loop
    v_email := lower(trim(coalesce(r ->> 'email', '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_ongeldig := v_ongeldig + 1;
      continue;
    end if;
    insert into public.kiezers (verkiezing_id, naam, email)
    values (p_verkiezing, left(trim(coalesce(r ->> 'naam', '')), 200), v_email)
    on conflict (verkiezing_id, email) do nothing;
    if found then
      v_nieuw := v_nieuw + 1;
    else
      v_dubbel := v_dubbel + 1;
      -- Stond er al zonder naam? Dan de naam aanvullen.
      update public.kiezers set naam = left(trim(r ->> 'naam'), 200)
       where verkiezing_id = p_verkiezing and email = v_email and naam = ''
         and trim(coalesce(r ->> 'naam', '')) <> '';
    end if;
  end loop;
  perform private.log('kiezers toegevoegd',
                      jsonb_build_object('nieuw', v_nieuw, 'dubbel', v_dubbel, 'ongeldig', v_ongeldig),
                      p_verkiezing);
  return jsonb_build_object('nieuw', v_nieuw, 'dubbel', v_dubbel, 'ongeldig', v_ongeldig);
end $$;

create function public.kiezer_verwijderen(p_kiezer uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  k public.kiezers;
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  select * into k from public.kiezers where id = p_kiezer for update;
  if k.gestemd then
    raise exception 'Deze collega heeft al gestemd en kan niet meer verwijderd worden';
  end if;
  delete from public.kiezers where id = p_kiezer;
  perform private.log('kiezer verwijderd', jsonb_build_object('email', k.email), k.verkiezing_id);
end $$;

-- Lijst voor Word-afdruk samenvoegen: naam, e-mail en persoonlijke link.
create function public.samenvoeglijst(p_verkiezing uuid, p_soort text)
returns table (naam text, email text, link text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_site text := (select rtrim(coalesce(site_url, ''), '/') from public.app_instellingen where id = 1);
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  if v_site = '' then
    raise exception 'Vul eerst het websiteadres in bij Huisstijl';
  end if;
  if p_soort not in ('uitnodiging', 'herinnering') then
    raise exception 'Onbekende soort';
  end if;
  if p_soort = 'uitnodiging' then
    update public.kiezers set uitgenodigd_at = coalesce(uitgenodigd_at, now())
     where verkiezing_id = p_verkiezing;
  end if;
  perform private.log('samenvoeglijst gemaakt', jsonb_build_object('soort', p_soort), p_verkiezing);
  return query
    select k.naam, k.email, v_site || '/stem.html#' || private.token_voor(k.id, k.token_versie)
    from public.kiezers k
    where k.verkiezing_id = p_verkiezing
      and (p_soort = 'uitnodiging' or not k.gestemd)
    order by k.naam, k.email;
end $$;

create function public.mail_inplannen(p_verkiezing uuid, p_soort text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_aantal int;
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  if (select verzendwijze from public.verkiezingen where id = p_verkiezing) <> 'outlook_automatisch' then
    raise exception 'Zet de verzendwijze eerst op "Outlook automatisch"';
  end if;
  v_aantal := private.mail_inplannen(p_verkiezing, p_soort);
  perform private.log(p_soort || ' ingepland', jsonb_build_object('aantal', v_aantal), p_verkiezing);
  return v_aantal;
end $$;

create function private.mail_inplannen(p_verkiezing uuid, p_soort text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_aantal int;
begin
  if p_soort = 'uitnodiging' then
    insert into public.mail_wachtrij (verkiezing_id, kiezer_id, soort)
    select k.verkiezing_id, k.id, 'uitnodiging'
    from public.kiezers k
    where k.verkiezing_id = p_verkiezing and k.uitgenodigd_at is null
      and not exists (select 1 from public.mail_wachtrij w
                      where w.kiezer_id = k.id and w.soort = 'uitnodiging' and w.status in ('wacht', 'bezig'));
  elsif p_soort = 'herinnering' then
    insert into public.mail_wachtrij (verkiezing_id, kiezer_id, soort)
    select k.verkiezing_id, k.id, 'herinnering'
    from public.kiezers k
    where k.verkiezing_id = p_verkiezing and not k.gestemd and k.uitgenodigd_at is not null
      and not exists (select 1 from public.mail_wachtrij w
                      where w.kiezer_id = k.id and w.status in ('wacht', 'bezig'));
  else
    raise exception 'Onbekende soort';
  end if;
  get diagnostics v_aantal = row_count;
  return v_aantal;
end $$;

-- Wordt elke 5 minuten door de planner aangeroepen (zie cron.sql).
create function private.herinneringen_inplannen() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select v.id, m.moment
    from public.verkiezingen v, unnest(v.herinneringen) as m(moment)
    where v.verzendwijze = 'outlook_automatisch'
      and m.moment <= now() and now() < v.eind_at and now() >= v.start_at
      and not exists (select 1 from public.herinneringen_verwerkt h
                      where h.verkiezing_id = v.id and h.moment = m.moment)
  loop
    insert into public.herinneringen_verwerkt values (r.id, r.moment);
    perform private.mail_inplannen(r.id, 'herinnering');
    insert into public.logboek (wie, actie, details, verkiezing_id)
    values ('systeem', 'herinnering ingepland', jsonb_build_object('moment', r.moment), r.id);
  end loop;
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

-- Alleen voor de mailfunctie (service role).
create function public.mail_wachtrij_pakken(p_max int)
returns table (id bigint, soort text, verkiezing_id uuid, naam text, email text, token text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.mail_wachtrij set status = 'wacht', bijgewerkt_at = now()
   where status = 'bezig' and bijgewerkt_at < now() - interval '10 minutes';
  return query
    with gekozen as (
      select w.id from public.mail_wachtrij w
      where w.status = 'wacht' and w.pogingen < 5
      order by w.id
      limit p_max
      for update skip locked
    ), bijgewerkt as (
      update public.mail_wachtrij w
         set status = 'bezig', pogingen = w.pogingen + 1, bijgewerkt_at = now()
        from gekozen g where w.id = g.id
      returning w.id, w.soort, w.verkiezing_id, w.kiezer_id
    )
    select b.id, b.soort, b.verkiezing_id, k.naam, k.email, private.token_voor(k.id, k.token_versie)
    from bijgewerkt b join public.kiezers k on k.id = b.kiezer_id;
end $$;

create function public.mail_resultaat(p_id bigint, p_ok boolean, p_fout text, p_opnieuw boolean)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  w public.mail_wachtrij;
begin
  update public.mail_wachtrij
     set status = case when p_ok then 'verzonden'
                       when p_opnieuw and pogingen < 5 then 'wacht'
                       else 'fout' end,
         fout = case when p_ok then null else left(p_fout, 500) end,
         bijgewerkt_at = now()
   where id = p_id
  returning * into w;
  if p_ok and w.soort = 'uitnodiging' then
    update public.kiezers set uitgenodigd_at = now() where id = w.kiezer_id;
  end if;
  if not p_ok and w.status = 'fout' then
    insert into public.meldingen (verkiezing_id, soort, omschrijving, kiezer_id)
    values (w.verkiezing_id, 'mail_mislukt', 'Een mail kon niet worden verstuurd: ' || left(coalesce(p_fout, ''), 300), w.kiezer_id);
  end if;
end $$;

create function public.commissie_uitnodigen(p_naam text, p_email text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or trim(coalesce(p_naam, '')) = '' then
    raise exception 'Vul een naam en een geldig e-mailadres in';
  end if;
  if (select count(*) from public.toegang where rol = 'commissie') >= 5 then
    raise exception 'De kiescommissie heeft al 5 leden';
  end if;
  -- Bestaat er al een account (bijv. eerder uit de commissie gehaald)? Dan meteen koppelen.
  insert into public.toegang (email, naam, rol, user_id)
  values (v_email, trim(p_naam), 'commissie', (select id from auth.users where lower(email) = v_email limit 1));
  perform private.log('commissielid uitgenodigd', jsonb_build_object('email', v_email), null);
end $$;

-- De kiescommissie met per lid of het account al actief is (e-mail bevestigd en wachtwoord gekozen).
create function public.commissie_lijst()
returns table (email text, naam text, rol text, uitgenodigd_at timestamptz, actief boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  return query
    select t.email, t.naam, t.rol, t.uitgenodigd_at,
           coalesce(u.email_confirmed_at is not null and coalesce(u.encrypted_password, '') <> '', false)
    from public.toegang t
    left join auth.users u on u.id = t.user_id
    order by t.rol, t.naam;
end $$;

create function public.commissie_verwijderen(p_email text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  delete from public.toegang where email = lower(p_email) and rol = 'commissie';
  if not found then
    raise exception 'Commissielid niet gevonden';
  end if;
  perform private.log('commissielid verwijderd', jsonb_build_object('email', lower(p_email)), null);
end $$;

-- ---------------------------------------------------------------------
-- Bewaking van wijzigingen
-- ---------------------------------------------------------------------

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

create trigger verkiezing_bewaken before insert or update or delete on public.verkiezingen
  for each row execute function private.verkiezing_bewaken();

create function private.kandidaat_bewaken() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_verkiezing uuid := case when tg_op = 'DELETE' then old.verkiezing_id else new.verkiezing_id end;
begin
  -- Bij het verwijderen van een hele verkiezing (cascade) is de verkiezing al weg.
  if (select start_at from public.verkiezingen where id = v_verkiezing) <= now() then
    raise exception 'Kandidaten liggen vast zodra de stemming is begonnen';
  end if;
  perform private.log('kandidaat ' || lower(tg_op),
                      jsonb_build_object('naam', case when tg_op = 'DELETE' then old.naam else new.naam end),
                      v_verkiezing);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger kandidaat_bewaken before insert or update or delete on public.kandidaten
  for each row execute function private.kandidaat_bewaken();

create function private.instellingen_loggen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.log('huisstijl gewijzigd',
                      jsonb_build_object('organisatie', new.organisatie, 'thema', new.thema), null);
  return new;
end $$;

create trigger instellingen_loggen after update on public.app_instellingen
  for each row execute function private.instellingen_loggen();

-- ---------------------------------------------------------------------
-- Rechten (Row Level Security)
-- ---------------------------------------------------------------------

alter table public.app_instellingen       enable row level security;
alter table public.toegang                enable row level security;
alter table public.verkiezingen           enable row level security;
alter table public.kandidaten             enable row level security;
alter table public.kiezers                enable row level security;
alter table public.stemmen                enable row level security;
alter table public.meldingen              enable row level security;
alter table public.logboek                enable row level security;
alter table public.mail_wachtrij          enable row level security;
alter table public.herinneringen_verwerkt enable row level security;

-- Geen policies op stemmen en herinneringen_verwerkt:
-- niemand kan die tabellen rechtstreeks lezen of wijzigen.

create policy "iedereen leest huisstijl" on public.app_instellingen
  for select using (true);
create policy "beheerder wijzigt huisstijl" on public.app_instellingen
  for update using (public.is_beheerder()) with check (public.is_beheerder());

create policy "commissie leest toegang" on public.toegang
  for select using (public.is_commissie());

create policy "commissie leest verkiezingen" on public.verkiezingen
  for select using (public.is_commissie());
create policy "beheerder maakt verkiezing" on public.verkiezingen
  for insert with check (public.is_beheerder());
create policy "beheerder wijzigt verkiezing" on public.verkiezingen
  for update using (public.is_beheerder()) with check (public.is_beheerder());
create policy "beheerder verwijdert verkiezing" on public.verkiezingen
  for delete using (public.is_beheerder());

create policy "commissie leest kandidaten" on public.kandidaten
  for select using (public.is_commissie());
create policy "beheerder maakt kandidaat" on public.kandidaten
  for insert with check (public.is_beheerder());
create policy "beheerder wijzigt kandidaat" on public.kandidaten
  for update using (public.is_beheerder()) with check (public.is_beheerder());
create policy "beheerder verwijdert kandidaat" on public.kandidaten
  for delete using (public.is_beheerder());

-- Alleen de beheerder ziet de kiezerslijst (nodig om hem te beheren).
create policy "beheerder leest kiezers" on public.kiezers
  for select using (public.is_beheerder());

create policy "commissie leest meldingen" on public.meldingen
  for select using (public.is_commissie());
create policy "commissie leest logboek" on public.logboek
  for select using (public.is_commissie());
create policy "beheerder leest wachtrij" on public.mail_wachtrij
  for select using (public.is_beheerder());

-- Functies: standaard voor niemand, daarna precies toekennen.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function public.stembiljet(text) to anon, authenticated;
grant execute on function public.stem_uitbrengen(text, uuid, boolean, text, text) to anon, authenticated;

grant execute on function public.mijn_rol(), public.is_beheerder(), public.is_commissie(),
                          public.mijn_account() to authenticated;
grant execute on function public.dashboard(uuid), public.melding_afhandelen(bigint, text),
                          public.meldingen_lijst(uuid),
                          public.kiezers_toevoegen(uuid, jsonb), public.kiezer_verwijderen(uuid),
                          public.samenvoeglijst(uuid, text), public.mail_inplannen(uuid, text),
                          public.commissie_uitnodigen(text, text), public.commissie_verwijderen(text),
                          public.commissie_lijst()
                          to authenticated;

grant execute on function public.stemmen_vernietigen(uuid), public.vernietigen_verlopen() to authenticated;

grant execute on function public.verkiezing_verwijderen(uuid, text) to authenticated;

grant execute on function public.mail_wachtrij_pakken(int), public.mail_resultaat(bigint, boolean, text, boolean)
  to service_role;

-- De website mag tabellen alleen lezen/schrijven waar een policy dat toestaat.
revoke all on all tables in schema public from anon;
grant select on public.app_instellingen to anon;

-- ---------------------------------------------------------------------
-- Opslag voor logo en kandidaatfoto's (alleen PNG/JPG/WebP, max 5 MB)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "beheerder uploadt media" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_beheerder());
create policy "beheerder wijzigt media" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_beheerder());
create policy "beheerder verwijdert media" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_beheerder());

-- ---------------------------------------------------------------------
-- Planner
-- ---------------------------------------------------------------------

-- Elke nacht om 03:15 de stemmen vernietigen waarvan de datum is bereikt.
do $do$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('or-stemmen-vernietigen', '15 3 * * *', 'select private.vernietigen_verlopen()');
exception when others then
  raise notice 'Planner (pg_cron) niet beschikbaar: %. Vernietigen gebeurt dan bij het openen van het beheerscherm.', sqlerrm;
end $do$;

-- ---------------------------------------------------------------------
-- De eerste beheerder. VERVANG het e-mailadres hieronder!
-- ---------------------------------------------------------------------

insert into public.toegang (email, naam, rol)
values (lower('JOUW-EMAIL@BEDRIJF.NL'), 'Voorzitter OR', 'beheerder');
