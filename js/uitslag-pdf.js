// Uitslag als PDF in de huisstijl: logo, kleuren van het thema, uitslag met balken,
// kerngetallen en ruimte voor handtekeningen van de kiescommissie.
// jsPDF wordt pas geladen als iemand op de knop klikt.
import { t, fmtDatum } from "./gemeen.js?v=20261120c";
import { themaVariabelen, naarRgb } from "./thema.js?v=20261120c";
import { laadAlsPng } from "./word-sjabloon.js?v=20261120c";

const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
const JSPDF_SRI = "sha384-en/ztfPSRkGfME4KIm05joYXynqzUgbsG5nMrj/xEFAHXkeZfO3yMK8QQ+mP7p1/";

// Zelfde kleuren als de stempagina en het dashboard.
const INKT = [22, 32, 44], GRIJS = [90, 102, 118], LIJN = [211, 218, 228], VLAK = [243, 245, 248];
const BALKEN = [[47, 111, 143], [138, 79, 125], [176, 128, 47], [79, 122, 58]]; // --c1 t/m --c4

// De standaardletter van een PDF kent alleen West-Europese tekens (Windows-1252).
// Andere letters worden zo dicht mogelijk benaderd: "ı" wordt "i", "ş" wordt "s".
const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
function veilig(s) {
  return String(s ?? "").replace(/[^\u0000-\u00ff]/g, (c) => {
    if (CP1252_EXTRA.includes(c)) return c;
    const map = { "ı": "i", "İ": "I", "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "ø": "o", "ß": "ss" };
    if (map[c]) return map[c];
    const kaal = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return /^[\u0000-\u00ff]+$/.test(kaal) ? kaal : "?";
  });
}

let laden = null;
function laadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  laden ??= new Promise((ok, fout) => {
    const s = document.createElement("script");
    s.src = JSPDF_URL;
    s.integrity = JSPDF_SRI;
    s.crossOrigin = "anonymous";
    s.onload = () => (window.jspdf ? ok(window.jspdf) : fout(new Error("jsPDF")));
    s.onerror = () => { laden = null; fout(new Error(t("De PDF-maker kon niet worden geladen. Controleer je internetverbinding en probeer het opnieuw."))); };
    document.head.append(s);
  });
  return laden;
}

// Logo van de huisstijl als PNG (data-URL) voor in de PDF.
async function logoVoorPdf(url) {
  const png = await laadAlsPng(url, 600);
  if (!png) return null;
  let bin = "";
  for (let i = 0; i < png.bytes.length; i += 0x8000) bin += String.fromCharCode(...png.bytes.subarray(i, i + 0x8000));
  return { data: "data:image/png;base64," + btoa(bin), breed: png.breed, hoog: png.hoog };
}

/**
 * @param {object} d            uitkomst van de rpc "dashboard" (gesloten verkiezing)
 * @param {object} instellingen app_instellingen (organisatie, logo_url, thema)
 * @returns {Promise<Blob>}
 */
