// Beheerscherm: alleen voor de beheerder.
import {
  db, $, $$, el, fmtDatum, fmtKort, fmtDag, naarLokaal, vanLokaal, fotoOf, laadHuisstijl,
  vereisLogin, uitloggen, foutTekst, download, csvRegel,
} from "./gemeen.js";
import { parseCsv, uitTabel, uitOutlook, opschonen } from "./lijst-inlezen.js";
import { maakWordSjabloon, laadAlsPng } from "./word-sjabloon.js";
import { STANDAARD, LETTERTYPEN, pasThemaToe, themaVariabelen } from "./thema.js";

let verkiezingen = [];
let huidig = null;          // de gekozen verkiezing (object) of null bij een nieuwe
let instellingen = {};
let voorbeeldLijst = null;  // ingelezen, nog niet opgeslagen lijst
let alleKiezers = [];
let account = null;

const begonnen = () => huidig && new Date(huidig.start_at) <= Date.now();
const gesloten = () => huidig && new Date(huidig.eind_at) <= Date.now();

function toonFout(e) {
  const f = $("#fout");
  f.textContent = foutTekst(e);
  f.hidden = false;
  f.scrollIntoView({ behavior: "smooth", block: "center" });
}
function wisFout() { $("#fout").hidden = true; }
function meld(id, tekst) {
  const m = $(id);
  m.textContent = tekst;
  setTimeout(() => { if (m.textContent === tekst) m.textContent = ""; }, 6000);
}

