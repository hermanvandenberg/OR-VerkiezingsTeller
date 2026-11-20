// Beheerscherm: alleen voor de beheerder.
import {
  db, $, $$, el, fmtDatum, fmtKort, fmtDag, naarLokaal, vanLokaal, fotoOf, laadHuisstijl,
  vereisLogin, uitloggen, foutTekst, download, csvRegel, t,
} from "./gemeen.js?v=20261120c";
import { parseCsv, uitTabel, uitOutlook, opschonen } from "./lijst-inlezen.js?v=20261120c";
import { maakWordSjabloon, laadAlsPng } from "./word-sjabloon.js?v=20261120c";
import { STANDAARD, LETTERTYPEN, pasThemaToe, themaVariabelen } from "./thema.js?v=20261120c";

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
  if (!/^image\/(png|jpeg|webp)$/.test(bestand.type)) throw new Error(t("Kies een PNG-, JPG- of WebP-afbeelding."));
  if (bestand.size > 5 * 1024 * 1024) throw new Error(t("De afbeelding is groter dan 5 MB."));
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
    el("option", { value: "", text: data.length ? t("Kies een verkiezing…") : t("Nog geen verkiezingen") }),
    ...data.map((v) => el("option", { value: v.id, text: `${v.titel} (${fmtKort(v.start_at)})` })),
  );
  const kies = kiesId || data.find((v) => new Date(v.eind_at) > Date.now())?.id || data[0]?.id;
  if (kies) { sel.value = kies; await kiesVerkiezing(kies); }
  else nieuweVerkiezing();
}

function herinneringRij(waarde = "") {
  const invoer = el("input", { type: "datetime-local", value: waarde, "aria-label": t("Moment van herinnering") });
  const rij = el("div", { class: "rij" }, invoer,
    el("button", { type: "button", class: "knop licht klein", text: t("Weghalen"), onclick: () => rij.parentNode.removeChild(rij) }));
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
    status.textContent = t("Voer eerst supabase/updates/002-bewaartermijn.sql uit in de SQL Editor van Supabase (zie de README).");
    return;
  }
  const standaard = standaardVernietig($("#v-eind").value);
  veld.value = v?.vernietigen_op || standaard;
  veld.dataset.auto = !v || v.vernietigen_op === standaard ? "1" : "";
  veld.disabled = !!v?.vernietigd_at;
  if (v?.vernietigd_at) {
    status.textContent = t("De stemmen, de kiezerslijst en de meldingen zijn vernietigd op {datum}. De uitslag in aantallen is bewaard.", { datum: fmtDatum(v.vernietigd_at) });
  } else {
    status.textContent = t("Op {datum} worden de stemmen, de kiezerslijst (namen, e-mailadressen, wie gestemd heeft) en de meldingen automatisch vernietigd. De uitslag in aantallen blijft bewaard.", { datum: fmtDag(veld.value) });
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
  if (!confirm(t("Alle stemmen, de kiezerslijst en de meldingen van \"{titel}\" nu definitief vernietigen?\n\nDe uitslag in aantallen blijft bewaard. Dit kan niet ongedaan worden gemaakt.", { titel: huidig.titel }))) return;
  const knop = $("#nu-vernietigen");
  knop.disabled = true;
  const { error } = await db.rpc("stemmen_vernietigen", { p_verkiezing: huidig.id });
  knop.disabled = false;
  if (error) return toonFout(error);
  await laadVerkiezingen(huidig.id);
  meld("#verkiezing-ok", t("Stemmen vernietigd"));
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
    k.title = uit ? t("Sla eerst de verkiezing op") : "";
  }
  const actief = tabKnoppen.find((k) => k.getAttribute("aria-selected") === "true");
  if (actief && actief.getAttribute("aria-disabled") === "true") toonTab("verkiezing");
}

