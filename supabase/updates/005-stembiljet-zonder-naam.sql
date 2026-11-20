-- OR-VerkiezingsTeller · update 005: stemmen zonder naam en e-mailadres
-- Eenmalig uitvoeren in de SQL Editor van Supabase (Run). Kan veilig nog eens.
--
-- Collega's vullen op het stembiljet geen naam en e-mailadres meer in. De
-- persoonlijke stemlink is de controle; een stem telt meteen mee en wordt niet
-- meer apart gezet. Voer dit uit vóórdat je de nieuwe website live zet.

create or replace function public.stem_uitbrengen(
  p_token text, p_kandidaat uuid, p_onthouden boolean,
  -- p_naam en p_email worden niet meer gebruikt. Ze staan er nog zodat een
  -- oude, nog openstaande stempagina ook blijft werken.
  p_naam text default null, p_email text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_kiezer uuid;
  k public.kiezers;
  v public.verkiezingen;
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
      insert into public.meldingen (verkiezing_id, soort, omschrijving, kiezer_id)
      values (v.id, 'opnieuw_geprobeerd',
              'Iemand probeerde opnieuw te stemmen met een link die al gebruikt is. De eerste stem blijft gelden.',
              k.id);
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

  -- De persoonlijke link is de controle: de stem telt meteen mee.
  insert into public.stemmen (verkiezing_id, kandidaat_id, status)
  values (v.id, p_kandidaat, 'geldig');

  update public.kiezers set gestemd = true where id = k.id;

  return jsonb_build_object('ok', true, 'apart', false);
end $$;

grant execute on function public.stem_uitbrengen(text, uuid, boolean, text, text) to anon, authenticated;
