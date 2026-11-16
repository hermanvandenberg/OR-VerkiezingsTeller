// OR-VerkiezingsTeller · commissie-uitnodigen
// Mailt een commissielid een uitnodiging met een link om een account te maken.
// Alleen de ingelogde beheerder (met tweestapsverificatie) mag dit gebruiken, en
// alleen voor adressen die al in de lijst van de kiescommissie staan.
// Na de link kiest het lid een wachtwoord en stelt het tweestapsverificatie in.
//
// Aanmaken: Edge Functions > Deploy a new function > Via editor, naam
// "commissie-uitnodigen". "Verify JWT" mag aan blijven. Geen extra geheimen nodig.
// De tekst van de mail staat in Supabase bij Authentication > Emails > Invite user
// (zie supabase/mail-sjablonen/uitnodiging-commissie.html).

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// Geeft de naam van de beheerder terug, of null als de aanroeper geen beheerder is.
async function beheerder(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data: { user } } = await db.auth.getUser(jwt);
  if (!user) return null;
  try {
    const claims = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (claims.aal !== "aal2") return null;
  } catch {
    return null;
  }
  const { data } = await db.from("toegang").select("rol, naam").eq("user_id", user.id).maybeSingle();
  return data?.rol === "beheerder" ? data.naam : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ code: "alleen_post" }, 405);
  const wie = await beheerder(req);
  if (!wie) return json({ code: "geen_toegang" }, 403);

  const email = String((await req.json().catch(() => ({}))).email ?? "").trim().toLowerCase();
  const { data: lid } = await db.from("toegang").select("naam, rol").eq("email", email).maybeSingle();
  if (!lid || lid.rol !== "commissie") return json({ code: "onbekend" });

  const { data: inst } = await db.from("app_instellingen").select("site_url, organisatie").eq("id", 1).maybeSingle();
  const site = String(inst?.site_url ?? "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(site)) return json({ code: "geen_site" });

  const { error } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${site}/index.html`,
    data: { naam: lid.naam, organisatie: inst?.organisatie ?? "" },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return json({ code: "al_geregistreerd" });
    if (/rate limit/i.test(error.message)) return json({ code: "limiet" });
    return json({ code: "mail_mislukt", detail: error.message.slice(0, 200) });
  }
  await db.from("logboek").insert({ wie, actie: "uitnodiging commissielid gemaild", details: { email } }).then(() => {}, () => {});
  return json({ ok: true });
});