for (const k of tabKnoppen) {
  k.addEventListener("click", () => {
    if (k.getAttribute("aria-disabled") === "true") return toonFout(t("Sla eerst de verkiezing op. Daarna kun je kandidaten en de e-maillijst toevoegen."));
    wisFout();
    toonTab(k.dataset.tab);
  });
  // Pijltjestoetsen tussen de tabbladen.
  k.addEventListener("keydown", (e) => {
    const stap = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!stap) return;
    e.preventDefault();
    const bruikbaar = tabKnoppen.filter((b) => b.getAttribute("aria-disabled") !== "true");
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
  if (!v) status.replaceChildren(el("span", { class: "chip warn", text: t("Nieuw, nog niet opgeslagen") }));
  else if (gesloten()) status.replaceChildren(el("span", { class: "chip", text: t("Gesloten") }), el("span", { class: "hint", text: t("op {datum}", { datum: fmtDatum(v.eind_at) }) }));
  else if (vast) status.replaceChildren(el("span", { class: "chip ok", text: t("Stemming open") }), el("span", { class: "hint", text: t("tot {datum}", { datum: fmtDatum(v.eind_at) }) }));
  else status.replaceChildren(el("span", { class: "chip warn", text: t("Concept") }), el("span", { class: "hint", text: t("start {datum}", { datum: fmtDatum(v.start_at) }) }));

  $("#start-blok").hidden = !v || !!vast;
  if (v && !vast) {
    $("#start-uitleg").textContent = t("De stemming gaat vanzelf open op {datum}. Wil je nu al beginnen, klik dan op de knop. Daarna liggen de kandidaten vast en kun je de uitnodigingen versturen.", { datum: fmtDatum(v.start_at) });
  }
}

$("#verkiezing-starten").addEventListener("click", async () => {
  wisFout();
  if (!huidig) return;
  const { data: kandidaten } = await db.from("kandidaten").select("id").eq("verkiezing_id", huidig.id);
  if (!kandidaten?.length) return toonFout(t("Voeg eerst de kandidaten toe."));
  if (!alleKiezers.length) return toonFout(t("Laad eerst de e-maillijst in."));
  if (!instellingen.site_url) return toonFout(t("Vul eerst het adres van deze website in bij Huisstijl en website."));
  if (new Date(huidig.eind_at) <= new Date()) return toonFout(t("Het eindmoment ligt al in het verleden. Pas eerst \"Stemmen kan tot\" aan."));
  if (!confirm(t("\"{titel}\" nu starten? Collega's kunnen dan stemmen tot {datum}. Kandidaten en starttijd liggen daarna vast.", { titel: huidig.titel, datum: fmtDatum(huidig.eind_at) }))) return;
  const knop = $("#verkiezing-starten");
  knop.disabled = true;
  const { error } = await db.from("verkiezingen").update({ start_at: new Date().toISOString() }).eq("id", huidig.id);
  knop.disabled = false;
  if (error) return toonFout(error);
  await laadVerkiezingen(huidig.id);
  meld("#verzend-ok", t("De verkiezing is gestart. Verstuur nu de uitnodigingen."));
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
  if (!rij.titel) return toonFout(t("Geef de verkiezing een titel."));
  if (huidig?.vernietigd_at) {
    // Archief: alleen titel en toelichting zijn nog aan te passen.
    const { error } = await db.from("verkiezingen").update({ titel: rij.titel, toelichting: rij.toelichting }).eq("id", huidig.id);
    if (error) return toonFout(error);
    meld("#verkiezing-ok", t("Opgeslagen"));
    return laadVerkiezingen(huidig.id);
  }
  if (!rij.start_at || !rij.eind_at) return toonFout(t("Vul een start- en eindmoment in."));
  if (new Date(rij.eind_at) <= new Date(rij.start_at)) return toonFout(t("Het eindmoment moet na de start liggen."));
  const buiten = rij.herinneringen.filter((h) => h <= rij.start_at || h >= rij.eind_at);
  if (buiten.length) return toonFout(t("Herinneringen moeten tussen de start en het eindmoment liggen."));
  // Een nieuwe verkiezing moet in de toekomst starten, anders liggen de kandidaten meteen vast.
  if (!begonnen() && new Date(rij.start_at) <= Date.now()) return toonFout(t("Het startmoment ligt nu of in het verleden. Kies een moment in de toekomst, bijvoorbeeld morgen. Zo kun je eerst de kandidaten en de e-maillijst toevoegen. Wil je eerder beginnen, gebruik dan daarna de knop Verkiezing nu starten."));
  if (begonnen()) { delete rij.start_at; delete rij.uitslag_zichtbaar; }
  if (bewaarKolom()) {
    rij.vernietigen_op = $("#v-vernietigen").value || null;
    if (rij.vernietigen_op && rij.vernietigen_op <= $("#v-eind").value.slice(0, 10)) {
      return toonFout(t("De datum om de stemmen te vernietigen moet na het einde van de stemming liggen."));
    }
  }

  const { data, error } = huidig
    ? await db.from("verkiezingen").update(rij).eq("id", huidig.id).select().single()
    : await db.from("verkiezingen").insert(rij).select().single();
  if (error) return toonFout(error);
  meld("#verkiezing-ok", t("Opgeslagen"));
  await laadVerkiezingen(data.id);
});

// Verwijderen: altijd via een venster waarin de naam moet worden overgetypt.
$("#verkiezing-weg").addEventListener("click", () => {
  if (!huidig) return;
  wisFout();
  const open = begonnen() && !gesloten();
  $("#verwijder-uitleg").textContent = begonnen()
    ? t("\"{titel}\" wordt helemaal verwijderd: kandidaten, kiezerslijst, alle stemmen, meldingen en de uitslag.", { titel: huidig.titel })
      + (open ? " " + t("Let op: de stemming is nog open. Stemlinks werken daarna niet meer.") : "")
    : t("\"{titel}\" wordt verwijderd, met de kandidaten en de kiezerslijst.", { titel: huidig.titel });
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
      ? t("Voer eerst supabase/updates/003-verkiezing-verwijderen.sql uit in de SQL Editor van Supabase (zie de README).")
      : foutTekst(error);
    $("#verwijder-fout").hidden = false;
    return;
  }
  const titel = huidig.titel;
  $("#verwijder-venster").close();
  await laadVerkiezingen();
  meld("#verkiezing-ok", t("\"{titel}\" is verwijderd", { titel }));
});