async function uploadAfbeelding(bestand, voorvoegsel) {
  if (!/^image\/(png|jpeg|webp)$/.test(bestand.type)) throw new Error("Kies een PNG-, JPG- of WebP-afbeelding.");
  if (bestand.size > 5 * 1024 * 1024) throw new Error("De afbeelding is groter dan 5 MB.");
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[bestand.type];
  const pad = `${voorvoegsel}-${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("media").upload(pad, bestand, { contentType: bestand.type, upsert: false });
  if (error) throw error;
  return db.storage.from("media").getPublicUrl(pad).data.publicUrl;
}

/* ---------------- Verkiezing ---------------- */

async function laadVerkiezingen(kiesId) {
  const { data, error } = await db.from("verkiezingen").select("*").order("start_at", { ascending: false });
  if (error) return toonFout(error);
  verkiezingen = data;
  const sel = $("#verkiezing-keuze");
  sel.replaceChildren(
    el("option", { value: "", text: data.length ? "Kies een verkiezing…" : "Nog geen verkiezingen" }),
    ...data.map((v) => el("option", { value: v.id, text: `${v.titel} (${fmtKort(v.start_at)})` })),
  );
  const kies = kiesId || data.find((v) => new Date(v.eind_at) > Date.now())?.id || data[0]?.id;
  if (kies) { sel.value = kies; await kiesVerkiezing(kies); }
  else nieuweVerkiezing();
}

function herinneringRij(waarde = "") {
  const invoer = el("input", { type: "datetime-local", value: waarde, "aria-label": "Moment van herinnering" });
  const rij = el("div", { class: "rij" }, invoer,
    el("button", { type: "button", class: "knop licht klein", text: "Weghalen", onclick: () => rij.parentNode.removeChild(rij) }));
  return rij;
}

/* ---------------- Bewaartermijn ---------------- */

// Bestaat de kolom al? (Niet als supabase/updates/002-bewaartermijn.sql nog niet is uitgevoerd.)
const bewaarKolom = () => !verkiezingen.length || "vernietigen_op" in verkiezingen[0];

// Standaard: 3 maanden na het eindmoment, als "YYYY-MM-DD".
function standaardVernietig(eindLokaal) {
  if (!eindLokaal) return "";
  const d = new Date(eindLokaal);
  d.setMonth(d.getMonth() + 3);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toonBewaartermijn(v) {
  const veld = $("#v-vernietigen");
  const status = $("#bewaar-status");
  const knop = $("#nu-vernietigen");
  knop.hidden = true;
  if (!bewaarKolom()) {
    veld.disabled = true;
    veld.value = "";
    status.textContent = "Voer eerst supabase/updates/002-bewaartermijn.sql uit in de SQL Editor van Supabase (zie de README).";
    return;
  }
  const standaard = standaardVernietig($("#v-eind").value);
  veld.value = v?.vernietigen_op || standaard;
  veld.dataset.auto = !v || v.vernietigen_op === standaard ? "1" : "";
  veld.disabled = !!v?.vernietigd_at;
  if (v?.vernietigd_at) {
    status.textContent = `De stemmen, de kiezerslijst en de meldingen zijn vernietigd op ${fmtDatum(v.vernietigd_at)}. De uitslag in aantallen is bewaard.`;
  } else {
    status.textContent = `Op ${fmtDag(veld.value)} worden de stemmen, de kiezerslijst (namen, e-mailadressen, wie gestemd heeft) en de meldingen automatisch vernietigd. De uitslag in aantallen blijft bewaard.`;
    knop.hidden = !gesloten();
  }
}

$("#v-eind").addEventListener("change", () => {
  const veld = $("#v-vernietigen");
  if (veld.dataset.auto === "1" && !veld.disabled) veld.value = standaardVernietig($("#v-eind").value);
});
$("#v-vernietigen").addEventListener("input", () => { $("#v-vernietigen").dataset.auto = ""; });

$("#nu-vernietigen").addEventListener("click", async () => {
  wisFout();
  if (!huidig || !gesloten()) return;
  if (!confirm(`Alle stemmen, de kiezerslijst en de meldingen van "${huidig.titel}" nu definitief vernietigen?\n\nDe uitslag in aantallen blijft bewaard. Dit kan niet ongedaan worden gemaakt.`)) return;
  const knop = $("#nu-vernietigen");
  knop.disabled = true;
  const { error } = await db.rpc("stemmen_vernietigen", { p_verkiezing: huidig.id });
  knop.disabled = false;
  if (error) return toonFout(error);
  await laadVerkiezingen(huidig.id);
  meld("#verkiezing-ok", "Stemmen vernietigd");
});

/* ---------------- Tabbladen ---------------- */

const TAB_SLEUTEL = "or-beheer-tab";
const tabKnoppen = $$(".tabs [role=tab]");
// Kandidaten, e-maillijst en versturen kunnen pas als er een verkiezing is opgeslagen.
const tabNodigVerkiezing = (naam) => ["kandidaten", "kiezers", "versturen"].includes(naam);

function toonTab(naam, focus = false) {
  if (tabNodigVerkiezing(naam) && $("#na-opslaan").hidden) naam = "verkiezing";
  for (const k of tabKnoppen) {
    const aan = k.dataset.tab === naam;
    k.setAttribute("aria-selected", aan ? "true" : "false");
    k.tabIndex = aan ? 0 : -1;
    if (aan && focus) k.focus();
  }
  for (const sec of $$(".tab-inhoud section[data-tab]")) sec.classList.toggle("actief", sec.dataset.tab === naam);
  try { localStorage.setItem(TAB_SLEUTEL, naam); } catch { /* geen opslag beschikbaar */ }
  window.scrollTo({ top: 0 });
}

function werkTabsBij() {
  const zonder = $("#na-opslaan").hidden;
  for (const k of tabKnoppen) {
    const uit = zonder && tabNodigVerkiezing(k.dataset.tab);
    k.setAttribute("aria-disabled", uit ? "true" : "false");
    k.title = uit ? "Sla eerst de verkiezing op" : "";
  }
  const actief = tabKnoppen.find((k) => k.getAttribute("aria-selected") === "true");
  if (actief && actief.getAttribute("aria-disabled") === "true") toonTab("verkiezing");
}

for (const k of tabKnoppen) {
  k.addEventListener("click", () => {
    if (k.getAttribute("aria-disabled") === "true") return toonFout("Sla eerst de verkiezing op. Daarna kun je kandidaten en de e-maillijst toevoegen.");
    wisFout();
    toonTab(k.dataset.tab);
  });
  // Pijltjestoetsen tussen de tabbladen.
  k.addEventListener("keydown", (e) => {
    const stap = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!stap) return;
    e.preventDefault();
    const bruikbaar = tabKnoppen.filter((t) => t.getAttribute("aria-disabled") !== "true");
    const i = bruikbaar.indexOf(k);
    toonTab(bruikbaar[(i + stap + bruikbaar.length) % bruikbaar.length].dataset.tab, true);
  });
}
new MutationObserver(werkTabsBij).observe($("#na-opslaan"), { attributes: true, attributeFilter: ["hidden"] });
const bewaardeTab = (() => { try { return localStorage.getItem(TAB_SLEUTEL); } catch { return null; } })();
toonTab("verkiezing");

function vulFormulier(v) {
  $("#v-titel").value = v?.titel ?? "";
  $("#v-toelichting").value = v?.toelichting ?? "";
  $("#v-start").value = naarLokaal(v?.start_at);
  $("#v-eind").value = naarLokaal(v?.eind_at);
  $("#v-uitslag").value = v?.uitslag_zichtbaar ?? "na_sluiting";
  $("#v-verzend").value = v?.verzendwijze ?? "samenvoegen";
  $("#herinneringen").replaceChildren(...(v?.herinneringen ?? []).map((h) => herinneringRij(naarLokaal(h))));
  toonBewaartermijn(v);

  const vast = begonnen();
  for (const id of ["#v-start", "#v-uitslag"]) $(id).disabled = !!vast;
  $("#verkiezing-weg").hidden = !v;

  const status = $("#verkiezing-status");
  if (!v) status.replaceChildren(el("span", { class: "chip warn", text: "Nieuw, nog niet opgeslagen" }));
  else if (gesloten()) status.replaceChildren(el("span", { class: "chip", text: "Gesloten" }), el("span", { class: "hint", text: `op ${fmtDatum(v.eind_at)}` }));
  else if (vast) status.replaceChildren(el("span", { class: "chip ok", text: "Stemming open" }), el("span", { class: "hint", text: `tot ${fmtDatum(v.eind_at)}` }));
  else status.replaceChildren(el("span", { class: "chip warn", text: "Concept" }), el("span", { class: "hint", text: `start ${fmtDatum(v.start_at)}` }));

  $("#start-blok").hidden = !v || !!vast;
  if (v && !vast) {
    $("#start-uitleg").textContent = `De stemming gaat vanzelf open op ${fmtDatum(v.start_at)}. Wil je nu al beginnen, klik dan op de knop. Daarna liggen de kandidaten vast en kun je de uitnodigingen versturen.`;
  }
}

$("#verkiezing-starten").addEventListener("click", async () => {
  wisFout();
  if (!huidig) return;
  const { data: kandidaten } = await db.from("kandidaten").select("id").eq("verkiezing_id", huidig.id);
  if (!kandidaten?.length) return toonFout("Voeg eerst de kandidaten toe.");
  if (!alleKiezers.length) return toonFout("Laad eerst de e-maillijst in.");
  if (!instellingen.site_url) return toonFout("Vul eerst het adres van deze website in bij Huisstijl en website.");
  if (new Date(huidig.eind_at) <= new Date()) return toonFout("Het eindmoment ligt al in het verleden. Pas eerst \"Stemmen kan tot\" aan.");
  if (!confirm(`"${huidig.titel}" nu starten? Collega's kunnen dan stemmen tot ${fmtDatum(huidig.eind_at)}. Kandidaten en starttijd liggen daarna vast.`)) return;
  const knop = $("#verkiezing-starten");
  knop.disabled = true;
  const { error } = await db.from("verkiezingen").update({ start_at: new Date().toISOString() }).eq("id", huidig.id);
  knop.disabled = false;
  if (error) return toonFout(error);
  await laadVerkiezingen(huidig.id);
  meld("#verzend-ok", "De verkiezing is gestart. Verstuur nu de uitnodigingen.");
  toonTab("versturen");
});

