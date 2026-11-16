// Maakt een Word-sjabloon (.docx) voor afdruk samenvoegen dat eruitziet als de
// stempagina: huisstijlkleuren, logo, kandidaattegels en een knop met de persoonlijke link.
// Geen externe bibliotheken: het .docx-bestand (een zip) wordt hier zelf opgebouwd.

const PETROL = "0D5F63";
const INKT = "16202C";
const GRIJS = "5A6676";
const LIJN = "D3DAE4";
const EMU_PER_CM = 360000;

/* ---------- Zip (zonder compressie) ---------- */

const CRC_TABEL = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABEL[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function maakZip(bestanden) {
  const enc = new TextEncoder();
  const delen = [];
  const centraal = [];
  let positie = 0;
  for (const { naam, data } of bestanden) {
    const inhoud = typeof data === "string" ? enc.encode(data) : data;
    const naamBytes = enc.encode(naam);
    const crc = crc32(inhoud);
    const kop = new DataView(new ArrayBuffer(30));
    kop.setUint32(0, 0x04034b50, true);
    kop.setUint16(4, 20, true);
    kop.setUint16(6, 0x0800, true); // UTF-8 namen
    kop.setUint16(8, 0, true);      // geen compressie
    kop.setUint32(14, crc, true);
    kop.setUint32(18, inhoud.length, true);
    kop.setUint32(22, inhoud.length, true);
    kop.setUint16(26, naamBytes.length, true);
    delen.push(new Uint8Array(kop.buffer), naamBytes, inhoud);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, inhoud.length, true);
    c.setUint32(24, inhoud.length, true);
    c.setUint16(28, naamBytes.length, true);
    c.setUint32(42, positie, true);
    centraal.push(new Uint8Array(c.buffer), naamBytes);
    positie += 30 + naamBytes.length + inhoud.length;
  }
  const grootte = centraal.reduce((s, d) => s + d.length, 0);
  const eind = new DataView(new ArrayBuffer(22));
  eind.setUint32(0, 0x06054b50, true);
  eind.setUint16(8, bestanden.length, true);
  eind.setUint16(10, bestanden.length, true);
  eind.setUint32(12, grootte, true);
  eind.setUint32(16, positie, true);
  return new Blob([...delen, ...centraal, new Uint8Array(eind.buffer)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/* ---------- WordprocessingML-bouwstenen ---------- */


// Lettertypen van het huidige sjabloon. Wie het lettertype niet heeft, krijgt Arial.
let LETTERS = { tekst: "Public Sans", kop: "Bricolage Grotesque" };

const x = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function rPr({ b, kleur = INKT, pt = 11, kop } = {}) {
  const f = x(kop ? LETTERS.kop : LETTERS.tekst);
  return `<w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/>${b ? "<w:b/>" : ""}<w:color w:val="${kleur}"/><w:sz w:val="${Math.round(pt * 2)}"/><w:szCs w:val="${Math.round(pt * 2)}"/></w:rPr>`;
}

function run(tekst, opmaak) {
  return String(tekst).split("\n").map((regel, i) =>
    `<w:r>${rPr(opmaak)}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${x(regel)}</w:t></w:r>`).join("");
}

function veld(naam, opmaak) {
  return `<w:r>${rPr(opmaak)}<w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r>${rPr(opmaak)}<w:instrText xml:space="preserve"> MERGEFIELD ${naam} </w:instrText></w:r>` +
    `<w:r>${rPr(opmaak)}<w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r>${rPr(opmaak)}<w:t>«${naam}»</w:t></w:r>` +
    `<w:r>${rPr(opmaak)}<w:fldChar w:fldCharType="end"/></w:r>`;
}

// Hyperlink waarvan het adres per collega uit het veld "link" komt.
function linkKnop(tekst, tekstKleur = "FFFFFF") {
  const o = { b: true, kleur: tekstKleur, pt: 11.5 };
  return `<w:r>${rPr(o)}<w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r>${rPr(o)}<w:instrText xml:space="preserve"> HYPERLINK "</w:instrText></w:r>` +
    `<w:r>${rPr(o)}<w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r>${rPr(o)}<w:instrText xml:space="preserve"> MERGEFIELD link </w:instrText></w:r>` +
    `<w:r>${rPr(o)}<w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r>${rPr(o)}<w:t>«link»</w:t></w:r>` +
    `<w:r>${rPr(o)}<w:fldChar w:fldCharType="end"/></w:r>` +
    `<w:r>${rPr(o)}<w:instrText xml:space="preserve">" </w:instrText></w:r>` +
    `<w:r>${rPr(o)}<w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r>${rPr(o)}<w:t xml:space="preserve">${x(tekst)}</w:t></w:r>` +
    `<w:r>${rPr(o)}<w:fldChar w:fldCharType="end"/></w:r>`;
}

function p(inhoud, { na = 160, jc } = {}) {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="${na}" w:line="276" w:lineRule="auto"/>${jc ? `<w:jc w:val="${jc}"/>` : ""}</w:pPr>${inhoud}</w:p>`;
}

// Word wil dat een tabelcel eindigt met een alinea; deze is zo goed als onzichtbaar.
const SLOT = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>`;

// Lege regel van 150 twips (10px), de ruimte onder een foto op de stempagina.
const TUSSENRUIMTE = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="150" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>`;

function afbeelding(rId, id, cmBreed, cmHoog) {
  const cx = Math.round(cmBreed * EMU_PER_CM), cy = Math.round(cmHoog * EMU_PER_CM);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${id}" name="Afbeelding ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="afbeelding${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function randen(kleur, dikte = 6) {
  const r = (k) => kleur ? `<w:${k} w:val="single" w:sz="${dikte}" w:space="0" w:color="${kleur}"/>` : `<w:${k} w:val="nil"/>`;
  return `<w:tcBorders>${r("top")}${r("left")}${r("bottom")}${r("right")}</w:tcBorders>`;
}

function cel(inhoud, { breedte, vul, rand, dikte, marge = 120, vAlign = "top" } = {}) {
  const m = typeof marge === "number" ? [marge, marge, marge, marge] : marge; // boven, rechts, onder, links
  return `<w:tc><w:tcPr><w:tcW w:w="${breedte}" w:type="dxa"/>${randen(rand, dikte)}` +
    `${vul ? `<w:shd w:val="clear" w:color="auto" w:fill="${vul}"/>` : ""}` +
    `<w:tcMar><w:top w:w="${m[0]}" w:type="dxa"/><w:left w:w="${m[3]}" w:type="dxa"/><w:bottom w:w="${m[2]}" w:type="dxa"/><w:right w:w="${m[1]}" w:type="dxa"/></w:tcMar>` +
    `<w:vAlign w:val="${vAlign}"/></w:tcPr>${inhoud}</w:tc>`;
}

// rijen: tekst (de cellen) of { cellen, hoogte } voor een vaste rijhoogte in twips.
function tabel(rijen, kolommen) {
  const totaal = kolommen.reduce((a, b) => a + b, 0);
  return `<w:tbl><w:tblPr><w:tblW w:w="${totaal}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>` +
    `<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${kolommen.map((k) => `<w:gridCol w:w="${k}"/>`).join("")}</w:tblGrid>` +
    rijen.map((r) => typeof r === "string" ? `<w:tr>${r}</w:tr>`
      : `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${r.hoogte}" w:hRule="exact"/></w:trPr>${r.cellen}</w:tr>`).join("") + `</w:tbl>`;
}

// "Sanne de Vries" -> "SV", net als op de stempagina.
function initialen(naam) {
  const woorden = String(naam || "?").split(/\s+/).filter(Boolean);
  const hoofd = woorden.filter((w) => /^\p{Lu}/u.test(w));
  const kies = hoofd.length ? hoofd : woorden;
  return (kies[0][0] + (kies.length > 1 ? kies[kies.length - 1][0] : "")).toUpperCase();
}

/* ---------- Het sjabloon ---------- */

const TWIPS_PER_CM = 566.93;
// Zelfde kleuren als de stempagina (licht).
const PAGINA = "F3F5F8", KAART = "FFFFFF";
const VLAKKEN = ["2F6F8F", "8A4F7D", "B0802F", "4F7A3A"]; // --c1 t/m --c4

const kleur = (waarde, standaard) => {
  const m = String(waarde || "").match(/^#?([0-9a-f]{6})$/i);
  return m ? m[1].toUpperCase() : standaard;
};

/**
 * Bouwt het sjabloon in dezelfde opmaak als de stempagina: grijze achtergrond,
 * logo en titel bovenaan, een witte kaart met kandidaattegels en de knop.
 * @param {object} o
 * @param {"uitnodiging"|"herinnering"} o.soort
 * @param {string} o.titel        titel van de verkiezing
 * @param {string} [o.toelichting] toelichting bij de verkiezing, zoals op de stempagina
 * @param {string} o.organisatie  naam van de OR
 * @param {string} o.afzender     naam onder de mail
 * @param {{bytes:Uint8Array,breed:number,hoog:number}|null} o.logo  PNG
 * @param {{naam:string,functie?:string,tekst?:string,foto?:{bytes:Uint8Array,breed:number,hoog:number}|null}[]} o.kandidaten
 * @param {object} [o.kleuren]    uitkomst van themaVariabelen(thema, false)
 * @param {string} [o.lettertype] lettertype uit de huisstijl
 */
export function maakWordSjabloon(o) {
  const k = o.kleuren || {};
  const KNOP = kleur(k["--knop"], PETROL);
  const OP_KNOP = kleur(k["--on-petrol"], "FFFFFF");
  LETTERS = o.lettertype ? { tekst: o.lettertype, kop: o.lettertype } : { tekst: "Public Sans", kop: "Bricolage Grotesque" };

  const afbeeldingen = [];
  let id = 1;
  const voegToe = (img, cmHoog, cmMaxBreed) => {
    const rId = `rIdImg${afbeeldingen.length + 1}`;
    afbeeldingen.push({ rId, bytes: img.bytes });
    let h = cmHoog, b = (img.breed / img.hoog) * cmHoog;
    if (cmMaxBreed && b > cmMaxBreed) { b = cmMaxBreed; h = (img.hoog / img.breed) * b; }
    return afbeelding(rId, id++, b, h);
  };

  const GRIJS_KLEIN = { kleur: GRIJS, pt: 10 };
  const BREED = 9600;              // ongeveer 17 cm, de volle breedte tussen de marges
  const RAND_BUITEN = 420;         // grijze rand rond de kaart, zoals de pagina-achtergrond
  const KAART_BREED = BREED - 2 * RAND_BUITEN;
  const KAART_MARGE = 340;         // binnenruimte van de kaart (20px op de site)
  const INHOUD = KAART_BREED - 2 * KAART_MARGE;
  const binnen = [];               // alles op de grijze achtergrond

  // Merkregel: logo (of naam van de OR) met daarnaast titel en sluitingsdatum.
  const titelBlok = p(run(o.titel, { b: true, pt: 14, kop: true }), { na: 0 }) +
    p(run("Stemmen kan tot ", GRIJS_KLEIN) + veld("sluit", GRIJS_KLEIN), { na: 0 });
  if (o.logo) {
    const logoBreed = Math.min(160 / 44 * 1.16, (o.logo.breed / o.logo.hoog) * 1.16); // 44px hoog, max 160px breed
    const kol = Math.round(logoBreed * TWIPS_PER_CM) + 220;
    binnen.push(tabel([cel(p(voegToe(o.logo, 1.16, logoBreed), { na: 0 }), { breedte: kol, marge: 0, vAlign: "center" }) +
      cel(titelBlok, { breedte: KAART_BREED - kol, marge: 0, vAlign: "center" })], [kol, KAART_BREED - kol]));
  } else {
    binnen.push(titelBlok);
  }
  binnen.push(p("", { na: 120 }));

  // De kaart
  const kaart = [];
  kaart.push(p(run("Beste ") + veld("voornaam") + run(","), { na: 200 }));
  if (o.soort === "herinnering") kaart.push(p(run("Je hebt nog niet gestemd voor de tussentijdse OR-verkiezing."), { na: 200 }));
  // De toelichting van de verkiezing, zoals op de stempagina; anders een standaardzin.
  kaart.push(p(run(o.toelichting || "Er is één zetel vrij in de ondernemingsraad."), { na: 200 }));
  kaart.push(p(run("Dit zijn de kandidaten:"), { na: 200 }));

  // Kandidaattegels: twee naast elkaar, bij meer dan twee kandidaten drie, net als op de site.
  const n = o.kandidaten.length > 2 ? 3 : 2;
  const TUSSEN = 280;
  const tegelBreed = Math.floor((INHOUD - (n - 1) * TUSSEN) / n);
  const TEGEL_MARGE = 220;
  const fotoTwips = tegelBreed - 2 * TEGEL_MARGE;
  const fotoCm = fotoTwips / TWIPS_PER_CM;
  const kolommen = [];
  for (let i = 0; i < n; i++) kolommen.push(...(i ? [TUSSEN, tegelBreed] : [tegelBreed]));
  const rijen = [];
  for (let i = 0; i < o.kandidaten.length; i += n) {
    const groep = o.kandidaten.slice(i, i + n);
    const cellen = [];
    for (let j = 0; j < n; j++) {
      if (j) cellen.push(cel(SLOT, { breedte: TUSSEN, marge: 0 }));
      const kand = groep[j];
      if (!kand) { cellen.push(cel(SLOT, { breedte: tegelBreed, marge: 0 })); continue; }
      const foto = kand.foto
        ? p(voegToe(kand.foto, fotoCm, fotoCm), { na: 150 })
        : tabel([{ hoogte: fotoTwips, cellen: cel(p(run(initialen(kand.naam), { b: true, kleur: "FFFFFF", pt: n === 3 ? 20 : 26, kop: true }), { na: 0, jc: "center" }),
            { breedte: fotoTwips, vul: VLAKKEN[(i + j) % 4], marge: 0, vAlign: "center" }) }], [fotoTwips]) + TUSSENRUIMTE;
      const tekst = p(run(kand.naam, { b: true, pt: 12, kop: true }), { na: kand.functie || kand.tekst ? 80 : 0 }) +
        (kand.functie ? p(run(kand.functie, { b: true, kleur: GRIJS, pt: 10 }), { na: kand.tekst ? 80 : 0 }) : "") +
        (kand.tekst ? p(run(kand.tekst, { kleur: GRIJS, pt: 10.5 }), { na: 0 }) : "");
      cellen.push(cel(foto + tekst, { breedte: tegelBreed, rand: LIJN, dikte: 12, marge: TEGEL_MARGE }));
    }
    if (i) rijen.push({ hoogte: TUSSEN, cellen: kolommen.map((b) => cel(SLOT, { breedte: b, marge: 0 })).join("") });
    rijen.push(cellen.join(""));
  }
  if (rijen.length) kaart.push(tabel(rijen, kolommen));
  kaart.push(p("", { na: 160 }));

  // Knop in de knopkleur van de huisstijl
  kaart.push(tabel([cel(p(linkKnop("Breng mijn stem uit", OP_KNOP), { na: 0, jc: "center" }),
    { breedte: 3400, vul: KNOP, marge: [170, 270, 170, 270], vAlign: "center" })], [3400]));
  kaart.push(p("", { na: 160 }));

  // Kleine lettertjes
  kaart.push(p(run("Deze link is persoonlijk en werkt één keer. Stuur hem niet door.", GRIJS_KLEIN) +
    run("\nStemmen kan tot ", GRIJS_KLEIN) + veld("sluit", GRIJS_KLEIN) + run(". Je stem is geheim: niemand kan zien wat je kiest.", GRIJS_KLEIN), { na: 160 }));
  kaart.push(p(run("Werkt de knop niet? Kopieer dan deze link naar je browser:", GRIJS_KLEIN) +
    run("\n", { pt: 10 }) + veld("link", { kleur: GRIJS, pt: 9 }), { na: 240 }));
  kaart.push(p(run(`Met vriendelijke groet,\n${o.afzender}\n${o.organisatie}`), { na: 0 }));

  binnen.push(tabel([cel(kaart.join("") + SLOT, { breedte: KAART_BREED, vul: KAART, rand: LIJN, marge: KAART_MARGE })], [KAART_BREED]));
  binnen.push(SLOT);

  const blokken = [tabel([cel(binnen.join(""), { breedte: BREED, vul: PAGINA, marge: RAND_BUITEN })], [BREED]), SLOT];

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>${blokken.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1153" w:bottom="1000" w:left="1153" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body>
</w:document>`;

  // Lettertypen met Arial als vervanger, voor wie ze niet geïnstalleerd heeft.
  const letters = [...new Set([LETTERS.tekst, LETTERS.kop])];
  const fontTable = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${letters.map((f) =>
    `<w:font w:name="${x(f)}"><w:altName w:val="Arial"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>`).join("")}</w:fonts>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdFonts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>${afbeeldingen.map((a, i) =>
    `<Relationship Id="${a.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/afbeelding${i + 1}.png"/>`).join("")}</Relationships>`;

  return maakZip([
    { naam: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/></Types>` },
    { naam: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { naam: "word/document.xml", data: document },
    { naam: "word/fontTable.xml", data: fontTable },
    { naam: "word/_rels/document.xml.rels", data: rels },
    ...afbeeldingen.map((a, i) => ({ naam: `word/media/afbeelding${i + 1}.png`, data: a.bytes })),
  ]);
}

// Een afbeelding van een URL omzetten naar PNG (Word kent geen WebP), verkleind.
// Met vierkant: true wordt het midden uitgesneden, zoals de vierkante foto's op de stempagina.
export async function laadAlsPng(url, maxPx = 400, { vierkant = false } = {}) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
    if (vierkant) {
      const z = Math.min(sw, sh);
      sx = (sw - z) / 2; sy = (sh - z) / 2; sw = sh = z;
    }
    const schaal = Math.min(1, maxPx / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * schaal);
    canvas.height = Math.round(sh * schaal);
    canvas.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), breed: canvas.width, hoog: canvas.height };
  } catch {
    return null;
  }
}