/* ---------------- Kandidaten ---------------- */

async function laadKandidaten() {
  const { data, error } = await db.from("kandidaten").select("*").eq("verkiezing_id", huidig.id).order("volgorde").order("naam");
  if (error) return toonFout(error);
  const vast = begonnen();
  $("#kandidaat-erbij").hidden = vast;
  $("#kandidaten").replaceChildren(...data.map((k, i) => kandidaatKaart(k, i, vast)));
  if (!data.length && vast) {
    // Begonnen zonder kandidaten (startmoment lag al in het verleden): uitleggen hoe het verder kan.
    $("#kandidaten").append(el("p", { class: "notitie warn", text: t("Deze verkiezing is al begonnen op {datum}, daarom kun je geen kandidaten meer toevoegen. Verwijder deze verkiezing in de tab Verkiezing (knop Verwijderen) en maak een nieuwe aan met een startmoment in de toekomst.", { datum: fmtDatum(huidig.start_at) }) }));
  } else if (!data.length) $("#kandidaten").append(el("p", { class: "hint", text: t("Nog geen kandidaten. Voeg ze hieronder toe.") }));
}

function kandidaatKaart(k, i, vast) {
  const id = k.id || "nieuw";
  const naam = el("input", { id: `kn-${id}`, value: k.naam || "", required: true, placeholder: t("Voor- en achternaam") });
  const functie = el("input", { id: `kf-${id}`, value: k.functie || "", placeholder: t("Bijv. Planner logistiek, 6 jaar in dienst") });
  const tekst = el("textarea", { id: `kt-${id}`, placeholder: t("Een korte tekst over de kandidaat en waarom hij of zij in de OR wil.") });
  tekst.value = k.tekst || "";
  const volgorde = el("input", { id: `kv-${id}`, type: "number", value: String(k.volgorde ?? i + 1), min: "0" });
  const foto = el("input", { id: `kp-${id}`, type: "file", accept: "image/png,image/jpeg,image/webp" });
  let fotoUrl = k.foto_url || null;
  const voorbeeld = el("div", {}, fotoOf(k.naam || "?", fotoUrl, i));
  foto.addEventListener("change", () => {
    if (foto.files[0]) voorbeeld.replaceChildren(el("img", { class: "foto", src: URL.createObjectURL(foto.files[0]), alt: t("Nieuwe foto") }));
  });
  if (vast) for (const x of [naam, functie, tekst, volgorde, foto]) x.disabled = true;

  const ok = el("span", { class: "melding-ok", role: "status" });
  const kaart = el("form", { class: "kaart", novalidate: true },
    el("div", { class: "mini" }, voorbeeld, el("label", { class: "veld", for: `kp-${id}` }, t("Foto"), foto)),
    el("label", { class: "veld", for: `kn-${id}` }, t("Naam"), naam),
    el("label", { class: "veld", for: `kf-${id}` }, t("Functie of korte omschrijving"), functie),
    el("label", { class: "veld", for: `kt-${id}` }, t("Tekst op de tegel"), tekst),
    el("label", { class: "veld", for: `kv-${id}` }, t("Volgorde"), volgorde),
    vast ? el("p", { class: "hint", text: t("Ligt vast: de stemming is begonnen.") }) :
      el("div", { class: "rij" },
        el("button", { type: "submit", class: "knop klein", text: t("Opslaan") }),
        k.id ? el("button", { type: "button", class: "knop gevaar klein", text: t("Verwijderen"), onclick: async () => {
          if (!confirm(t("{naam} verwijderen als kandidaat?", { naam: k.naam }))) return;
          const { error } = await db.from("kandidaten").delete().eq("id", k.id);
          if (error) return toonFout(error);
          laadKandidaten();
        } }) : null,
        ok),
  );
  kaart.addEventListener("submit", async (e) => {
    e.preventDefault();
    wisFout();
    if (!naam.value.trim()) return toonFout(t("Vul de naam van de kandidaat in."));
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
  $("#kiezers-aantal").textContent = t("{n} kiezers", { n: rijen.length });
  toonKiezers();
}

function toonKiezers() {
  const zoek = $("#kiezers-zoek").value.trim().toLowerCase();
  const lijst = alleKiezers.filter((k) => !zoek || k.naam.toLowerCase().includes(zoek) || k.email.includes(zoek));
  $("#kiezers").replaceChildren(el("table", {},
    el("thead", {}, el("tr", {}, el("th", { text: t("Naam") }), el("th", { text: t("E-mail") }), el("th", { text: t("Uitgenodigd") }), el("th", { text: t("Gestemd") }), el("th"))),
    el("tbody", {}, ...lijst.slice(0, 500).map((k) => el("tr", {},
      el("td", { text: k.naam }), el("td", { text: k.email }),
      el("td", { text: k.uitgenodigd_at ? fmtKort(k.uitgenodigd_at) : t("nee") }),
      el("td", {}, k.gestemd ? el("span", { class: "chip ok", text: t("ja") }) : t("nee")),
      el("td", {}, k.gestemd || gesloten() ? null : el("button", { type: "button", class: "knop licht klein", text: t("Weghalen"), onclick: async () => {
        if (!confirm(t("{email} uit de lijst halen? Deze collega kan dan niet meer stemmen.", { email: k.email }))) return;
        const { error } = await db.rpc("kiezer_verwijderen", { p_kiezer: k.id });
        if (error) return toonFout(error);
        laadKiezers();
      } })))))));
  if (lijst.length > 500) $("#kiezers").append(el("p", { class: "hint", text: t("Eerste 500 van {n} getoond. Gebruik het zoekveld.", { n: lijst.length }) }));
}
$("#kiezers-zoek").addEventListener("input", toonKiezers);

function toonVoorbeeld(resultaat) {
  voorbeeldLijst = resultaat;
  const { geldig, dubbel, ongeldig } = resultaat;
  $("#vb-geldig").textContent = t("{n} geldig", { n: geldig.length });
  $("#vb-dubbel").textContent = t("{n} dubbel, overgeslagen", { n: dubbel.length });
  $("#vb-dubbel").hidden = !dubbel.length;
  $("#vb-ongeldig").textContent = t("{n} ongeldig, overgeslagen", { n: ongeldig.length });
  $("#vb-ongeldig").hidden = !ongeldig.length;
  const regels = [
    ...geldig.map((r) => [r.naam, r.email, el("span", { class: "chip ok", text: t("geldig") })]),
    ...dubbel.map((r) => [r.naam, r.email, el("span", { class: "chip warn", text: t("dubbel") })]),
    ...ongeldig.map((r) => [r.naam, r.email, el("span", { class: "chip rood", text: t("ongeldig") })]),
  ];
  $("#vb-tabel").replaceChildren(el("table", {},
    el("thead", {}, el("tr", {}, el("th", { text: t("Naam") }), el("th", { text: t("E-mail") }), el("th", { text: "" }))),
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
    toonFout(t("Dit bestand kon niet worden gelezen. Sla het op als CSV of Excel (.xlsx) en probeer het opnieuw."));
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
  if (!tekst.trim()) return toonFout(t("Plak eerst adressen in het tekstvak."));
  // Lijkt het op een tabel (meerdere kolommen per regel)? Dan als tabel lezen.
  const tabelachtig = /\t/.test(tekst) && tekst.split(/\r?\n/).length > 1;
  toonVoorbeeld(opschonen(tabelachtig ? uitTabel(parseCsv(tekst)) : uitOutlook(tekst)));
});
/* Verzamelmail (distributiegroep) uit Microsoft 365 */

async function groepFunctie(body) {
  const { data, error } = await db.functions.invoke("groep-leden", { body });
  if (error) return { code: error?.context?.status === 403 ? "geen_toegang" : "niet_ingesteld" };
  return data || { code: "graph_fout" };
}

function groepMelding(code) {
  const nietIngesteld = t("De koppeling met Microsoft 365 is (nog) niet ingesteld. Kopieer de leden dan uit Outlook, zie de uitleg bij het plakvak. IT kan de koppeling instellen met de stappen in de README.");
  return {
    niet_ingesteld: nietIngesteld,
    inloggen_mislukt: t("Inloggen bij Microsoft 365 lukte niet. Vraag IT om de gegevens van de app-registratie te controleren."),
    geen_machtiging: t("De app mag de leden van groepen nog niet lezen. Vraag IT om de machtigingen GroupMember.Read.All en User.ReadBasic.All toe te voegen (zie de README)."),
    niet_gevonden: t("Deze verzamelmail is niet gevonden."),
    geen_toegang: t("Je hebt hier geen toegang toe. Log opnieuw in."),
  }[code] || t("Microsoft 365 gaf een fout. Probeer het later opnieuw, of kopieer de leden uit Outlook.");
}

async function zoekGroep() {
  wisFout();
  const zoek = $("#groep-zoek").value.trim();
  const uit = $("#groep-resultaat");
  if (zoek.length < 2) return toonFout(t("Typ minstens 2 letters van de naam of het adres."));
  uit.replaceChildren(el("span", { class: "hint", text: t("Bezig met zoeken…") }));
  const data = await groepFunctie({ zoek });
  if (data.code) { uit.replaceChildren(); return toonFout(groepMelding(data.code)); }
  if (!data.groepen.length) return uit.replaceChildren(el("span", { class: "hint", text: t("Geen verzamelmail gevonden met deze naam.") }));
  data.groepen.sort((a, b) => a.naam.localeCompare(b.naam));
  uit.replaceChildren(...data.groepen.map((g) => el("button", {
    type: "button", class: "knop licht klein", onclick: () => haalLeden(g), text: g.email ? `${g.naam} · ${g.email}` : g.naam,
  })));
}

async function haalLeden(g) {
  wisFout();
  const uit = $("#groep-resultaat");
  uit.replaceChildren(el("span", { class: "hint", text: t("Leden van {naam} worden opgehaald…", { naam: g.naam }) }));
  const data = await groepFunctie({ groep: g.id });
  if (data.code) { uit.replaceChildren(); return toonFout(groepMelding(data.code)); }
  // Bij elkaar voegen met wat al in het voorbeeld staat, zodat meerdere verzamelmails samen kunnen.
  const eerder = (!$("#voorbeeld").hidden && voorbeeldLijst) || { geldig: [], dubbel: [], ongeldig: [] };
  const nieuw = opschonen([...eerder.geldig, ...data.leden]);
  toonVoorbeeld({ geldig: nieuw.geldig, dubbel: [...eerder.dubbel, ...nieuw.dubbel], ongeldig: [...eerder.ongeldig, ...nieuw.ongeldig] });
  const tekst = [t("{n} leden van {naam} staan in het voorbeeld hieronder. Zoek eventueel nog een verzamelmail, of klik op Toevoegen aan de verkiezing.", { n: data.leden.length, naam: g.naam })];
  if (data.zonderMail) tekst.push(t("{n} leden zonder e-mailadres zijn overgeslagen.", { n: data.zonderMail }));
  uit.replaceChildren(el("span", { class: "hint", text: tekst.join(" ") }));
}

$("#groep-zoeken").addEventListener("click", zoekGroep);
$("#groep-zoek").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); zoekGroep(); } });

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
  meld("#lijst-ok", (bestond ? t("{n} kiezers toegevoegd, {m} stonden er al in.", { n: nieuw, m: bestond }) : t("{n} kiezers toegevoegd.", { n: nieuw })));
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
      el("span", { class: "chip", text: t("{n} nog niet uitgenodigd", { n: nietUitgenodigd }) }),
      el("span", { class: "chip warn", text: t("{n} in de wachtrij", { n: (tel.wacht || 0) + (tel.bezig || 0) }) }),
      el("span", { class: "chip ok", text: t("{n} verzonden", { n: tel.verzonden || 0 }) }),
      tel.fout ? el("span", { class: "chip rood", text: t("{n} mislukt, zie meldingen", { n: tel.fout }) }) : null,
    );
  } else {
    const nu = Date.now();
    const verlopen = (huidig.herinneringen || []).filter((h) => new Date(h) <= nu);
    const komend = (huidig.herinneringen || []).filter((h) => new Date(h) > nu);
    $("#herinner-todo").textContent = (huidig.herinneringen || []).length
      ? t("Herinneringsmomenten: {momenten}. Download op die momenten de herinneringslijst en verstuur hem.", { momenten: [...verlopen, ...komend].map(fmtKort).join(", ") })
      : "";
  }
}

