// Herkent huisstijlkleuren, logo's en lettertypen in de HTML en CSS van een website.
// Geen netwerk in dit bestand: alleen tekst in, voorstel uit (goed te testen).

export type Kleur = { hex: string; score: number };
export type Herkend = {
  naam: string;
  kleuren: Kleur[];
  primair: string | null;
  accent: string | null;
  lettertypen: string[];
  logoUrls: string[];
  inlineSvgLogos: string[];
  stylesheets: string[];
};

const GENERIEK = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif",
  "ui-monospace", "-apple-system", "blinkmacsystemfont", "segoe ui", "helvetica", "helvetica neue", "arial",
  "inherit", "initial", "unset", "emoji", "apple color emoji", "segoe ui emoji", "noto color emoji", "var",
]);

function absoluut(href: string, basis: string): string | null {
  try {
    const u = new URL(href.replace(/&amp;/g, "&").trim(), basis);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function attr(tag: string, naam: string): string | null {
  const m = tag.match(new RegExp(`\\s${naam}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
}

/* ---------- Kleuren ---------- */

export function naarRgb(waarde: string): [number, number, number] | null {
  const v = waarde.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  m = v.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = v.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])].map((n) => Math.min(255, n)) as [number, number, number];
  return null;
}

export function naarHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
}

export function hsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function afstand(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// Alleen kleuren met karakter: geen wit, zwart of grijs.
function bruikbaar(rgb: [number, number, number]): boolean {
  const [, s, l] = hsl(rgb);
  return s >= 0.25 && l >= 0.12 && l <= 0.88;
}

const KLEUR_RE = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d{1,3}[\s,]+\d{1,3}[\s,]+\d{1,3}[^)]*\)/g;

function kleurenTellen(css: string, telling: Map<string, number>, gewicht = 1) {
  // Regels apart bekijken, zodat knoppen, kopteksten en merk-variabelen zwaarder tellen.
  for (const regel of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = regel[1].toLowerCase();
    const body = regel[2];
    for (const decl of body.split(";")) {
      const [eig, ...rest] = decl.split(":");
      if (!rest.length) continue;
      const naam = eig.trim().toLowerCase();
      const waarde = rest.join(":");
      for (const k of waarde.match(KLEUR_RE) ?? []) {
        const rgb = naarRgb(k);
        if (!rgb) continue;
        let w = gewicht;
        if (/^--.*(primary|brand|accent|main|theme|corporate|highlight)/.test(naam)) w += 25;
        else if (naam.startsWith("--")) w += 2;
        if (/btn|button|cta|header|navbar|nav\b|primary|brand/.test(selector)) w += 3;
        if (/background/.test(naam)) w += 1;
        const hex = naarHex(rgb);
        telling.set(hex, (telling.get(hex) ?? 0) + w);
      }
    }
  }
}

function samenvoegen(telling: Map<string, number>): Kleur[] {
  const lijst = [...telling.entries()]
    .map(([hex, score]) => ({ hex, score, rgb: naarRgb(hex)! }))
    .filter((k) => bruikbaar(k.rgb))
    .sort((a, b) => b.score - a.score);
  const groepen: { hex: string; score: number; rgb: [number, number, number] }[] = [];
  for (const k of lijst) {
    const groep = groepen.find((g) => afstand(g.rgb, k.rgb) < 28);
    if (groep) groep.score += k.score;
    else groepen.push({ ...k });
  }
  return groepen.sort((a, b) => b.score - a.score).slice(0, 8).map(({ hex, score }) => ({ hex, score }));
}

/* ---------- Hoofdfunctie ---------- */

export function herkenThema(html: string, basisUrl: string, externeCss: string[] = []): Herkend {
  const telling = new Map<string, number>();

  // Meta-kleuren zijn een sterke aanwijzing.
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const naam = (attr(tag, "name") ?? attr(tag, "property") ?? "").toLowerCase();
    if (naam === "theme-color" || naam === "msapplication-tilecolor") {
      const rgb = naarRgb(attr(tag, "content") ?? "");
      if (rgb) telling.set(naarHex(rgb), (telling.get(naarHex(rgb)) ?? 0) + 60);
    }
  }

  const inlineCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  kleurenTellen(inlineCss, telling, 1);
  for (const css of externeCss) kleurenTellen(css, telling, 1);
  // Kleuren in style="" attributen
  for (const m of html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) kleurenTellen(`x{${m[1]}}`, telling, 1);
  // Kleuren in inline SVG (logo's) tellen licht mee
  for (const m of html.matchAll(/\sfill\s*=\s*"(#[0-9a-fA-F]{3,6})"/g)) {
    const rgb = naarRgb(m[1]);
    if (rgb) telling.set(naarHex(rgb), (telling.get(naarHex(rgb)) ?? 0) + 4);
  }

  const kleuren = samenvoegen(telling);
  const primair = kleuren[0]?.hex ?? null;
  // Accent: de op één na sterkste kleur (gebruikt voor de gekozen kandidaat).
  const accent = kleuren[1]?.hex ?? null;

  // Lettertypen
  const fontTelling = new Map<string, number>();
  const alleCss = inlineCss + "\n" + externeCss.join("\n");
  for (const m of alleCss.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const eerste = m[1].split(",")[0].replace(/["']/g, "").replace(/!important/, "").trim();
    if (!eerste || GENERIEK.has(eerste.toLowerCase()) || eerste.startsWith("var(")) continue;
    fontTelling.set(eerste, (fontTelling.get(eerste) ?? 0) + 1);
  }
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&:]+)/gi)) {
    const naam = decodeURIComponent(m[1].replace(/\+/g, " "));
    fontTelling.set(naam, (fontTelling.get(naam) ?? 0) + 5);
  }
  const lettertypen = [...fontTelling.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);

  // Logo's
  const logoUrls: string[] = [];
  const voeg = (u: string | null) => { if (u && !logoUrls.includes(u)) logoUrls.push(u); };
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const tekst = [attr(tag, "src"), attr(tag, "alt"), attr(tag, "class"), attr(tag, "id")].join(" ").toLowerCase();
    if (/logo|brand|merk/.test(tekst)) voeg(absoluut(attr(tag, "src") ?? attr(tag, "data-src") ?? "", basisUrl));
  }
  // <a class="logo"><img src=...></a>
  for (const m of html.matchAll(/<(?:a|div|span)\b[^>]*(?:class|id)\s*=\s*["'][^"']*logo[^"']*["'][^>]*>\s*(?:<picture[^>]*>[\s\S]{0,400}?)?<img\b[^>]*>/gi)) {
    const img = m[0].match(/<img\b[^>]*>/i)![0];
    voeg(absoluut(attr(img, "src") ?? "", basisUrl));
  }
  const inlineSvgLogos: string[] = [];
  for (const m of html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)) {
    const ervoor = html.slice(Math.max(0, (m.index ?? 0) - 300), m.index).toLowerCase();
    const svg = m[0];
    if ((/logo/.test(ervoor) || /logo/i.test(svg.slice(0, 300))) && svg.length < 150_000) inlineSvgLogos.push(svg);
    if (inlineSvgLogos.length >= 2) break;
  }
  const iconen: { url: string; maat: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    if (/apple-touch-icon|icon/.test(rel)) {
      const u = absoluut(attr(tag, "href") ?? "", basisUrl);
      const maat = Number((attr(tag, "sizes") ?? "").split("x")[0]) || (rel.includes("apple") ? 180 : 32);
      if (u) iconen.push({ url: u, maat });
    }
  }
  iconen.filter((i) => !/\.ico(\?|$)/i.test(i.url)).sort((a, b) => b.maat - a.maat).forEach((i) => voeg(i.url));
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (/og:logo/i.test(attr(tag, "property") ?? "")) voeg(absoluut(attr(tag, "content") ?? "", basisUrl));
  }

  // Stylesheets om nog op te halen
  const stylesheets: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (/stylesheet/i.test(attr(tag, "rel") ?? "")) {
      const u = absoluut(attr(tag, "href") ?? "", basisUrl);
      if (u && !/fonts\.googleapis/.test(u)) stylesheets.push(u);
    }
  }

  // Naam
  let naam = "";
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (/og:site_name|application-name/i.test(attr(tag, "property") ?? attr(tag, "name") ?? "")) naam = attr(tag, "content") ?? "";
  }
  if (!naam) naam = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").split(/[|\-–]/)[0].trim();

  return { naam, kleuren, primair, accent, lettertypen, logoUrls: logoUrls.slice(0, 6), inlineSvgLogos, stylesheets: stylesheets.slice(0, 5) };
}
