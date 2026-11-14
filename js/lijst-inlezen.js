// E-maillijst inlezen uit CSV, Excel of geplakte Outlook-adressen.
// Geeft { geldig: [{naam, email}], dubbel: [...], ongeldig: [...] } terug.

const EMAIL = /^[^@\s<>"';,]+@[^@\s<>"';,]+\.[^@\s<>"';,]+$/;

export function opschonen(rijen) {
  const gezien = new Map();
  const geldig = [], dubbel = [], ongeldig = [];
  for (const r of rijen) {
    const email = String(r.email || "").trim().toLowerCase().replace(/^mailto:/, "");
    const naam = String(r.naam || "").replace(/\s+/g, " ").trim();
    if (!EMAIL.test(email)) { if (email || naam) ongeldig.push({ naam, email: r.email || "" }); continue; }
    if (gezien.has(email)) {
      const eerder = gezien.get(email);
      if (!eerder.naam && naam) eerder.naam = naam;
      dubbel.push({ naam, email });
      continue;
    }
    const rij = { naam, email };
    gezien.set(email, rij);
    geldig.push(rij);
  }
  return { geldig, dubbel, ongeldig };
}

// Robuuste CSV-parser (aanhalingstekens, ; , of tab als scheiding).
export function parseCsv(tekst) {
  tekst = tekst.replace(/^﻿/, "");
  const eersteRegel = tekst.split(/\r?\n/, 1)[0] || "";
  const scheiding = [";", "\t", ","].map((s) => [s, eersteRegel.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rijen = [];
  let rij = [], veld = "", tussenAanhalingstekens = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (tussenAanhalingstekens) {
      if (c === '"' && tekst[i + 1] === '"') { veld += '"'; i++; }
      else if (c === '"') tussenAanhalingstekens = false;
      else veld += c;
    } else if (c === '"') tussenAanhalingstekens = true;
    else if (c === scheiding) { rij.push(veld); veld = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && tekst[i + 1] === "\n") i++;
      rij.push(veld); rijen.push(rij); rij = []; veld = "";
    } else veld += c;
  }
  if (veld || rij.length) { rij.push(veld); rijen.push(rij); }
  return rijen.filter((r) => r.some((v) => v.trim()));
}

// Uit een tabel (rijen met cellen) de naam- en e-mailkolommen halen.
// Herkent o.a. "Naam", "E-mail", en de Outlook-export "First Name", "Last Name", "E-mail Address".
export function uitTabel(rijen) {
  if (!rijen.length) return [];
  const kop = rijen[0].map((h) => String(h ?? "").trim().toLowerCase());
  const zoek = (...patronen) => kop.findIndex((h) => patronen.some((p) => p.test(h)));
  let iMail = zoek(/^e-?mail(\s*-?adres)?$/, /^e-?mail address$/, /^email$/, /e-?mail/);
  const iNaam = zoek(/^(volledige )?naam$/, /^name$/, /^display name$/, /^weergavenaam$/);
  const iVoor = zoek(/^voornaam$/, /^first name$/);
  const iTussen = zoek(/^tussenvoegsel$/, /^middle name$/);
  const iAchter = zoek(/^achternaam$/, /^last name$/);
  let data = rijen.slice(1);

  // Geen herkenbare kop: zoek de kolom met e-mailadressen en neem de rest als naam.
  if (iMail < 0) {
    data = rijen;
    const telling = (rijen[0] || []).map((_, k) => rijen.filter((r) => EMAIL.test(String(r[k] ?? "").trim())).length);
    iMail = telling.indexOf(Math.max(...telling));
    return data.map((r) => ({
      email: String(r[iMail] ?? "").trim(),
      naam: r.filter((_, k) => k !== iMail).map((v) => String(v ?? "").trim()).filter((v) => v && !EMAIL.test(v)).join(" "),
    }));
  }

  return data.map((r) => {
    const cel = (i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    const naam = iNaam >= 0 ? cel(iNaam) : [cel(iVoor), cel(iTussen), cel(iAchter)].filter(Boolean).join(" ");
    return { naam, email: cel(iMail) };
  });
}

// Geplakte adressen uit Outlook, bijvoorbeeld:
//   Jansen, Piet <p.jansen@bedrijf.nl>; "Smit, Ruud" <r.smit@bedrijf.nl>; joyce@bedrijf.nl
export function uitOutlook(tekst) {
  const uit = [];
  const patroon = /(?:"([^"]*)"|([^<>;\n]*?))\s*<\s*([^<>\s]+@[^<>\s]+)\s*>|([^\s<>;,"]+@[^\s<>;,"]+)/g;
  for (const m of tekst.matchAll(patroon)) {
    if (m[3]) {
      let naam = (m[1] ?? m[2] ?? "").replace(/^[\s;,]+/, "").replace(/['"]/g, "").trim();
      // "Achternaam, Voornaam" omdraaien naar "Voornaam Achternaam".
      const komma = naam.match(/^([^,]+),\s*(.+)$/);
      if (komma) naam = `${komma[2]} ${komma[1]}`;
      uit.push({ naam, email: m[3] });
    } else {
      uit.push({ naam: "", email: m[4] });
    }
  }
  return uit;
}