async function samenvoeglijst(soort) {
  wisFout();
  if (!instellingen.site_url) return toonFout(t("Vul eerst het adres van deze website in bij Huisstijl en website."));
  const { data, error } = await db.rpc("samenvoeglijst", { p_verkiezing: huidig.id, p_soort: soort });
  if (error) return toonFout(error);
  if (!data.length) return meld("#verzend-ok", t("Er is niemand om te mailen."));
  const eind = fmtDatum(huidig.eind_at);
  const regels = [csvRegel(["naam", "voornaam", "email", "link", "sluit"]),
    ...data.map((r) => csvRegel([r.naam, (r.naam || "collega").split(" ")[0], r.email, r.link, eind]))];
  download(`${soort}-${huidig.titel.replace(/[^\w-]+/g, "-")}.csv`, regels.join("\r\n"));
  meld("#verzend-ok", t("Lijst met {n} collega's gedownload.", { n: data.length }));
  laadKiezers();
}
$("#dl-uitnodiging").addEventListener("click", () => samenvoeglijst("uitnodiging"));

async function wordSjabloon(soort, knop) {
  wisFout();
  knop.disabled = true;
  try {
    const { data: kandidaten, error } = await db.from("kandidaten").select("naam, functie, tekst, foto_url")
      .eq("verkiezing_id", huidig.id).order("volgorde").order("naam");
    if (error) throw error;
    const [logo, ...fotos] = await Promise.all([laadAlsPng(instellingen.logo_url, 600), ...kandidaten.map((k) => laadAlsPng(k.foto_url, 400, { vierkant: true }))]);
    const blob = maakWordSjabloon({
      soort,
      titel: huidig.titel,
      organisatie: instellingen.organisatie || "Ondernemingsraad",
      afzender: account?.naam || "",
      logo,
      toelichting: huidig.toelichting || "",
      kandidaten: kandidaten.map((k, i) => ({ naam: k.naam, functie: k.functie, tekst: k.tekst, foto: fotos[i] })),
      kleuren: themaVariabelen(instellingen.thema, false),
      lettertype: instellingen.thema?.lettertype || "",
    });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `${soort}-sjabloon.docx` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.parentNode?.removeChild(a); }, 1000);
    meld("#verzend-ok", t("Word-sjabloon gedownload. Open het in Word en koppel de lijst."));
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
  if (!instellingen.site_url) return toonFout(t("Vul eerst het adres van deze website in bij Huisstijl en website."));
  const vraag = soort === "uitnodiging"
    ? t("Uitnodigingen versturen naar iedereen die er nog geen heeft gekregen?")
    : t("Nu een herinnering sturen naar iedereen die nog niet gestemd heeft?");
  if (!confirm(vraag)) return;
  const { data, error } = await db.rpc("mail_inplannen", { p_verkiezing: huidig.id, p_soort: soort });
  if (error) return toonFout(error);
  meld("#verzend-ok", data ? t("{n} mails klaargezet. Ze gaan de komende minuten de deur uit.", { n: data }) : t("Er is niemand om te mailen."));
  laadVerzending();
}
$("#mail-uitnodiging").addEventListener("click", () => inplannen("uitnodiging"));
$("#mail-herinnering").addEventListener("click", () => inplannen("herinnering"));

