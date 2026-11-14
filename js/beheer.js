// Beheerscherm: alleen voor de beheerder.
import {
  db, $, $$, el, fmtDatum, fmtKort, naarLokaal, vanLokaal, fotoOf, laadHuisstijl,
  vereisLogin, uitloggen, foutTekst, download, csvRegel,
} from "./gemeen.js";
import { parseCsv, uitTabel, uitOutlook, opschonen } from "./lijst-inlezen.js";

let verkiezingen = [];
let huidig = null;          // de gekozen verkiezing (object) of null bij een nieuwe
let instellingen = {};
let voorbeeldLijst = null;  // ingelezen, nog niet opgeslagen lijst
let alleKiezers = [];

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

function vulFormulier(v) {
  $("#v-titel").value = v?.titel ?? "";
  $("#v-toelichting").value = v?.toelichting ?? "";
  $("#v-start").value = naarLokaal(v?.start_at);
  $("#v-eind").value = naarLokaal(v?.eind_at);
  $("#v-uitslag").value = v?.uitslag_zichtbaar ?? "na_sluiting";
  $("#v-verzend").value = v?.verzendwijze ?? "samenvoegen";
  $("#herinneringen").replaceChildren(...(v?.herinneringen ?? []).map((h) => herinneringRij(naarLokaal(h))));

  const vast = begonnen();
  for (const id of ["#v-start", "#v-uitslag"]) $(id).disabled = !!vast;
  $("#verkiezing-weg").hidden = !v || vast;

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
  $("#verzend-ok").closest("section").scrollIntoView({ behavior: "smooth", block: "start" });
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
  if (!rij.start_at || !rij.eind_at) return toonFout("Vul een start- en eindmoment in.");
  if (new Date(rij.eind_at) <= new Date(rij.start_at)) return toonFout("Het eindmoment moet na de start liggen.");
  const buiten = rij.herinneringen.filter((h) => h <= rij.start_at || h >= rij.eind_at);
  if (buiten.length) return toonFout("Herinneringen moeten tussen de start en het eindmoment liggen.");
  if (begonnen()) { delete rij.start_at; delete rij.uitslag_zichtbaar; }

  const { data, error } = huidig
    ? await db.from("verkiezingen").update(rij).eq("id", huidig.id).select().single()
    : await db.from("verkiezingen").insert(rij).select().single();
  if (error) return toonFout(error);
  meld("#verkiezing-ok", "Opgeslagen");
  await laadVerkiezingen(data.id);
});

$("#verkiezing-weg").addEventListener("click", async () => {
  if (!huidig || !confirm(`Weet je zeker dat je "${huidig.titel}" wilt verwijderen? Kandidaten en kiezerslijst gaan ook weg.`)) return;
  const { error } = await db.from("verkiezingen").delete().eq("id", huidig.id);
  if (error) return toonFout(error);
  await laadVerkiezingen();
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

/* ---------------- Huisstijl ---------------- */

function toonHuisstijl() {
  $("#h-org").value = instellingen.organisatie || "";
  $("#h-site").value = instellingen.site_url || siteAdres();
  const vb = $("#h-logo-voorbeeld");
  vb.hidden = !instellingen.logo_url;
  if (instellingen.logo_url) vb.src = instellingen.logo_url;
  $("#registreer-link").textContent = `${siteAdres()}/index.html#registreren`;
}

$("#huisstijl-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  wisFout();
  const site = $("#h-site").value.trim().replace(/\/+$/, "");
  if (site && !/^https:\/\//.test(site)) return toonFout("Het websiteadres moet met https:// beginnen.");
  const rij = { organisatie: $("#h-org").value.trim() || "Ondernemingsraad", site_url: site || null };
  try {
    const logo = $("#h-logo").files[0];
    if (logo) rij.logo_url = await uploadAfbeelding(logo, "logo");
  } catch (err) { return toonFout(err); }
  const { error } = await db.from("app_instellingen").update(rij).eq("id", 1);
  if (error) return toonFout(error);
  $("#h-logo").value = "";
  instellingen = await laadHuisstijl();
  toonHuisstijl();
  meld("#huisstijl-ok", "Opgeslagen");
});

/* ---------------- Start ---------------- */

$("#uitloggen").addEventListener("click", uitloggen);

(async function start() {
  const account = await vereisLogin("beheerder");
  $("#wie").textContent = `Ingelogd als ${account.naam} (beheerder)`;
  $("#pagina").hidden = false;
  instellingen = await laadHuisstijl();
  toonHuisstijl();
  await Promise.all([laadVerkiezingen(), laadCommissie()]);
})();