export async function maakUitslagPdf(d, instellingen = {}) {
  const [{ jsPDF }, logo] = await Promise.all([laadJsPdf(), logoVoorPdf(instellingen.logo_url).catch(() => null)]);
  const kleuren = themaVariabelen(instellingen.thema, false);
  const PETROL = naarRgb(kleuren["--petrol"]);
  const KNOP = naarRgb(kleuren["--knop"]);
  const ZACHT = naarRgb(kleuren["--petrol-soft"]);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const B = 210, M = 18, W = B - 2 * M;
  const kleur = (c) => doc.setTextColor(...c);
  const tekst = (s, x, y, { pt = 10, vet = false, c = INKT, ...opties } = {}) => {
    doc.setFont("helvetica", vet ? "bold" : "normal");
    doc.setFontSize(pt);
    kleur(c);
    doc.text(Array.isArray(s) ? s.map(veilig) : veilig(s), x, y, opties);
  };
  doc.setProperties({ title: t("Uitslag {titel}", { titel: d.titel }), creator: "OR-VerkiezingsTeller" });

  // Kopbalk in de knopkleur van de huisstijl
  doc.setFillColor(...KNOP);
  doc.rect(0, 0, B, 6, "F");

  // Logo en organisatie
  let y = 18;
  if (logo) {
    const h = 14, b = Math.min(55, (logo.breed / logo.hoog) * h);
    doc.addImage(logo.data, "PNG", M, y - 4, b, (logo.hoog / logo.breed) * b);
  }
  tekst(instellingen.organisatie || t("Ondernemingsraad"), B - M, y + 2, { pt: 10, c: GRIJS, align: "right" });
  y += 22;

  // Titel
  tekst(t("Uitslag"), M, y, { pt: 11, vet: true, c: PETROL });
  y += 8;
  const titelRegels = doc.setFont("helvetica", "bold").setFontSize(20).splitTextToSize(veilig(d.titel), W);
  tekst(titelRegels, M, y, { pt: 20, vet: true });
  y += titelRegels.length * 8 + 1;
  tekst(t("{start} tot {eind}", { start: fmtDatum(d.start_at), eind: fmtDatum(d.eind_at) }), M, y, { pt: 10, c: GRIJS });
  y += 10;

  // Uitslag met balken, in een kader zoals op het dashboard
  const totaal = d.uitslag.reduce((s, r) => s + Number(r.stemmen), 0);
  const rijH = 11;
  const kaderH = 16 + d.uitslag.length * rijH + 4;
  doc.setDrawColor(...LIJN);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, W, kaderH, 2.5, 2.5, "S");
  tekst(t("Stemmen per kandidaat"), M + 6, y + 9, { pt: 12, vet: true });
  let ry = y + 18;
  const naamB = 58, getalB = 34, balkX = M + 6 + naamB, balkB = W - 12 - naamB - getalB;
  // Vetgedrukt: de kandidaat met de meeste stemmen, alleen als die alleen bovenaan staat.
  const kand = d.uitslag.filter((r) => r.volgorde !== 1000000).map((r) => Number(r.stemmen));
  const hoogste = Math.max(0, ...kand);
  const winnaar = hoogste > 0 && kand.filter((n) => n === hoogste).length === 1 ? hoogste : null;
  d.uitslag.forEach((r, i) => {
    const onth = r.volgorde === 1000000;
    const p = totaal ? (Number(r.stemmen) / totaal) * 100 : 0;
    const naam = doc.setFont("helvetica", "normal").setFontSize(10.5).splitTextToSize(veilig(onth ? t(r.naam) : r.naam), naamB - 3)[0];
    tekst(naam, M + 6, ry + 1.5, { pt: 10.5, vet: !onth && Number(r.stemmen) === winnaar });
    doc.setFillColor(...VLAK);
    doc.roundedRect(balkX, ry - 2.5, balkB, 5, 1.5, 1.5, "F");
    if (p > 0) {
      doc.setFillColor(...(onth ? GRIJS : BALKEN[i % 4]));
      doc.roundedRect(balkX, ry - 2.5, Math.max(3, (balkB * p) / 100), 5, 1.5, 1.5, "F");
    }
    tekst(`${r.stemmen} · ${Math.round(p)}%`, M + W - 6, ry + 1.5, { pt: 10.5, align: "right" });
    ry += rijH;
  });
  y += kaderH + 8;

  // Kerngetallen in een vlak in de zachte themakleur
  const opkomst = d.kiezers ? Math.round((d.gestemd / d.kiezers) * 100) : 0;
  const getallen = [
    [t("Kiezers"), d.kiezers],
    [t("Gestemd"), d.gestemd],
    [t("Opkomst"), `${opkomst}%`],
    [t("Stemmen geteld"), totaal],
  ];
  const vakB = (W - 3 * 4) / 4;
  getallen.forEach(([label, waarde], i) => {
    const x = M + i * (vakB + 4);
    doc.setFillColor(...ZACHT);
    doc.roundedRect(x, y, vakB, 22, 2, 2, "F");
    tekst(String(waarde), x + 5, y + 11, { pt: 16, vet: true, c: PETROL });
    tekst(label, x + 5, y + 17.5, { pt: 9, c: GRIJS });
  });
  y += 30;
  const extra = [];
  if (Number(d.apart)) extra.push(t("Apart gezet (niet geteld)") + `: ${d.apart}`);
  if (Number(d.afgekeurd)) extra.push(t("Afgekeurd") + `: ${d.afgekeurd}`);
  if (extra.length) { tekst(extra.join("   ·   "), M, y, { pt: 9.5, c: GRIJS }); y += 8; }

  const uitleg = doc.setFont("helvetica", "normal").setFontSize(9.5).splitTextToSize(veilig(
    t("De stemming was geheim. Stemmen zijn opgeslagen zonder naam, e-mailadres of tijdstip; niemand kan zien wie op wie heeft gestemd. \"Onthouden\" telt mee voor de opkomst, niet voor een kandidaat.")), W);
  tekst(uitleg, M, y, { pt: 9.5, c: GRIJS });
  y += uitleg.length * 4.5 + 14;

  // Vaststelling door de kiescommissie
  tekst(t("Vastgesteld door de kiescommissie"), M, y, { pt: 12, vet: true });
  y += 18;
  const tekenB = (W - 10) / 2;
  for (let rij = 0; rij < 2; rij++) {
    for (let k = 0; k < 2; k++) {
      const x = M + k * (tekenB + 10);
      doc.setDrawColor(...LIJN);
      doc.line(x, y, x + tekenB, y);
      tekst(t("Naam en handtekening"), x, y + 5, { pt: 8.5, c: GRIJS });
    }
    y += 20;
  }

  // Voetregel
  doc.setDrawColor(...LIJN);
  doc.line(M, 282, B - M, 282);
  tekst(t("Gemaakt op {datum}", { datum: fmtDatum(new Date().toISOString()) }), M, 287, { pt: 8.5, c: GRIJS });
  tekst(instellingen.organisatie || t("Ondernemingsraad"), B - M, 287, { pt: 8.5, c: GRIJS, align: "right" });

  return doc.output("blob");
}