/* ---------------- Kiescommissie ---------------- */

async function laadCommissie() {
  // commissie_lijst (update 004) weet of een account echt actief is; anders de oude manier.
  let { data, error } = await db.rpc("commissie_lijst");
  if (error && /commissie_lijst/.test(error.message || "")) {
    ({ data, error } = await db.from("toegang").select("email, naam, rol, user_id, uitgenodigd_at").order("rol").order("naam"));
    if (data) data = data.map((lid) => ({ ...lid, actief: !!lid.user_id }));
  }
  if (error) return toonFout(error);
  $("#commissie").replaceChildren(el("table", {},
    el("thead", {}, el("tr", {}, el("th", { text: t("Naam") }), el("th", { text: t("E-mail") }), el("th", { text: t("Rol") }), el("th", { text: t("Account") }), el("th"))),
    el("tbody", {}, ...data.map((lid) => el("tr", {},
      naamCel(lid), el("td", { text: lid.email }), el("td", { text: t(lid.rol) }),
      el("td", {}, el("span", { class: `chip ${lid.actief ? "ok" : "warn"}`, text: lid.actief ? t("Actief") : t("Uitgenodigd") })),
      el("td", {}, lid.rol === "beheerder" ? null : el("span", { class: "rij" },
        lid.actief ? null : el("button", { type: "button", class: "knop licht klein", text: t("Uitnodiging opnieuw mailen"), onclick: async (e) => {
          e.currentTarget.disabled = true;
          await mailUitnodiging(lid.email, lid.naam);
          laadCommissie();
        } }),
        el("button", { type: "button", class: "knop licht klein", text: t("Verwijderen"), onclick: async () => {
          if (!confirm(t("{naam} uit de kiescommissie halen? Diegene kan dan niet meer inloggen op de commissiepagina's.", { naam: lid.naam }))) return;
          const { error: err } = await db.rpc("commissie_verwijderen", { p_email: lid.email });
          if (err) return toonFout(err);
          laadCommissie();
        } }))))))));
}

