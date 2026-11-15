// OR-VerkiezingsTeller · thema-ophalen
// Haalt een bedrijfswebsite op en stelt een thema voor: kleuren, lettertype en logo's.
// Alleen de ingelogde beheerder (met tweestapsverificatie) mag dit gebruiken.
// De browser kan andere websites niet zelf lezen (CORS), daarom gebeurt het hier.
//
// Aanmaken: Edge Functions > Deploy a new function > Via editor, naam "thema-ophalen",
// met de bestanden index.ts en herken.ts. "Verify JWT" mag aan blijven.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { herkenThema } from "./herken.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_HTML = 3_000_000;
const MAX_CSS = 1_500_000;
const MAX_AFBEELDING = 1_000_000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/* ---------- Veilig ophalen: alleen openbare websites ---------- */

function priveIp(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l === "::" ||
      l.startsWith("::ffff:") && priveIp(l.slice(7));
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function controleerAdres(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Alleen http- en https-adressen");
  if (u.username || u.password) throw new Error("Adres met inloggegevens is niet toegestaan");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("Alleen standaardpoorten");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new Error("Dit adres is niet toegestaan");
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (priveIp(host)) throw new Error("Dit adres is niet toegestaan");
  } else {
    try {
      const ips = [
        ...(await Deno.resolveDns(host, "A").catch(() => [] as string[])),
        ...(await Deno.resolveDns(host, "AAAA").catch(() => [] as string[])),
      ];
      if (ips.some(priveIp)) throw new Error("Dit adres is niet toegestaan");
    } catch (e) {
      if (String(e).includes("niet toegestaan")) throw e;
    }
  }
  return u;
}

async function haal(url: string, maxBytes: number, accept: string): Promise<{ data: Uint8Array; type: string; url: string }> {
  let huidig = url;
  for (let stap = 0; stap < 4; stap++) {
    const u = await controleerAdres(huidig);
    const res = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OR-VerkiezingsTeller/1.0)", Accept: accept },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      huidig = new URL(res.headers.get("location")!, u).href;
      await res.body?.cancel();
      continue;
    }
    if (!res.ok) throw new Error(`De website gaf foutcode ${res.status}`);
    const reader = res.body!.getReader();
    const delen: Uint8Array[] = [];
    let totaal = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totaal += value.length;
      if (totaal > maxBytes) { await reader.cancel(); break; }
      delen.push(value);
    }
    const data = new Uint8Array(Math.min(totaal, maxBytes));
    let pos = 0;
    for (const d of delen) { data.set(d.subarray(0, data.length - pos), pos); pos += d.length; if (pos >= data.length) break; }
    return { data, type: res.headers.get("content-type") ?? "", url: u.href };
  }
  throw new Error("Te veel doorverwijzingen");
}

const tekst = (d: Uint8Array) => new TextDecoder().decode(d);

function base64(d: Uint8Array): string {
  let s = "";
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  return btoa(s);
}

/* ---------- Toegang ---------- */

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

/* ---------- Functie ---------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ fout: "Alleen POST" }, 405);
  if (!(await isBeheerder(req))) return json({ fout: "Alleen de beheerder kan een thema ophalen." }, 403);

  let adres = "";
  try {
    adres = String((await req.json()).url ?? "").trim();
    if (!/^https?:\/\//i.test(adres)) adres = "https://" + adres;
    const pagina = await haal(adres, MAX_HTML, "text/html,application/xhtml+xml");
    const html = tekst(pagina.data);
    const eerste = herkenThema(html, pagina.url);

    // Stylesheets erbij halen voor betere kleuren en lettertypen.
    const css = (await Promise.all(eerste.stylesheets.map((s) =>
      haal(s, MAX_CSS, "text/css").then((r) => tekst(r.data)).catch(() => "")))).filter(Boolean);
    const herkend = herkenThema(html, pagina.url, css);

    // Logo's als data-URL meegeven, zodat de browser ze kan tonen en opslaan.
    const logos: string[] = [];
    for (const svg of herkend.inlineSvgLogos) {
      const metNs = svg.includes("xmlns=") ? svg : svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
      logos.push("data:image/svg+xml;base64," + base64(new TextEncoder().encode(metNs)));
    }
    for (const u of herkend.logoUrls) {
      if (logos.length >= 5) break;
      try {
        const r = await haal(u, MAX_AFBEELDING, "image/*");
        const type = r.type.split(";")[0].trim().toLowerCase();
        if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(type)) continue;
        logos.push(`data:${type};base64,${base64(r.data)}`);
      } catch { /* logo overslaan */ }
    }

    return json({
      bron: pagina.url,
      naam: herkend.naam,
      kleuren: herkend.kleuren,
      primair: herkend.primair,
      accent: herkend.accent,
      lettertypen: herkend.lettertypen,
      logos,
    });
  } catch (e) {
    return json({ fout: `De website ${adres} kon niet worden gelezen: ${e instanceof Error ? e.message : e}` }, 422);
  }
});
