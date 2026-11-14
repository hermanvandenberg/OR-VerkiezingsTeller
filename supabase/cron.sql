-- =====================================================================
-- OR-VerkiezingsTeller · automatisch mailen via Outlook (optioneel)
-- Alleen nodig als je kiest voor "Outlook automatisch".
-- Draai dit pas NADAT de functie "mail-verwerken" is aangemaakt.
-- Zie README.md, stap 7.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Vul hieronder twee waarden in:
--  1. het adres van de functie (Edge Functions > mail-verwerken > URL)
--  2. hetzelfde geheime wachtwoord dat je als CRON_GEHEIM bij de functie zette
select vault.create_secret('https://JOUW-PROJECT.supabase.co/functions/v1/mail-verwerken', 'mail_functie_url');
select vault.create_secret('VUL-HIER-HETZELFDE-CRON_GEHEIM-IN', 'cron_geheim');

-- Elke 5 minuten: herinneringen inplannen waarvan het moment is aangebroken.
select cron.schedule('or-herinneringen', '*/5 * * * *', $$ select private.herinneringen_inplannen() $$);

-- Elke minuut: als er mails klaarstaan, de mailfunctie een batch laten versturen.
select cron.schedule('or-mail-verwerken', '* * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'mail_functie_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-geheim', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_geheim')),
    body    := '{}'::jsonb)
  where exists (select 1 from public.mail_wachtrij where status = 'wacht')
$$);