function nieuweVerkiezing() {
  huidig = null;
  $("#verkiezing-keuze").value = "";
  vulFormulier(null);
  $("#na-opslaan").hidden = true;
  $("#v-titel").focus();
}

async function kiesVerkiezing(id) {
  huidig = verkiezingen.find((v) => v.id === id) || null;
  vulFormulier(huidig);
  $("#na-opslaan").hidden = !huidig;
  if (huidig) await Promise.all([laadKandidaten(), laadKiezers(), laadVerzending()]);
}

$("#verkiezing-keuze").addEventListener("change", (e) => (e.target.value ? kiesVerkiezing(e.target.value) : nieuweVerkiezing()));
$("#nieuwe-verkiezing").addEventListener("click", nieuweVerkiezing);
$("#herinnering-erbij").addEventListener("click", () => {
  const eind = $("#v-eind").value ? new Date($("#v-eind").value) : null;
  const voorstel = eind ? naarLokaal(new Date(eind.getTime() - 24 * 36e5).toISOString()) : "";
  $("#herinneringen").append(herinneringRij(voorstel));
});

$("#verkiezing-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  wisFout();
  const rij = {
    titel: $("#v-titel").value.trim(),
    toelichting: $("#v-toelichting").value.trim() || null,
    start_at: vanLokaal($("#v-start").value),
    eind_at: vanLokaal($("#v-eind").value),
    uitslag_zichtbaar: $("#v-uitslag").value,
    verzendwijze: $("#v-verzend").value,
    herinneringen: $$("#herinneringen input").map((i) => vanLokaal(i.value)).filter(Boolean).sort(),
  };
  if (!rij.titel) return toonFout("Geef de verkiezing een titel.");
  if (huidig?.vernietigd_at) {
    // Archief: alleen titel en toelichting zijn nog aan te passen.
    const { error } = await db.from("verkiezingen").update({ titel: rij.titel, toelichting: rij.toelichting }).eq("id", huidig.id);
    if (error) return toonFout(error);
    meld("#verkiezing-ok", "Opgeslagen");
    return laadVerkiezingen(huidig.id);
  }
  if (!rij.start_at || !rij.eind_at) return toonFout("Vul een start- en eindmoment in.");
  if (new Date(rij.eind_at) <= new Date(rij.start_at)) return toonFout("Het eindmoment moet na de start liggen.");
  const buiten = rij.herinneringen.filter((h) => h <= rij.start_at || h >= rij.eind_at);
  if (buiten.length) return toonFout("Herinneringen moeten tussen de start en het eindmoment liggen.");
  if (begonnen()) { delete rij.start_at; delete rij.uitslag_zichtbaar; }
  if (bewaarKolom()) {
    rij.vernietigen_op = $("#v-vernietigen").value || null;
    if (rij.vernietigen_op && rij.vernietigen_op <= $("#v-eind").value.slice(0, 10)) {
      return toonFout("De datum om de stemmen te vernietigen moet na het einde van de stemming liggen.");
    }
  }

  const { data, error } = huidig
    ? await db.from("verkiezingen").update(rij).eq("id", huidig.id).select().single()
    : await db.from("verkiezingen").insert(rij).select().single();
  if (error) return toonFout(error);
  meld("#verkiezing-ok", "Opgeslagen");
  await laadVerkiezingen(data.id);
});

// Verwijderen: altijd via een venster waarin de naam moet worden overgetypt.
$("#verkiezing-weg").addEventListener("click", () => {
  if (!huidig) return;
  wisFout();
  const open = begonnen() && !gesloten();
  $("#verwijder-uitleg").textContent = begonnen()
    ? `"${huidig.titel}" wordt helemaal verwijderd: kandidaten, kiezerslijst, alle stemmen, meldingen en de uitslag.`
      + (open ? " Let op: de stemming is nog open. Stemlinks werken daarna niet meer." : "")
    : `"${huidig.titel}" wordt verwijderd, met de kandidaten en de kiezerslijst.`;
  $("#verwijder-titel").textContent = huidig.titel;
  $("#verwijder-naam").value = "";
  $("#verwijder-ja").disabled = true;
  $("#verwijder-fout").hidden = true;
  $("#verwijder-venster").showModal();
  $("#verwijder-naam").focus();
});
$("#verwijder-naam").addEventListener("input", () => {
  $("#verwijder-ja").disabled = $("#verwijder-naam").value.trim() !== huidig?.titel.trim();
});
$("#verwijder-nee").addEventListener("click", () => $("#verwijder-venster").close());
$("#verwijder-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!huidig || $("#verwijder-ja").disabled) return;
  const knop = $("#verwijder-ja");
  knop.disabled = true;
  const { error } = await db.rpc("verkiezing_verwijderen", { p_verkiezing: huidig.id, p_titel: $("#verwijder-naam").value });
  if (error) {
    knop.disabled = false;
    $("#verwijder-fout").textContent = /verkiezing_verwijderen/.test(error.message || "")
      ? "Voer eerst supabase/updates/003-verkiezing-verwijderen.sql uit in de SQL Editor van Supabase (zie de README)."
      : foutTekst(error);
    $("#verwijder-fout").hidden = false;
    return;
  }
  const titel = huidig.titel;
  $("#verwijder-venster").close();
  await laadVerkiezingen();
  meld("#verkiezing-ok", `"${titel}" is verwijderd`);
});

/* ---------------- Kandidaten ---------------- */

