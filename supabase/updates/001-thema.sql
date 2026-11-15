-- OR-VerkiezingsTeller · update: thema van de bedrijfswebsite
-- Eenmalig uitvoeren in Supabase > SQL Editor als je de database al eerder
-- hebt aangemaakt met schema.sql (nieuwe installaties hebben dit al).

alter table public.app_instellingen
  add column if not exists thema jsonb,
  add column if not exists bedrijf_website text;

create or replace function private.instellingen_loggen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.log('huisstijl gewijzigd',
                      jsonb_build_object('organisatie', new.organisatie, 'thema', new.thema), null);
  return new;
end $$;
