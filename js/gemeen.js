// Gedeelde hulpfuncties voor alle pagina's.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { pasThemaToe } from "./thema.js";

// Sessie alleen in dit tabblad bewaren: sluit je de browser, dan ben je uitgelogd.
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, storage: window.sessionStorage },
});

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Veilig elementen bouwen zonder innerHTML.
export function el(tag, props = {}, ...kinderen) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kind of kinderen.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    e.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
  return e;
}

const datumTijd = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});
const kortFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam",
});
export const fmtDatum = (iso) => (iso ? datumTijd.format(new Date(iso)) : "");
export const fmtKort = (iso) => (iso ? kortFmt.format(new Date(iso)) : "");

// <input type="datetime-local"> <-> ISO, in de tijdzone van de browser.
export function naarLokaal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const vanLokaal = (waarde) => (waarde ? new Date(waarde).toISOString() : null);

export function initialen(naam) {
  // "Sanne de Vries" -> "SV": eerste en laatste woord met een hoofdletter.
  const woorden = String(naam || "?").split(/\s+/).filter(Boolean);
  const hoofd = woorden.filter((w) => /^\p{Lu}/u.test(w));
  const kies = hoofd.length ? hoofd : woorden;
  return (kies[0][0] + (kies.length > 1 ? kies[kies.length - 1][0] : "")).toUpperCase();
}

export function fotoOf(naam, url, index, extraClass = "") {
  if (url) return el("img", { class: `foto ${extraClass}`, src: url, alt: `Foto van ${naam}` });
  return el("div", { class: `foto c${index % 4} ${extraClass}`, "aria-hidden": "true" }, initialen(naam));
}

export function foutTekst(fout) {
  const m = fout?.message || String(fout || "Onbekende fout");
  if (/JWT|permission denied|Geen toegang/i.test(m)) return "Je hebt hier geen toegang toe. Log opnieuw in.";
  return m;
}

export async function laadHuisstijl() {
  const { data } = await db.from("app_instellingen").select("*").eq("id", 1).maybeSingle();
  if (data?.thema) pasThemaToe(data.thema);
  for (const img of $$("img.logo")) {
    if (data?.logo_url) { img.src = data.logo_url; img.alt = data.organisatie || "Logo"; img.hidden = false; }
    else img.hidden = true;
  }
  return data || {};
}

// Controleert login + tweestapsverificatie + rol. Stuurt anders naar de inlogpagina.
export async function vereisLogin(nodigeRol) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return naarInloggen();
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") return naarInloggen();
  const { data: account, error } = await db.rpc("mijn_account");
  if (error || !account) return naarInloggen();
  if (nodigeRol === "beheerder" && account.rol !== "beheerder") {
    location.replace("dashboard.html");
    return new Promise(() => {});
  }
  return account;
}

function naarInloggen() {
  location.replace("index.html");
  return new Promise(() => {});
}

export async function uitloggen() {
  await db.auth.signOut();
  location.replace("index.html");
}

// Bestand laten downloaden.
export function download(naam, inhoud, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["﻿", inhoud], { type }));
  const a = el("a", { href: url, download: naam });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.parentNode?.removeChild(a); }, 1000);
}

export function csvRegel(waarden, scheiding = ";") {
  return waarden.map((w) => {
    const s = String(w ?? "");
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(scheiding);
}