async function laadKandidaten() {
  const { data, error } = await db.from("kandidaten").select("*").eq("verkiezing_id", huidig.id).order("volgorde").order("naam");
  if (error) return toonFout(error);
  const vast = begonnen();
  $("#kandidaat-erbij").hidden = vast;
  $("#kandidaten").replaceChildren(...data.map((k, i) => kandidaatKaart(k, i, vast)));
  if (!data.length) $("#kandidaten").append(el("p", { class: "hint", text: "Nog geen kandidaten. Voeg ze hieronder toe." }));
}

function kandidaatKaart(k, i, vast) {
  const id = k.id || "nieuw";
  const naam = el("input", { id: `kn-${id}`, value: k.naam || "", required: true, placeholder: "Voor- en achternaam" });
  const functie = el("input", { id: `kf-${id}`, value: k.functie || "", placeholder: "Bijv. Planner logistiek, 6 jaar in dienst" });
  const tekst = el("textarea", { id: `kt-${id}`, placeholder: "Een korte tekst over de kandidaat en waarom hij of zij in de OR wil." });
  tekst.value = k.tekst || "";
  const volgorde = el("input", { id: `kv-${id}`, type: "number", value: String(k.volgorde ?? i + 1), min: "0" });
  const foto = el("input", { id: `kp-${id}`, type: "file", accept: "image/png,image/jpeg,image/webp" });
  let fotoUrl = k.foto_url || null;
  const voorbeeld = el("div", {}, fotoOf(k.naam || "?", fotoUrl, i));
  foto.addEventListener("change", () => {
    if (foto.files[0]) voorbeeld.replaceChildren(el("img", { class: "foto", src: URL.createObjectURL(foto.files[0]), alt: "Nieuwe foto" }));
  });
  if (vast) for (const x of [naam, functie, tekst, volgorde, foto]) x.disabled = true;

  const ok = el("span", { class: "melding-ok", role: "status" });
  const kaart = el("form", { class: "kaart", novalidate: true },
    el("div", { class: "mini" }, voorbeeld, el("label", { class: "veld", for: `kp-${id}` }, "Foto", foto)),
    el("label", { class: "veld", for: `kn-${id}` }, "Naam", naam),
    el("label", { class: "veld", for: `kf-${id}` }, "Functie of korte omschrijving", functie),
    el("label", { class: "veld", for: `kt-${id}` }, "Tekst op de tegel", tekst),
    el("label", { class: "veld", for: `kv-${id}` }, "Volgorde", volgorde),
    vast ? el("p", { class: "hint", text: "Ligt vast: de stemming is begonnen." }) :
      el("div", { class: "rij" },
        el("button", { type: "submit", class: "knop klein", text: "Opslaan" }),
        k.id ? el("button", { type: "button", class: "knop gevaar klein", text: "Verwijderen", onclick: async () => {
          if (!confirm(`${k.naam} verwijderen als kandidaat?`)) return;
          const { error } = await db.from("kandidaten").delete().eq("id", k.id);
          if (error) return toonFout(error);
          laadKandidaten();
        } }) : null,
        ok),
  );
  kaart.addEventListener("submit", async (e) => {
    e.preventDefault();
    wisFout();
    if (!naam.value.trim()) return toonFout("Vul de naam van de kandidaat in.");
    try {
      if (foto.files[0]) fotoUrl = await uploadAfbeelding(foto.files[0], "kandidaat");
    } catch (err) { return toonFout(err); }
    const rij = {
      verkiezing_id: huidig.id, naam: naam.value.trim(), functie: functie.value.trim() || null,
      tekst: tekst.value.trim() || null, volgorde: Number(volgorde.value) || 0, foto_url: fotoUrl,
    };
    const { error } = k.id
      ? await db.from("kandidaten").update(rij).eq("id", k.id)
      : await db.from("kandidaten").insert(rij);
    if (error) return toonFout(error);
    await laadKandidaten();
  });
  return kaart;
}

$("#kandidaat-erbij").addEventListener("click", () => {
  const n = $$("#kandidaten form").length;
  $$("#kandidaten > p.hint").forEach((p) => p.parentNode.removeChild(p));
  const kaart = kandidaatKaart({ volgorde: n + 1 }, n, false);
  $("#kandidaten").append(kaart);
  $("input", kaart.querySelectorAll("label")[1]).focus();
});

/* ---------------- Kiezers ---------------- */

async function laadKiezers() {
  const rijen = [];
  for (let van = 0; ; van += 1000) {
    const { data, error } = await db.from("kiezers").select("id, naam, email, uitgenodigd_at, gestemd")
      .eq("verkiezing_id", huidig.id).order("naam").order("email").range(van, van + 999);
    if (error) return toonFout(error);
    rijen.push(...data);
    if (data.length < 1000) break;
  }
  alleKiezers = rijen;
  $("#kiezers-aantal").textContent = `${rijen.length} kiezers`;
  toonKiezers();
}

function toonKiezers() {
  const zoek = $("#kiezers-zoek").value.trim().toLowerCase();
  const lijst = alleKiezers.filter((k) => !zoek || k.naam.toLowerCase().includes(zoek) || k.email.includes(zoek));
  $("#kiezers").replaceChildren(el("table", {},
    el("thead", {}, el("tr", {}, el("th", { text: "Naam" }), el("th", { text: "E-mail" }), el("th", { text: "Uitgenodigd" }), el("th", { text: "Gestemd" }), el("th"))),
    el("tbody", {}, ...lijst.slice(0, 500).map((k) => el("tr", {},
      el("td", { text: k.naam }), el("td", { text: k.email }),
      el("td", { text: k.uitgenodigd_at ? fmtKort(k.uitgenodigd_at) : "nee" }),
      el("td", {}, k.gestemd ? el("span", { class: "chip ok", text: "ja" }) : "nee"),
      el("td", {}, k.gestemd || gesloten() ? null : el("button", { type: "button", class: "knop licht klein", text: "Weghalen", onclick: async () => {
        if (!confirm(`${k.email} uit de lijst halen? Deze collega kan dan niet meer stemmen.`)) return;
        const { error } = await db.rpc("kiezer_verwijderen", { p_kiezer: k.id });
        if (error) return toonFout(error);
        laadKiezers();
      } })))))));
  if (lijst.length > 500) $("#kiezers").append(el("p", { class: "hint", text: `Eerste 500 van ${lijst.length} getoond. Gebruik het zoekveld.` }));
}
$("#kiezers-zoek").addEventListener("input", toonKiezers);

