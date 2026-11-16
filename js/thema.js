// Thema: huisstijlkleuren en lettertype toepassen op alle pagina's.

export const STANDAARD = { primair: "#0d5f63", accent: "#c4302b", lettertype: "" };

// Lettertypen die via Google Fonts geladen mogen worden.
export const LETTERTYPEN = [
  "Public Sans", "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Source Sans 3",
  "Nunito Sans", "Poppins", "Work Sans", "IBM Plex Sans", "Noto Sans", "Raleway", "Barlow",
];

export function naarRgb(hex) {
  const m = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}
export const naarHex = (rgb) => "#" + rgb.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")).join("");
export const meng = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function lum(rgb) {
  const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Kleur net zo lang lichter/donkerder maken tot hij leesbaar is op de achtergrond.
function leesbaar(kleur, achtergrond, doel = 4.5) {
  let k = kleur;
  const richting = lum(achtergrond) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  for (let i = 0; i < 20 && contrast(k, achtergrond) < doel; i++) k = meng(k, richting, 0.1);
  return k;
}

const LICHT = { bg: [243, 245, 248], surface: [255, 255, 255] };
const DONKER = { bg: [16, 22, 29], surface: [24, 33, 43] };

export function themaVariabelen(thema, donker) {
  const p = naarRgb(thema?.primair) || naarRgb(STANDAARD.primair);
  const a = naarRgb(thema?.accent) || naarRgb(STANDAARD.accent);
  const g = donker ? DONKER : LICHT;
  // Knoppen: de kleur zelf, met witte of donkere tekst afhankelijk van het contrast.
  // Liefst witte tekst op de knop: kleur zo nodig iets donkerder maken (max. 30%).
  let knop = donker ? leesbaar(p, g.bg, 3) : p;
  let opKnop = [12, 17, 23];
  if (!donker) {
    let k = p;
    for (let i = 0; i <= 5 && contrast(k, [255, 255, 255]) < 4.5; i++) k = meng(p, [0, 0, 0], (i + 1) * 0.06);
    if (contrast(k, [255, 255, 255]) >= 4.5) { knop = k; opKnop = [255, 255, 255]; }
  }
  const tekst = leesbaar(p, g.surface, 4.5);
  const accent = leesbaar(a, g.surface, 3);
  return {
    "--petrol": naarHex(tekst),
    "--knop": naarHex(knop),
    "--on-petrol": naarHex(opKnop),
    "--petrol-soft": naarHex(meng(p, g.surface, donker ? 0.75 : 0.86)),
    "--rood": naarHex(accent),
    "--rood-soft": naarHex(meng(a, g.surface, donker ? 0.7 : 0.85)),
  };
}

// Donker als de gebruiker dat koos, of bij "auto" als het apparaat donker staat.
export function isDonker() {
  const modus = document.documentElement.getAttribute("data-modus");
  if (modus === "donker") return true;
  if (modus === "licht") return false;
  return !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

let huidigThema = null;
let luistert = false;
function zetKleuren() {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themaVariabelen(huidigThema, isDonker()))) root.style.setProperty(k, v);
}
export function pasThemaToe(thema) {
  huidigThema = thema;
  zetKleuren();
  if (!luistert) {
    luistert = true;
    window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", zetKleuren);
    document.addEventListener("weergave-gewijzigd", zetKleuren);
  }
  laadLettertype(thema?.lettertype);
}

export function laadLettertype(naam) {
  const root = document.documentElement;
  if (!naam || !LETTERTYPEN.includes(naam)) {
    root.style.removeProperty("--body");
    root.style.removeProperty("--display");
    return;
  }
  const id = "thema-font-" + naam.replace(/\W+/g, "-");
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(naam).replace(/%20/g, "+")}:wght@400;600;700;800&display=swap`;
    document.head.append(link);
  }
  const stapel = `"${naam}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;
  root.style.setProperty("--body", stapel);
  root.style.setProperty("--display", stapel);
}
