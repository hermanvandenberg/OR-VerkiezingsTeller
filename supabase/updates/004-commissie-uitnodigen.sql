-- OR-VerkiezingsTeller · update 004: uitnodigingsmail voor commissieleden
-- Eenmalig uitvoeren in de SQL Editor van Supabase (Run). Kan veilig nog eens.
--
-- 1. commissie_lijst(): de kiescommissie met per lid of het account al actief is
--    (e-mail bevestigd en een wachtwoord gekozen). Alleen voor de beheerder.
-- 2. commissie_uitnodigen(): koppelt meteen een bestaand account, bijvoorbeeld
--    als iemand eerder uit de commissie is gehaald en weer wordt toegevoegd.

create or replace function public.commissie_lijst()
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

revoke all on function public.commissie_lijst() from public, anon;
grant execute on function public.commissie_lijst() to authenticated;

create or replace function public.commissie_uitnodigen(p_naam text, p_email text) returns void
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
  insert into public.toegang (email, naam, rol, user_id)
  values (v_email, trim(p_naam), 'commissie', (select id from auth.users where lower(email) = v_email limit 1));
  perform private.log('commissielid uitgenodigd', jsonb_build_object('email', v_email), null);
end $$;