function toonVoorbeeld(resultaat) {
  voorbeeldLijst = resultaat;
  const { geldig, dubbel, ongeldig } = resultaat;
  $("#vb-geldig").textContent = `${geldig.length} geldig`;
  $("#vb-dubbel").textContent = `${dubbel.length} dubbel, overgeslagen`;
  $("#vb-dubbel").hidden = !dubbel.length;
  $("#vb-ongeldig").textContent = `${ongeldig.length} ongeldig, overgeslagen`;
  $("#vb-ongeldig").hidden = !ongeldig.length;
  const regels = [
    ...geldig.map((r) => [r.naam, r.email, el("span", { class: "chip ok", text: "geldig" })]),
    ...dubbel.map((r) => [r.naam, r.email, el("span", { class: "chip warn", text: "dubbel" })]),
    ...ongeldig.map((r) => [r.naam, r.email, el("span", { class: "chip rood", text: "ongeldig" })]),
  ];
  $("#vb-tabel").replaceChildren(el("table", {},
    el("thead", {}, el("tr", {}, el("th", { text: "Naam" }), el("th", { text: "E-mail" }), el("th", { text: "" }))),
    el("tbody", {}, ...regels.map(([n, m, c]) => el("tr", {}, el("td", { text: n }), el("td", { text: m }), el("td", {}, c))))));
  $("#lijst-toevoegen").disabled = !geldig.length;
  $("#voorbeeld").hidden = false;
}

async function leesBestand(bestand) {
  wisFout();
  try {
    let rijen;
    if (/\.(xlsx|xls)$/i.test(bestand.name)) {
      const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
      const boek = XLSX.read(await bestand.arrayBuffer());
      const blad = boek.Sheets[boek.SheetNames[0]];
      rijen = XLSX.utils.sheet_to_json(blad, { header: 1, raw: false, defval: "" });
    } else {
      rijen = parseCsv(await bestand.text());
    }
    toonVoorbeeld(opschonen(uitTabel(rijen)));
  } catch (e) {
    toonFout("Dit bestand kon niet worden gelezen. Sla het op als CSV of Excel (.xlsx) en probeer het opnieuw.");
  }
}

$("#lijst-bestand").addEventListener("change", (e) => e.target.files[0] && leesBestand(e.target.files[0]));
const drop = $("#drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  if (e.dataTransfer.files[0]) leesBestand(e.dataTransfer.files[0]);
});
$("#plak-lezen").addEventListener("click", () => {
  const tekst = $("#lijst-plak").value;
  if (!tekst.trim()) return toonFout("Plak eerst adressen in het tekstvak.");
  // Lijkt het op een tabel (meerdere kolommen per regel)? Dan als tabel lezen.
  const tabelachtig = /\t/.test(tekst) && tekst.split(/\r?\n/).length > 1;
  toonVoorbeeld(opschonen(tabelachtig ? uitTabel(parseCsv(tekst)) : uitOutlook(tekst)));
});
$("#lijst-annuleren").addEventListener("click", () => { voorbeeldLijst = null; $("#voorbeeld").hidden = true; $("#lijst-bestand").value = ""; });
$("#lijst-toevoegen").addEventListener("click", async () => {
  if (!voorbeeldLijst?.geldig.length) return;
  wisFout();
  $("#lijst-toevoegen").disabled = true;
  let nieuw = 0, bestond = 0;
  const lijst = voorbeeldLijst.geldig;
  for (let i = 0; i < lijst.length; i += 500) {
    const { data, error } = await db.rpc("kiezers_toevoegen", { p_verkiezing: huidig.id, p_lijst: lijst.slice(i, i + 500) });
    if (error) { $("#lijst-toevoegen").disabled = false; return toonFout(error); }
    nieuw += data.nieuw;
    bestond += data.dubbel;
  }
  $("#voorbeeld").hidden = true;
  $("#lijst-plak").value = "";
  $("#lijst-bestand").value = "";
  meld("#lijst-ok", `${nieuw} kiezers toegevoegd${bestond ? `, ${bestond} stonden er al in` : ""}.`);
  await laadKiezers();
  laadVerzending();
});

/* ---------------- Versturen ---------------- */

async function laadVerzending() {
  const automatisch = huidig.verzendwijze === "outlook_automatisch";
  $("#verzend-automatisch").hidden = !automatisch;
  $("#verzend-samenvoegen").hidden = automatisch;
  if (automatisch) {
    const { data } = await db.from("mail_wachtrij").select("soort, status").eq("verkiezing_id", huidig.id);
    const tel = {};
    for (const r of data ?? []) tel[r.status] = (tel[r.status] || 0) + 1;
    const nietUitgenodigd = alleKiezers.filter((k) => !k.uitgenodigd_at).length;
    $("#wachtrij").replaceChildren(
      el("span", { class: "chip", text: `${nietUitgenodigd} nog niet uitgenodigd` }),
      el("span", { class: "chip warn", text: `${(tel.wacht || 0) + (tel.bezig || 0)} in de wachtrij` }),
      el("span", { class: "chip ok", text: `${tel.verzonden || 0} verzonden` }),
      tel.fout ? el("span", { class: "chip rood", text: `${tel.fout} mislukt, zie meldingen` }) : null,
    );
  } else {
    const nu = Date.now();
    const verlopen = (huidig.herinneringen || []).filter((h) => new Date(h) <= nu);
    const komend = (huidig.herinneringen || []).filter((h) => new Date(h) > nu);
    $("#herinner-todo").textContent = (huidig.herinneringen || []).length
      ? `Herinneringsmomenten: ${[...verlopen, ...komend].map(fmtKort).join(", ")}. Download op die momenten de herinneringslijst en verstuur hem.`
      : "";
  }
}

