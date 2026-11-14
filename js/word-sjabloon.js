// Maakt een Word-sjabloon (.docx) voor afdruk samenvoegen in de stijl van de
// uitnodigingsmail: logo, kandidaten met foto en een knop met de persoonlijke link.
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

const x = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function rPr({ b, kleur = INKT, pt = 11 } = {}) {
  return `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b ? "<w:b/>" : ""}<w:color w:val="${kleur}"/><w:sz w:val="${pt * 2}"/></w:rPr>`;
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
function linkKnop(tekst) {
  const o = { b: true, kleur: "FFFFFF", pt: 12 };
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

function randen(kleur) {
  const r = (k) => kleur ? `<w:${k} w:val="single" w:sz="6" w:space="0" w:color="${kleur}"/>` : `<w:${k} w:val="nil"/>`;
  return `<w:tcBorders>${r("top")}${r("left")}${r("bottom")}${r("right")}</w:tcBorders>`;
}

function cel(inhoud, { breedte, vul, rand, marge = 120, vAlign = "center" } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${breedte}" w:type="dxa"/>${randen(rand)}` +
    `${vul ? `<w:shd w:val="clear" w:color="auto" w:fill="${vul}"/>` : ""}` +
    `<w:tcMar><w:top w:w="${marge}" w:type="dxa"/><w:left w:w="${marge}" w:type="dxa"/><w:bottom w:w="${marge}" w:type="dxa"/><w:right w:w="${marge}" w:type="dxa"/></w:tcMar>` +
    `<w:vAlign w:val="${vAlign}"/></w:tcPr>${inhoud}</w:tc>`;
}

function tabel(rijen, kolommen) {
  const totaal = kolommen.reduce((a, b) => a + b, 0);
  return `<w:tbl><w:tblPr><w:tblW w:w="${totaal}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>` +
    `<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${kolommen.map((k) => `<w:gridCol w:w="${k}"/>`).join("")}</w:tblGrid>` +
    rijen.map((r) => `<w:tr>${r}</w:tr>`).join("") + `</w:tbl>`;
}

/* ---------- Het sjabloon ---------- */

/**
 * @param {object} o
 * @param {"uitnodiging"|"herinnering"} o.soort
 * @param {string} o.titel        titel van de verkiezing
 * @param {string} o.organisatie  naam van de OR
 * @param {string} o.afzender     naam onder de mail
 * @param {{bytes:Uint8Array,breed:number,hoog:number}|null} o.logo  PNG
 * @param {{naam:string,functie?:string,foto?:{bytes:Uint8Array,breed:number,hoog:number}|null}[]} o.kandidaten
 */
export function maakWordSjabloon(o) {
  const afbeeldingen = [];
  let id = 1;
  const voegToe = (img, cmHoog, cmMaxBreed) => {
    const rId = `rIdImg${afbeeldingen.length + 1}`;
    afbeeldingen.push({ rId, bytes: img.bytes });
    let h = cmHoog, b = (img.breed / img.hoog) * cmHoog;
    if (cmMaxBreed && b > cmMaxBreed) { b = cmMaxBreed; h = (img.hoog / img.breed) * b; }
    return afbeelding(rId, id++, b, h);
  };

  const BREED = 9000; // ongeveer 15,9 cm
  const blokken = [];

  // Kop met logo en titel
  const titelRuns = run(o.titel, { b: true, pt: 16 });
  blokken.push(o.logo
    ? tabel([cel(p(voegToe(o.logo, 1.3, 4.5), { na: 0 }), { breedte: 2800, marge: 0 }) +
             cel(p(titelRuns, { na: 0 }), { breedte: BREED - 2800, marge: 0 })], [2800, BREED - 2800])
    : p(titelRuns, { na: 240 }));
  blokken.push(p("", { na: 120 }));

  // Aanhef en inleiding
  blokken.push(p(run("Beste ") + veld("voornaam") + run(","), { na: 200 }));
  blokken.push(p(run(o.soort === "herinnering"
    ? "Je hebt nog niet gestemd voor de tussentijdse OR-verkiezing. Er is één zetel vrij in de ondernemingsraad en dit zijn de kandidaten:"
    : "Er is één zetel vrij in de ondernemingsraad. Dit zijn de kandidaten:"), { na: 200 }));

  // Kandidaten, twee per rij
  const kolBreed = BREED / 2;
  const rijen = [];
  for (let i = 0; i < o.kandidaten.length; i += 2) {
    const paar = o.kandidaten.slice(i, i + 2);
    rijen.push(paar.map((k) => {
      const tekst = p(run(k.naam, { b: true }) + (k.functie ? run("\n" + k.functie, { kleur: GRIJS, pt: 10 }) : ""), { na: 0 });
      const binnen = k.foto
        ? tabel([cel(p(voegToe(k.foto, 1.5, 1.5), { na: 0 }), { breedte: 1100, marge: 0 }) +
                 cel(tekst, { breedte: kolBreed - 1100 - 400, marge: 0 })], [1100, kolBreed - 1100 - 400])
        : tekst;
      return cel(binnen + p("", { na: 0 }), { breedte: kolBreed, rand: LIJN, marge: 160 });
    }).join("") + (paar.length === 1 ? cel(p("", { na: 0 }), { breedte: kolBreed }) : ""));
  }
  if (rijen.length) blokken.push(tabel(rijen, [kolBreed, kolBreed]));
  blokken.push(p("", { na: 200 }));

  // Knop
  blokken.push(tabel([cel(p(linkKnop("Breng mijn stem uit"), { na: 0, jc: "center" }), { breedte: 3600, vul: PETROL, marge: 180 })], [3600]));
  blokken.push(p("", { na: 200 }));

  // Kleine lettertjes
  blokken.push(p(run("Deze link is persoonlijk en werkt één keer. Stuur hem niet door.", { kleur: GRIJS, pt: 10 }) +
    run("\nStemmen kan tot ", { kleur: GRIJS, pt: 10 }) + veld("sluit", { kleur: GRIJS, pt: 10 }) + run(".", { kleur: GRIJS, pt: 10 }), { na: 200 }));
  blokken.push(p(run("Werkt de knop niet? Kopieer dan deze link naar je browser:", { kleur: GRIJS, pt: 10 }) +
    run("\n", { pt: 10 }) + veld("link", { kleur: GRIJS, pt: 9 }), { na: 280 }));

  blokken.push(p(run(`Met vriendelijke groet,\n${o.afzender}\n${o.organisatie}`), { na: 0 }));

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>${blokken.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body>
</w:document>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${afbeeldingen.map((a, i) =>
    `<Relationship Id="${a.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/afbeelding${i + 1}.png"/>`).join("")}</Relationships>`;

  return maakZip([
    { naam: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { naam: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { naam: "word/document.xml", data: document },
    { naam: "word/_rels/document.xml.rels", data: rels },
    ...afbeeldingen.map((a, i) => ({ naam: `word/media/afbeelding${i + 1}.png`, data: a.bytes })),
  ]);
}

// Een afbeelding van een URL omzetten naar PNG (Word kent geen WebP), verkleind.
export async function laadAlsPng(url, maxPx = 400) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const schaal = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * schaal);
    canvas.height = Math.round(bitmap.height * schaal);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), breed: canvas.width, hoog: canvas.height };
  } catch {
    return null;
  }
}
