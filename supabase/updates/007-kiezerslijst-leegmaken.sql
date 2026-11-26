-- OR-VerkiezingsTeller · update 007: hele kiezerslijst in één keer verwijderen
-- Eenmalig uitvoeren in de SQL Editor van Supabase (Run). Kan veilig nog eens.
--
-- kiezers_leegmaken(): de beheerder haalt alle kiezers van één verkiezing weg,
-- bijvoorbeeld na een import met verkeerde namen. Alleen zolang er nog geen
-- stemlinks zijn verstuurd (ook niet via Word samenvoegen of de mailwachtrij)
-- en er nog niet is gestemd. Komt in het logboek. Stemmen blijven anoniem: er
-- wordt niets over stemmen gelezen of bewaard.

create or replace function public.kiezers_leegmaken(p_verkiezing uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_aantal integer;
begin
  if not public.is_beheerder() then
    raise exception 'Geen toegang';
  end if;
  -- De verkiezing vastzetten, zodat er niet tussendoor links of stemmen bijkomen.
  perform 1 from public.verkiezingen where id = p_verkiezing for update;
  if not found then
    raise exception 'Verkiezing niet gevonden';
  end if;
  if (select eind_at from public.verkiezingen where id = p_verkiezing) <= now() then
    raise exception 'Deze verkiezing is al gesloten';
  end if;
  -- Alleen zolang er nog geen enkele stemlink weg is en niemand heeft gestemd.
  if exists (select 1 from public.kiezers
              where verkiezing_id = p_verkiezing and (uitgenodigd_at is not null or gestemd))
     or exists (select 1 from public.mail_wachtrij where verkiezing_id = p_verkiezing)
     or exists (select 1 from public.stemmen where verkiezing_id = p_verkiezing) then
    raise exception 'De stemlinks zijn al (deels) verstuurd of er is al gestemd. De hele lijst kan daarom niet meer worden verwijderd; haal kiezers dan een voor een weg.';
  end if;
  delete from public.kiezers where verkiezing_id = p_verkiezing;
  get diagnostics v_aantal = row_count;
  perform private.log('kiezerslijst geleegd', jsonb_build_object('kiezers', v_aantal), p_verkiezing);
  return v_aantal;
end $$;

revoke all on function public.kiezers_leegmaken(uuid) from public, anon;
grant execute on function public.kiezers_leegmaken(uuid) to authenticated;