async function samenvoeglijst(soort) {
  wisFout();
  if (!instellingen.site_url) return toonFout("Vul eerst het adres van deze website in bij Huisstijl en website.");
  const { data, error } = await db.rpc("samenvoeglijst", { p_verkiezing: huidig.id, p_soort: soort });
  if (error) return toonFout(error);
  if (!data.length) return meld("#verzend-ok", "Er is niemand om te mailen.");
  const eind = fmtDatum(huidig.eind_at);
  const regels = [csvRegel(["naam", "voornaam", "email", "link", "sluit"]),
    ...data.map((r) => csvRegel([r.naam, (r.naam || "collega").split(" ")[0], r.email, r.link, eind]))];
  download(`${soort}-${huidig.titel.replace(/[^\w-]+/g, "-")}.csv`, regels.join("\r\n"));
  meld("#verzend-ok", `Lijst met ${data.length} collega's gedownload.`);
  laadKiezers();
}
$("#dl-uitnodiging").addEventListener("click", () => samenvoeglijst("uitnodiging"));

async function wordSjabloon(soort, knop) {
  wisFout();
  knop.disabled = true;
  try {
    const { data: kandidaten, error } = await db.from("kandidaten").select("naam, functie, foto_url")
      .eq("verkiezing_id", huidig.id).order("volgorde").order("naam");
    if (error) throw error;
    const [logo, ...fotos] = await Promise.all([laadAlsPng(instellingen.logo_url, 600), ...kandidaten.map((k) => laadAlsPng(k.foto_url, 240))]);
    const blob = maakWordSjabloon({
      soort,
      titel: huidig.titel,
      organisatie: instellingen.organisatie || "Ondernemingsraad",
      afzender: account?.naam || "",
      logo,
      kandidaten: kandidaten.map((k, i) => ({ naam: k.naam, functie: k.functie, foto: fotos[i] })),
      knopKleur: themaVariabelen(instellingen.thema, false)["--knop"].slice(1).toUpperCase(),
      knopTekst: themaVariabelen(instellingen.thema, false)["--on-petrol"].slice(1).toUpperCase(),
    });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `${soort}-sjabloon.docx` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.parentNode?.removeChild(a); }, 1000);
    meld("#verzend-ok", "Word-sjabloon gedownload. Open het in Word en koppel de lijst.");
  } catch (e) {
    toonFout(e);
  } finally {
    knop.disabled = false;
  }
}
$("#sj-uitnodiging").addEventListener("click", (e) => wordSjabloon("uitnodiging", e.currentTarget));
$("#sj-herinnering").addEventListener("click", (e) => wordSjabloon("herinnering", e.currentTarget));
$("#dl-herinnering").addEventListener("click", () => samenvoeglijst("herinnering"));

async function inplannen(soort) {
  wisFout();
  if (!instellingen.site_url) return toonFout("Vul eerst het adres van deze website in bij Huisstijl en website.");
  const vraag = soort === "uitnodiging"
    ? "Uitnodigingen versturen naar iedereen die er nog geen heeft gekregen?"
    : "Nu een herinnering sturen naar iedereen die nog niet gestemd heeft?";
  if (!confirm(vraag)) return;
  const { data, error } = await db.rpc("mail_inplannen", { p_verkiezing: huidig.id, p_soort: soort });
  if (error) return toonFout(error);
  meld("#verzend-ok", data ? `${data} mails klaargezet. Ze gaan de komende minuten de deur uit.` : "Er is niemand om te mailen.");
  laadVerzending();
}
$("#mail-uitnodiging").addEventListener("click", () => inplannen("uitnodiging"));
$("#mail-herinnering").addEventListener("click", () => inplannen("herinnering"));

/* ---------------- Kiescommissie ---------------- */

async function laadCommissie() {
  const { data, error } = await db.from("toegang").select("email, naam, rol, user_id, uitgenodigd_at").order("rol").order("naam");
  if (error) return toonFout(error);
  $("#commissie").replaceChildren(el("table", {},
    el("thead", {}, el("tr", {}, el("th", { text: "Naam" }), el("th", { text: "E-mail" }), el("th", { text: "Rol" }), el("th", { text: "Account" }), el("th"))),
    el("tbody", {}, ...data.map((t) => el("tr", {},
      el("td", { text: t.naam }), el("td", { text: t.email }), el("td", { text: t.rol }),
      el("td", {}, el("span", { class: `chip ${t.user_id ? "ok" : "warn"}`, text: t.user_id ? "Actief" : "Uitgenodigd" })),
      el("td", {}, t.rol === "beheerder" ? null : el("button", { type: "button", class: "knop licht klein", text: "Verwijderen", onclick: async () => {
        if (!confirm(`${t.naam} uit de kiescommissie halen? Diegene kan dan niet meer inloggen op de commissiepagina's.`)) return;
        const { error: err } = await db.rpc("commissie_verwijderen", { p_email: t.email });
        if (err) return toonFout(err);
        laadCommissie();
      } })))))));
}

$("#commissie-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  wisFout();
  const { error } = await db.rpc("commissie_uitnodigen", { p_naam: $("#k-naam").value, p_email: $("#k-email").value });
  if (error) return toonFout(/duplicate|unique/i.test(error.message) ? "Dit e-mailadres staat al in de lijst." : error);
  meld("#commissie-ok", `${$("#k-naam").value} is uitgenodigd. Stuur diegene de link hierboven.`);
  $("#k-naam").value = "";
  $("#k-email").value = "";
  laadCommissie();
});

function siteAdres() {
  return (instellingen.site_url || location.origin + location.pathname.replace(/\/[^/]*$/, "")).replace(/\/+$/, "");
}