// Naam met een knopje "Wijzigen"; daarna een invoerveld met Opslaan en Annuleren.
function naamCel(lid) {
  const cel = el("td");
  const toon = () => cel.replaceChildren(el("span", { class: "rij" }, el("span", { text: lid.naam }),
    el("button", { type: "button", class: "knop licht klein", text: t("Wijzigen"), "aria-label": t("Naam van {naam} wijzigen", { naam: lid.naam }), onclick: bewerk })));
  function bewerk() {
    const veld = el("input", { value: lid.naam, maxlength: "100", "aria-label": t("Nieuwe naam"), autocomplete: "off" });
    const opslaan = async () => {
      const naam = veld.value.trim();
      if (!naam) return veld.focus();
      wisFout();
      const { error } = await db.rpc("naam_wijzigen", { p_email: lid.email, p_naam: naam });
      if (error) return toonFout(/naam_wijzigen/.test(error.message || "")
        ? t("Namen aanpassen werkt pas als update 006 in Supabase is uitgevoerd (zie de README).") : error);
      if (lid.rol === "beheerder" && account) {
        account.naam = naam;
        $("#wie").textContent = t("Ingelogd als {naam} (beheerder)", { naam });
      }
      meld("#commissie-ok", t("Naam gewijzigd in {naam}.", { naam }));
      laadCommissie();
    };
    veld.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); opslaan(); }
      if (e.key === "Escape") toon();
    });
    cel.replaceChildren(el("span", { class: "rij" }, veld,
      el("button", { type: "button", class: "knop klein", text: t("Opslaan"), onclick: opslaan }),
      el("button", { type: "button", class: "knop licht klein", text: t("Annuleren"), onclick: toon })));
    veld.focus();
    veld.select();
  }
  toon();
  return cel;
}

