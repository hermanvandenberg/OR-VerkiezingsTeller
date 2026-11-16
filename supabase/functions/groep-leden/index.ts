// OR-VerkiezingsTeller · groep-leden
// Zoekt een verzamelmail (distributiegroep of Microsoft 365-groep) in Microsoft 365
// en geeft de namen en e-mailadressen van de leden terug, ook van groepen in groepen.
// Alleen de ingelogde beheerder (met tweestapsverificatie) mag dit gebruiken.
// De functie leest alleen; er wordt niets in Microsoft 365 gewijzigd.
//
// Aanmaken: Edge Functions > Deploy a new function > Via editor, naam "groep-leden".
// "Verify JWT" mag aan blijven.
//
// Benodigde geheimen (dezelfde als bij mail-verwerken):
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
// De app-registratie heeft deze extra machtigingen nodig (Application, met admin consent):
//   Microsoft Graph > GroupMember.Read.All en User.ReadBasic.All

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_LEDEN = 5000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function isBeheerder(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: { user } } = await db.auth.getUser(jwt);
  if (!user) return false;
  try {
    const claims = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (claims.aal !== "aal2") return false;
  } catch {
    return false;
  }
  const { data } = await db.from("toegang").select("rol").eq("user_id", user.id).maybeSingle();
  return data?.rol === "beheerder";
}

async function graphToken(): Promise<string> {
  const tenant = Deno.env.get("MS_TENANT_ID"), id = Deno.env.get("MS_CLIENT_ID"), geheim = Deno.env.get("MS_CLIENT_SECRET");
  if (!tenant || !id || !geheim) throw new Fout("niet_ingesteld");
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id, client_secret: geheim, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Fout("inloggen_mislukt");
  return (await res.json()).access_token;
}

class Fout extends Error {}

async function graph(token: string, url: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } });
  if (res.status === 403 || res.status === 401) throw new Fout("geen_machtiging");
  if (res.status === 404) throw new Fout("niet_gevonden");
  if (!res.ok) throw new Fout("graph_fout");
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ fout: "Alleen POST" }, 405);
  if (!(await isBeheerder(req))) return json({ code: "geen_toegang" }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const token = await graphToken();

    // 1. Groepen zoeken op naam of e-mailadres.
    if (typeof body.zoek === "string") {
      const zoek = body.zoek.replace(/["\\]/g, "").trim().slice(0, 100);
      if (zoek.length < 2) return json({ groepen: [] });
      const q = encodeURIComponent(`"displayName:${zoek}" OR "mail:${zoek}"`);
      const data = await graph(token, `${GRAPH}/groups?$search=${q}&$select=id,displayName,mail&$top=25`);
      return json({ groepen: (data.value ?? []).map((g: any) => ({ id: g.id, naam: g.displayName ?? "", email: g.mail ?? "" })) });
    }

    // 2. Leden van één groep ophalen (ook leden van groepen binnen de groep).
    const id = String(body.groep ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ code: "ongeldig" }, 400);
    const leden: { naam: string; email: string }[] = [];
    let zonderMail = 0;
    let url: string | null = `${GRAPH}/groups/${id}/transitiveMembers/microsoft.graph.user?$select=displayName,mail&$top=999&$count=true`;
    while (url && leden.length < MAX_LEDEN) {
      const data: any = await graph(token, url);
      for (const u of data.value ?? []) {
        if (u.mail) leden.push({ naam: u.displayName ?? "", email: u.mail });
        else zonderMail++;
      }
      url = data["@odata.nextLink"] ?? null;
    }
    return json({ leden, zonderMail });
  } catch (e) {
    return json({ code: e instanceof Fout ? e.message : "graph_fout" }, 200);
  }
});