$("#kopieer-link").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#registreer-link").textContent); meld("#commissie-ok", "Link gekopieerd."); }
  catch { getSelection().selectAllChildren($("#registreer-link")); }
});

/* ---------------- Huisstijl en thema ---------------- */

let gekozenLogo = null; // data-URL van een logo van de bedrijfswebsite

function huidigThema() {
  return { primair: $("#h-primair").value, accent: $("#h-accent").value, lettertype: $("#h-font").value };
}
function toonThemaLive() { pasThemaToe(huidigThema()); }

function toonHuisstijl() {
  $("#h-org").value = instellingen.organisatie || "";
  $("#h-site").value = instellingen.site_url || siteAdres();
  // Waarschuwen als de stemlinks naar een ander adres wijzen dan waar de app nu draait.
  const huidigAdres = location.origin + location.pathname.replace(/\/[^/]*$/, "");
  const anders = instellingen.site_url && instellingen.site_url.replace(/\/+$/, "") !== huidigAdres.replace(/\/+$/, "");
  $("#h-site-let-op").hidden = !anders;
  $("#h-site-let-op").textContent = anders ? `Let op: je gebruikt de app nu via ${huidigAdres}. Klopt het adres hierboven nog?` : "";
  $("#h-bedrijf").value = instellingen.bedrijf_website || "";
  const vb = $("#h-logo-voorbeeld");
  vb.hidden = !instellingen.logo_url;
  if (instellingen.logo_url) vb.src = instellingen.logo_url;
  const t = { ...STANDAARD, ...(instellingen.thema || {}) };
  $("#h-primair").value = t.primair;
  $("#h-accent").value = t.accent;
  $("#h-font").replaceChildren(
    el("option", { value: "", text: "Standaard (Public Sans)" }),
    ...LETTERTYPEN.filter((f) => f !== "Public Sans").map((f) => el("option", { value: f, text: f })),
  );
  $("#h-font").value = LETTERTYPEN.includes(t.lettertype) ? t.lettertype : "";
  $("#registreer-link").textContent = `${siteAdres()}/index.html#registreren`;
}

for (const id of ["#h-primair", "#h-accent", "#h-font"]) $(id).addEventListener("input", toonThemaLive);
$("#thema-standaard").addEventListener("click", () => {
  $("#h-primair").value = STANDAARD.primair;
  $("#h-accent").value = STANDAARD.accent;
  $("#h-font").value = "";
  toonThemaLive();
});