$("#logboek-leeg").addEventListener("click", async (e) => {
  if (!confirm(t("Het hele logboek leegmaken? Dit kan niet ongedaan worden gemaakt. Er blijft één regel staan dat jij het logboek hebt geleegd."))) return;
  wisFout();
  const knop = e.currentTarget;
  knop.disabled = true;
  const { data, error } = await db.rpc("logboek_leegmaken");
  knop.disabled = false;
  if (error) return toonFout(/logboek_leegmaken/.test(error.message || "")
    ? t("Het logboek leegmaken werkt pas als update 006 in Supabase is uitgevoerd (zie de README).") : error);
  meld("#logboek-ok", t("Logboek geleegd: {n} regels verwijderd.", { n: data }));
});

// Uitnodigingsmail via de functie commissie-uitnodigen. Lukt dat niet, dan uitleggen
// hoe het verder kan (de registratielink zelf sturen).
async function mailUitnodiging(email, naam) {
  const { data, error } = await db.functions.invoke("commissie-uitnodigen", { body: { email } });
  const code = error ? (error?.context?.status === 403 ? "geen_toegang" : "niet_ingesteld") : data?.ok ? "ok" : data?.code;
  const teksten = {
    ok: t("Uitnodiging gemaild naar {naam} ({email}). Diegene klikt op de link in de mail, kiest een wachtwoord en stelt tweestapsverificatie in.", { naam, email }),
    al_geregistreerd: t("{naam} heeft al een account en kan gewoon inloggen. Wachtwoord vergeten? Gebruik dan Wachtwoord vergeten op de inlogpagina.", { naam }),
    geen_site: t("Vul eerst het adres van deze website in bij Huisstijl en website."),
    limiet: t("De mailserver laat nu even geen mails meer toe. Probeer het over een uur opnieuw, of stel een eigen mailserver in (zie de README)."),
    niet_ingesteld: t("{naam} staat in de lijst, maar de uitnodigingsmail kon niet worden verstuurd: de functie commissie-uitnodigen is nog niet geïnstalleerd (zie de README). Stuur diegene voorlopig de link hierboven.", { naam }),
  };
  if (code === "ok") return meld("#commissie-ok", teksten.ok);
  if (code === "al_geregistreerd") return meld("#commissie-ok", teksten.al_geregistreerd);
  toonFout(teksten[code] || t("De uitnodigingsmail kon niet worden verstuurd ({fout}). Stuur {naam} voorlopig de link hierboven.", { fout: data?.detail || code || "?", naam }));
}

$("#commissie-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  wisFout();
  const naam = $("#k-naam").value.trim(), email = $("#k-email").value.trim();
  const { error } = await db.rpc("commissie_uitnodigen", { p_naam: naam, p_email: email });
  if (error) return toonFout(/duplicate|unique/i.test(error.message) ? t("Dit e-mailadres staat al in de lijst.") : error);
  $("#k-naam").value = "";
  $("#k-email").value = "";
  await mailUitnodiging(email.toLowerCase(), naam);
  laadCommissie();
});

function siteAdres() {
  return (instellingen.site_url || location.origin + location.pathname.replace(/\/[^/]*$/, "")).replace(/\/+$/, "");
}

