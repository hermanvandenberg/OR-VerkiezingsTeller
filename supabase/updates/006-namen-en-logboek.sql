-- OR-VerkiezingsTeller · update 006: namen aanpassen en logboek leegmaken
-- Eenmalig uitvoeren in de SQL Editor van Supabase (Run). Kan veilig nog eens.
--
-- 1. naam_wijzigen(): de beheerder past de naam van zichzelf of van een
--    commissielid aan. Komt in het logboek.
-- 2. logboek_leegmaken(): de beheerder maakt het logboek leeg, bijvoorbeeld na
--    het testen. Alleen als er geen verkiezing loopt of afgelopen is (alleen nog
--    toekomstige); er blijft één regel staan dat het logboek is geleegd.

create or replace function public.naam_wijzigen(p_email text, p_naam text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_naam text := btrim(coalesce(p_naam, ''));
  v_oud text;
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  if v_naam = '' or length(v_naam) > 100 then
    raise exception 'Vul een naam in van maximaal 100 tekens.';
  end if;
  select naam into v_oud from public.toegang where email = lower(btrim(p_email)) for update;
  if not found then
    raise exception 'Niet gevonden in de kiescommissie';
  end if;
  if v_oud = v_naam then
    return;
  end if;
  update public.toegang set naam = v_naam where email = lower(btrim(p_email));
  perform private.log('naam gewijzigd', jsonb_build_object('oud', v_oud, 'nieuw', v_naam), null);
end $$;

create or replace function public.logboek_leegmaken() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_aantal integer;
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  -- Eén tegelijk, zodat er niet tussendoor een verkiezing of stem bijkomt.
  lock table public.verkiezingen, public.stemmen in share mode;
  -- Alleen verkiezingen die nog moeten beginnen mogen er staan: van een lopende
  -- of afgelopen verkiezing blijft het logboek altijd bewaard.
  if exists (select 1 from public.verkiezingen v where private.status_van(v) <> 'nog_niet_open')
     or exists (select 1 from public.stemmen) then
    raise exception 'Er staat nog een verkiezing die open is of al gesloten is. Verwijder eerst je testverkiezingen; het logboek van een echte verkiezing blijft bewaard.';
  end if;
  delete from public.logboek;
  get diagnostics v_aantal = row_count;
  perform private.log('logboek geleegd', jsonb_build_object('regels', v_aantal), null);
  return v_aantal;
end $$;

revoke all on function public.naam_wijzigen(text, text) from public, anon;
revoke all on function public.logboek_leegmaken() from public, anon;
grant execute on function public.naam_wijzigen(text, text), public.logboek_leegmaken() to authenticated;