$("#thema-ophalen").addEventListener("click", async () => {
  wisFout();
  let adres = $("#h-bedrijf").value.trim();
  if (!adres) return toonFout("Vul eerst de website van je bedrijf in.");
  if (!/^https?:\/\//i.test(adres)) { adres = "https://" + adres; $("#h-bedrijf").value = adres; }
  const knop = $("#thema-ophalen");
  knop.disabled = true;
  $("#thema-status").textContent = "Website wordt bekeken… dit duurt een paar seconden.";
  const { data, error } = await db.functions.invoke("thema-ophalen", { body: { url: adres } });
  knop.disabled = false;
  if (error || data?.fout) {
    let melding = data?.fout;
    const status = error?.context?.status;
    let detail = "";
    if (!melding && error?.context?.text) {
      detail = await error.context.text().catch(() => "");
      try { melding = JSON.parse(detail)?.fout; } catch { /* geen JSON */ }
    }
    if (!melding) {
      if (status === 404) {
        melding = "De functie \"thema-ophalen\" is niet gevonden in Supabase. Controleer bij Edge Functions of hij precies zo heet (zie de README). Je kunt de kleuren hieronder ook zelf kiezen.";
      } else if (status) {
        melding = `De functie "thema-ophalen" gaf een fout (${status}${detail ? ": " + detail.slice(0, 200) : ""}). Kijk in Supabase bij Edge Functions > thema-ophalen > Logs. Je kunt de kleuren hieronder ook zelf kiezen.`;
      } else {
        melding = `De functie "thema-ophalen" reageert niet (${error?.message || "geen verbinding"}). Staat hij in Supabase bij Edge Functions, met de bestanden index.ts en herken.ts? Kijk anders bij Logs. Je kunt de kleuren hieronder ook zelf kiezen.`;
      }
    }
    $("#thema-status").textContent = "";
    return toonFout(melding);
  }
  toonVoorstel(data);
});

function toonVoorstel(v) {
  const kleuren = v.kleuren || [];
  $("#thema-kleuren").replaceChildren(...kleuren.map((k) => {
    const knop = el("button", { type: "button", class: "staal", title: k.hex, "aria-label": `Kleur ${k.hex}` });
    knop.style.background = k.hex;
    knop.addEventListener("click", () => {
      const doel = document.querySelector('input[name="kleurdoel"]:checked').value;
      $(doel === "accent" ? "#h-accent" : "#h-primair").value = k.hex;
      toonThemaLive();
    });
    return knop;
  }));
  if (v.primair) $("#h-primair").value = v.primair;
  if (v.accent) $("#h-accent").value = v.accent;
  const font = (v.lettertypen || []).find((f) => LETTERTYPEN.includes(f));
  if (font) $("#h-font").value = font === "Public Sans" ? "" : font;

  gekozenLogo = null;
  const logos = v.logos || [];
  $("#thema-logos-kop").hidden = !logos.length;
  $("#thema-logos").replaceChildren(...logos.map((src, i) => {
    const knop = el("button", { type: "button", class: "logo-keuze", "aria-pressed": "false" }, el("img", { src, alt: `Logo-optie ${i + 1}` }));
    knop.addEventListener("click", () => {
      const aan = knop.getAttribute("aria-pressed") !== "true";
      for (const b of $$("#thema-logos .logo-keuze")) b.setAttribute("aria-pressed", "false");
      knop.setAttribute("aria-pressed", aan ? "true" : "false");
      gekozenLogo = aan ? src : null;
    });
    return knop;
  }));
  if (!$("#h-org").value && v.naam) $("#h-org").value = `Ondernemingsraad ${v.naam}`;
  $("#thema-voorstel").hidden = false;
  const gevonden = [kleuren.length && `${kleuren.length} kleuren`, logos.length && (logos.length === 1 ? "1 logo" : `${logos.length} logo's`), font && `lettertype ${font}`].filter(Boolean);
  const onbekend = (v.lettertypen || []).filter((f) => !LETTERTYPEN.includes(f));
  let tekst = gevonden.length
    ? `Gevonden op ${v.bron}: ${gevonden.join(", ")}. Het voorstel staat hieronder ingevuld. Klik op "Huisstijl opslaan" om het te bewaren.`
    : "Er zijn geen duidelijke huisstijlkleuren gevonden. Kies de kleuren hieronder zelf.";
  if (onbekend.length && !font) tekst += ` Het lettertype van de website (${onbekend[0]}) is niet vrij beschikbaar; kies zelf een vergelijkbaar lettertype.`;
  $("#thema-status").textContent = tekst;
  toonThemaLive();
}

// Een logo (ook SVG) omzetten naar PNG zodat het overal werkt.
async function dataUrlNaarPng(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  let w = img.naturalWidth || 600, h = img.naturalHeight || 200;
  const schaal = Math.min(4, 800 / Math.max(w, h));
  w = Math.round(w * schaal); h = Math.round(h * schaal);
  const canvas = el("canvas", { width: w, height: h });
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  return new File([blob], "logo.png", { type: "image/png" });
}

/* ---------------- Voorbeeld stempagina ---------------- */

// Opent stem.html in voorbeeldmodus en geeft het thema (ook nog niet opgeslagen)
// en de kandidaten van de gekozen verkiezing door. Er wordt niets opgeslagen.
let voorbeeldVenster = null;

async function voorbeeldBiljet() {
  let kandidaten = [];
  if (huidig?.id) {
    const { data } = await db.from("kandidaten").select("id, naam, functie, tekst, foto_url")
      .eq("verkiezing_id", huidig.id).order("volgorde").order("naam");
    kandidaten = data || [];
  }
  if (!kandidaten.length) {
    kandidaten = ["A", "B"].map((l) => ({
      id: l, naam: `Kandidaat ${l}`, functie: "Functie en afdeling", foto_url: null,
      tekst: "Hier staat de korte motivatie van de kandidaat.",
    }));
  }
  return {
    titel: huidig?.titel || "Tussentijdse OR-verkiezing",
    toelichting: huidig ? huidig.toelichting : "Er is één zetel vrij in de ondernemingsraad.",
    eind_at: huidig?.eind_at || new Date(Date.now() + 3 * 864e5).toISOString(),
    logo_url: gekozenLogo || instellingen.logo_url || null,
    organisatie: $("#h-org").value.trim() || instellingen.organisatie,
    kandidaten,
  };
}

window.addEventListener("message", async (e) => {
  if (e.origin !== location.origin || !voorbeeldVenster || e.source !== voorbeeldVenster || e.data?.soort !== "voorbeeld-klaar") return;
  voorbeeldVenster.postMessage({ soort: "voorbeeld-biljet", thema: huidigThema(), biljet: await voorbeeldBiljet() }, location.origin);
});

for (const knop of $$(".voorbeeld-stem")) {
  knop.addEventListener("click", () => {
    voorbeeldVenster = window.open(`stem.html?voorbeeld=${Date.now()}#voorbeeld`, "or-voorbeeld");
    if (!voorbeeldVenster) toonFout("Je browser blokkeerde het voorbeeldvenster. Sta pop-ups toe voor deze website en probeer het opnieuw.");
  });
}

$("#huisstijl-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  wisFout();
  const site = $("#h-site").value.trim().replace(/\/+$/, "");
  if (site && !/^https:\/\//.test(site)) return toonFout("Het websiteadres moet met https:// beginnen.");
  const rij = {
    organisatie: $("#h-org").value.trim() || "Ondernemingsraad",
    site_url: site || null,
    thema: huidigThema(),
    bedrijf_website: $("#h-bedrijf").value.trim() || null,
  };
  try {
    const logo = $("#h-logo").files[0] || (gekozenLogo ? await dataUrlNaarPng(gekozenLogo) : null);
    if (logo) rij.logo_url = await uploadAfbeelding(logo, "logo");
  } catch (err) { return toonFout(err); }
  const { error } = await db.from("app_instellingen").update(rij).eq("id", 1);
  if (error) {
    return toonFout(/thema|bedrijf_website/.test(error.message)
      ? "De database kent het thema nog niet. Voer eenmalig supabase/updates/001-thema.sql uit in de SQL Editor van Supabase (zie de README)."
      : error);
  }
  $("#h-logo").value = "";
  gekozenLogo = null;
  for (const b of $$("#thema-logos .logo-keuze")) b.setAttribute("aria-pressed", "false");
  instellingen = await laadHuisstijl();
  toonHuisstijl();
  meld("#huisstijl-ok", "Opgeslagen");
});

/* ---------------- Start ---------------- */

$("#uitloggen").addEventListener("click", uitloggen);

(async function start() {
  account = await vereisLogin("beheerder");
  $("#wie").textContent = `Ingelogd als ${account.naam} (beheerder)`;
  $("#pagina").hidden = false;
  instellingen = await laadHuisstijl();
  toonHuisstijl();
  // Verlopen bewaartermijnen afhandelen (gebeurt ook elke nacht via de planner).
  await db.rpc("vernietigen_verlopen").then(() => {}, () => {});
  await Promise.all([laadVerkiezingen(), laadCommissie()]);
  werkTabsBij();
  toonTab(tabKnoppen.some((k) => k.dataset.tab === bewaardeTab) ? bewaardeTab : "verkiezing");
})();