$("#kopieer-link").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#registreer-link").textContent); meld("#commissie-ok", t("Link gekopieerd.")); }
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
  $("#h-site-let-op").textContent = anders ? t("Let op: je gebruikt de app nu via {adres}. Klopt het adres hierboven nog?", { adres: huidigAdres }) : "";
  $("#h-bedrijf").value = instellingen.bedrijf_website || "";
  const vb = $("#h-logo-voorbeeld");
  vb.hidden = !instellingen.logo_url;
  if (instellingen.logo_url) vb.src = instellingen.logo_url;
  const th = { ...STANDAARD, ...(instellingen.thema || {}) };
  $("#h-primair").value = th.primair;
  $("#h-accent").value = th.accent;
  $("#h-font").replaceChildren(
    el("option", { value: "", text: t("Standaard (Public Sans)") }),
    ...LETTERTYPEN.filter((f) => f !== "Public Sans").map((f) => el("option", { value: f, text: f })),
  );
  $("#h-font").value = LETTERTYPEN.includes(th.lettertype) ? th.lettertype : "";
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
  if (!adres) return toonFout(t("Vul eerst de website van je bedrijf in."));
  if (!/^https?:\/\//i.test(adres)) { adres = "https://" + adres; $("#h-bedrijf").value = adres; }
  const knop = $("#thema-ophalen");
  knop.disabled = true;
  $("#thema-status").textContent = t("Website wordt bekeken… dit duurt een paar seconden.");
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
        melding = t("De functie \"thema-ophalen\" is niet gevonden in Supabase. Controleer bij Edge Functions of hij precies zo heet (zie de README). Je kunt de kleuren hieronder ook zelf kiezen.");
      } else if (status) {
        melding = t("De functie \"thema-ophalen\" gaf een fout ({fout}). Kijk in Supabase bij Edge Functions > thema-ophalen > Logs. Je kunt de kleuren hieronder ook zelf kiezen.", { fout: status + (detail ? ": " + detail.slice(0, 200) : "") });
      } else {
        melding = t("De functie \"thema-ophalen\" reageert niet ({fout}). Staat hij in Supabase bij Edge Functions, met de bestanden index.ts en herken.ts? Kijk anders bij Logs. Je kunt de kleuren hieronder ook zelf kiezen.", { fout: error?.message || t("geen verbinding") });
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
    const knop = el("button", { type: "button", class: "staal", title: k.hex, "aria-label": t("Kleur {hex}", { hex: k.hex }) });
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
    const knop = el("button", { type: "button", class: "logo-keuze", "aria-pressed": "false" }, el("img", { src, alt: t("Logo-optie {n}", { n: i + 1 }) }));
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
  const gevonden = [kleuren.length && t("{n} kleuren", { n: kleuren.length }), logos.length && (logos.length === 1 ? t("1 logo") : t("{n} logo's", { n: logos.length })), font && t("lettertype {font}", { font })].filter(Boolean);
  const onbekend = (v.lettertypen || []).filter((f) => !LETTERTYPEN.includes(f));
  let tekst = gevonden.length
    ? t("Gevonden op {bron}: {gevonden}. Het voorstel staat hieronder ingevuld. Klik op Huisstijl opslaan om het te bewaren.", { bron: v.bron, gevonden: gevonden.join(", ") })
    : t("Er zijn geen duidelijke huisstijlkleuren gevonden. Kies de kleuren hieronder zelf.");
  if (onbekend.length && !font) tekst += " " + t("Het lettertype van de website ({font}) is niet vrij beschikbaar; kies zelf een vergelijkbaar lettertype.", { font: onbekend[0] });
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
      id: l, naam: t("Kandidaat {l}", { l }), functie: t("Functie en afdeling"), foto_url: null,
      tekst: t("Hier staat de korte motivatie van de kandidaat."),
    }));
  }
  return {
    titel: huidig?.titel || t("Tussentijdse OR-verkiezing"),
    toelichting: huidig ? huidig.toelichting : t("Er is één zetel vrij in de ondernemingsraad."),
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
    if (!voorbeeldVenster) toonFout(t("Je browser blokkeerde het voorbeeldvenster. Sta pop-ups toe voor deze website en probeer het opnieuw."));
  });
}

$("#huisstijl-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  wisFout();
  const site = $("#h-site").value.trim().replace(/\/+$/, "");
  if (site && !/^https:\/\//.test(site)) return toonFout(t("Het websiteadres moet met https:// beginnen."));
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
      ? t("De database kent het thema nog niet. Voer eenmalig supabase/updates/001-thema.sql uit in de SQL Editor van Supabase (zie de README).")
      : error);
  }
  $("#h-logo").value = "";
  gekozenLogo = null;
  for (const b of $$("#thema-logos .logo-keuze")) b.setAttribute("aria-pressed", "false");
  instellingen = await laadHuisstijl();
  toonHuisstijl();
  meld("#huisstijl-ok", t("Opgeslagen"));
});

/* ---------------- Start ---------------- */

$("#uitloggen").addEventListener("click", uitloggen);

(async function start() {
  account = await vereisLogin("beheerder");
  $("#wie").textContent = t("Ingelogd als {naam} (beheerder)", { naam: account.naam });
  $("#pagina").hidden = false;
  instellingen = await laadHuisstijl();
  toonHuisstijl();
  // Verlopen bewaartermijnen afhandelen (gebeurt ook elke nacht via de planner).
  await db.rpc("vernietigen_verlopen").then(() => {}, () => {});
  await Promise.all([laadVerkiezingen(), laadCommissie()]);
  werkTabsBij();
  toonTab(tabKnoppen.some((k) => k.dataset.tab === bewaardeTab) ? bewaardeTab : "verkiezing");
})();
