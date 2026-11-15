// OR-VerkiezingsTeller · mail-verwerken
// Verstuurt uitnodigingen en herinneringen uit de wachtrij via Microsoft Graph,
// vanaf het Outlook-adres van de voorzitter. Wordt elke minuut door de planner
// aangeroepen (zie supabase/cron.sql) en verstuurt per keer maximaal 25 mails,
// binnen de limiet van Exchange Online (30 per minuut).
//
// Benodigde geheimen (Edge Functions > Secrets):
//   CRON_GEHEIM       zelfgekozen lang wachtwoord, ook ingevuld in cron.sql
//   MS_TENANT_ID      Directory (tenant) ID van de app-registratie
//   MS_CLIENT_ID      Application (client) ID
//   MS_CLIENT_SECRET  Client secret
//   MS_AFZENDER       e-mailadres van de voorzitter, bv. voorzitter.or@bedrijf.nl
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn er automatisch.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BATCH = 25;

function env(naam: string): string {
  const w = Deno.env.get(naam);
  if (!w) throw new Error(`Geheim ${naam} ontbreekt`);
  return w;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function gelijk(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

const datumFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});

async function graphToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${env("MS_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("MS_CLIENT_ID"),
        client_secret: env("MS_CLIENT_SECRET"),
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!res.ok) throw new Error(`Inloggen bij Microsoft mislukt (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

type Verkiezing = {
  titel: string; toelichting: string | null; eind_at: string;
  kandidaten: { naam: string; functie: string | null; foto_url: string | null }[];
};

function bouwMail(
  soort: string, naam: string, link: string, v: Verkiezing,
  inst: { organisatie: string; logo_url: string | null; kleur: string },
) {
  const kleur = /^#[0-9a-fA-F]{6}$/.test(inst.kleur) ? inst.kleur : "#0d5f63";
  const eind = datumFmt.format(new Date(v.eind_at));
  const aanhef = naam ? `Beste ${esc(naam.split(" ")[0])},` : "Beste collega,";
  const onderwerp = soort === "herinnering"
    ? `Nog niet gestemd? De OR-verkiezing sluit ${eind}`
    : `Stem voor de vacante OR-zetel: ${v.kandidaten.map((k) => k.naam.split(" ")[0]).join(" of ")}?`;

  const kandidaten = v.kandidaten.map((k) => `
    <td width="50%" valign="top" style="padding:6px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #d3dae4;border-radius:8px">
        <tr>
          <td width="60" style="padding:10px">${
            k.foto_url
              ? `<img src="${esc(k.foto_url)}" width="52" height="52" alt="" style="display:block;border-radius:6px;object-fit:cover">`
              : `<div style="width:52px;height:52px;border-radius:6px;background:${kleur}"></div>`
          }</td>
          <td style="padding:10px 10px 10px 0;font:14px Arial,sans-serif;color:#16202c"><b>${esc(k.naam)}</b><br>${esc(k.functie ?? "")}</td>
        </tr>
      </table>
    </td>`).join("");

  const intro = soort === "herinnering"
    ? `Je hebt nog niet gestemd voor de tussentijdse OR-verkiezing. Stemmen kan nog tot <b>${esc(eind)}</b>.`
    : `Er is één zetel vrij in de ondernemingsraad. Dit zijn de kandidaten:`;

  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f8">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f5f8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #d3dae4;border-radius:10px">
<tr><td style="padding:24px 24px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    ${inst.logo_url ? `<td style="padding-right:12px"><img src="${esc(inst.logo_url)}" height="40" alt="${esc(inst.organisatie)}" style="display:block"></td>` : ""}
    <td style="font:bold 18px Arial,sans-serif;color:#16202c">${esc(v.titel)}</td>
  </tr></table>
</td></tr>
<tr><td style="padding:8px 24px;font:15px/1.5 Arial,sans-serif;color:#16202c">
  <p style="margin:0 0 12px">${aanhef}</p>
  <p style="margin:0 0 12px">${intro}</p>
</td></tr>
<tr><td style="padding:0 18px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>${kandidaten}</tr></table></td></tr>
<tr><td style="padding:18px 24px">
  <a href="${esc(link)}" style="display:inline-block;background:${kleur};color:#ffffff;font:bold 15px Arial,sans-serif;text-decoration:none;padding:12px 22px;border-radius:6px">Breng mijn stem uit</a>
</td></tr>
<tr><td style="padding:0 24px 24px;font:13px/1.5 Arial,sans-serif;color:#5a6676">
  Deze link is persoonlijk en werkt één keer. Stuur hem niet door.<br>
  Open tot ${esc(eind)}.<br><br>
  Werkt de knop niet? Kopieer dan deze link naar je browser:<br>
  <span style="word-break:break-all">${esc(link)}</span>
</td></tr>
</table></td></tr></table></body></html>`;
  return { onderwerp, html };
}

// Zelfde regel als op de website: witte tekst, kleur zo nodig iets donkerder.
function knopKleur(hex: unknown): string {
  const m = String(hex ?? "").match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return "#0d5f63";
  const rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const lum = (c: number[]) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (let i = 0; i <= 6; i++) {
    const k = rgb.map((v) => v * (1 - i * 0.06));
    if (1.05 / (lum(k) + 0.05) >= 4.5) return "#" + k.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  }
  return "#0d5f63";
}

Deno.serve(async (req) => {
  const geheim = req.headers.get("x-cron-geheim") ?? "";
  if (!gelijk(geheim, env("CRON_GEHEIM"))) {
    return new Response("Geen toegang", { status: 401 });
  }

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const { data: rijen, error } = await db.rpc("mail_wachtrij_pakken", { p_max: BATCH });
  if (error) return new Response(error.message, { status: 500 });
  if (!rijen?.length) return Response.json({ verzonden: 0 });

  const { data: inst } = await db.from("app_instellingen").select("*").eq("id", 1).single();
  const site = String(inst?.site_url ?? "").replace(/\/+$/, "");

  let token: string;
  try {
    token = await graphToken();
  } catch (e) {
    for (const r of rijen) await db.rpc("mail_resultaat", { p_id: r.id, p_ok: false, p_fout: String(e), p_opnieuw: true });
    return new Response(String(e), { status: 502 });
  }

  const cache = new Map<string, Verkiezing>();
  async function verkiezing(id: string): Promise<Verkiezing> {
    if (!cache.has(id)) {
      const { data: v } = await db.from("verkiezingen").select("titel, toelichting, eind_at").eq("id", id).single();
      const { data: k } = await db.from("kandidaten").select("naam, functie, foto_url").eq("verkiezing_id", id).order("volgorde");
      cache.set(id, { ...(v as Omit<Verkiezing, "kandidaten">), kandidaten: k ?? [] });
    }
    return cache.get(id)!;
  }

  const afzender = env("MS_AFZENDER");
  let verzonden = 0;
  let wachten = false;

  for (const r of rijen) {
    if (wachten) {
      await db.rpc("mail_resultaat", { p_id: r.id, p_ok: false, p_fout: "uitgesteld", p_opnieuw: true });
      continue;
    }
    const v = await verkiezing(r.verkiezing_id);
    const { onderwerp, html } = bouwMail(r.soort, r.naam, `${site}/stem.html#${r.token}`, v, {
      organisatie: inst?.organisatie ?? "OR", logo_url: inst?.logo_url ?? null,
      kleur: knopKleur(inst?.thema?.primair),
    });
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(afzender)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: onderwerp,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: r.email, name: r.naam || r.email } }],
        },
        saveToSentItems: false,
      }),
    });
    if (res.status === 202) {
      verzonden++;
      await db.rpc("mail_resultaat", { p_id: r.id, p_ok: true, p_fout: null, p_opnieuw: false });
    } else {
      const fout = `${res.status} ${await res.text()}`;
      // 429 = te veel tegelijk: de rest volgende minuut opnieuw proberen.
      const opnieuw = res.status === 429 || res.status >= 500;
      if (res.status === 429) wachten = true;
      await db.rpc("mail_resultaat", { p_id: r.id, p_ok: false, p_fout: fout, p_opnieuw: opnieuw });
    }
  }

  return Response.json({ verzonden });
});
