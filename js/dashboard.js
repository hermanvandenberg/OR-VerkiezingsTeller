// Scherm van de kiescommissie.
import { db, $, el, fmtDatum, fmtKort, laadHuisstijl, vereisLogin, uitloggen, foutTekst, download, csvRegel } from "./gemeen.js";

const SOORTEN = {
  ander_emailadres: "Ander e-mailadres ingevuld",
  opnieuw_geprobeerd: "Opnieuw geprobeerd te stemmen",
  veel_ongeldige_links: "Veel ongeldige stemlinks",
  mail_mislukt: "Mail niet verstuurd",
};
const STATUS = { open: ["Stemming open", "ok"], nog_niet_open: ["Nog niet begonnen", "warn"], gesloten: ["Gesloten", ""] };

let account;
let huidig = null;   // verkiezing-id
let laatsteData = null;

function toonFout(e) {
  const f = $("#fout");
  f.textContent = foutTekst(e);
  f.hidden = false;
}

function resterend(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return "–";
  const d = Math.floor(ms / 864e5), u = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
  return d ? `${d}d ${u}u` : u ? `${u}u ${m}m` : `${m}m`;
}

async function laadVerkiezingen() {
  const { data, error } = await db.from("verkiezingen").select("id, titel, start_at, eind_at").order("start_at", { ascending: false });
  if (error) throw error;
  const sel = $("#verkiezing");
  sel.replaceChildren(...data.map((v) => el("option", { value: v.id, text: `${v.titel} (${fmtKort(v.start_at)})` })));
  if (!data.length) { $("#leeg").hidden = false; $("#overzicht").hidden = true; return; }
  const nu = Date.now();
  const open = data.find((v) => new Date(v.start_at) <= nu && nu < new Date(v.eind_at));
  huidig = (open || data[0]).id;
  sel.value = huidig;
  $("#overzicht").hidden = false;
}

async function vernieuw() {
  if (!huidig) return;
  const { data: d, error } = await db.rpc("dashboard", { p_verkiezing: huidig });
  if (error) return toonFout(error);
  laatsteData = d;

  const [statusTekst, statusSoort] = STATUS[d.status];
  $("#status-chip").textContent = statusTekst;
  $("#status-chip").className = `chip ${statusSoort}`;
  $("#periode").textContent = `${fmtDatum(d.start_at)} tot ${fmtDatum(d.eind_at)}`;
  $("#c-gestemd").textContent = d.gestemd;
  $("#c-gestemd-van").textContent = `van ${d.kiezers} gestemd`;
  const pct = d.kiezers ? Math.round((d.gestemd / d.kiezers) * 100) : 0;
  $("#c-opkomst").textContent = `${pct}%`;
  $("#opkomst-balk").style.width = `${pct}%`;
  $("#c-meldingen").textContent = d.open_meldingen;
  if (d.status === "nog_niet_open") { $("#c-tijd").textContent = resterend(d.start_at); $("#c-tijd-label").textContent = "tot start"; }
  else if (d.status === "gesloten") { $("#c-tijd").textContent = "0"; $("#c-tijd-label").textContent = "gesloten"; }
  else { $("#c-tijd").textContent = resterend(d.eind_at); $("#c-tijd-label").textContent = "tot sluiting"; }

  // Uitslag
  const zichtbaar = Array.isArray(d.uitslag);
  $("#uitslag-slot").hidden = zichtbaar;
  $("#uitslag").hidden = !zichtbaar;
  $("#uitslag-download").hidden = !(zichtbaar && d.status === "gesloten");
  $("#uitslag-slot-tekst").textContent = `De uitslag is zichtbaar vanaf ${fmtDatum(d.eind_at)}.`;
  if (zichtbaar) {
    const totaal = d.uitslag.reduce((s, r) => s + Number(r.stemmen), 0);
    $("#uitslag").replaceChildren(...d.uitslag.map((r, i) => {
      const p = totaal ? Math.round((r.stemmen / totaal) * 100) : 0;
      const balk = el("i");
      balk.style.width = `${p}%`;
      return el("div", { class: `r ${r.volgorde === 1000000 ? "onth" : `c${i % 4}`}` },
        el("span", { text: r.naam }), el("span", { class: "balk" }, balk), el("em", { text: `${r.stemmen} · ${p}%` }));
    }));
  }
  const extra = [];
  if (d.status === "open" && zichtbaar) extra.push("Dit is een tussenstand.");
  if (d.apart) extra.push(`${d.apart} ${d.apart === 1 ? "stem staat" : "stemmen staan"} apart en ${d.apart === 1 ? "telt" : "tellen"} pas mee na goedkeuring.`);
  if (d.afgekeurd) extra.push(`${d.afgekeurd} afgekeurd.`);
  $("#uitslag-extra").textContent = extra.join(" ");

  // Stemmers tonen
  $("#tonen-kaart").hidden = d.stemgeheim !== "tonen_mogelijk";
  $("#mijn-akkoord").checked = d.mijn_akkoord;
  $("#akkoord-stand").textContent = `${d.akkoorden} van de minimaal 2 akkoorden gegeven.`;
  $("#lijst-tonen").hidden = d.akkoorden < 2;
  if (d.akkoorden < 2) $("#stemmers").hidden = true;

  await Promise.all([laadMeldingen(), laadLogboek()]);
}

async function laadMeldingen() {
  const { data, error } = await db.rpc("meldingen_lijst", { p_verkiezing: huidig });
  if (error) return toonFout(error);
  const lijst = $("#meldingen");
  if (!data.length) { lijst.replaceChildren(el("p", { class: "hint", text: "Geen meldingen. Alles loopt zoals het hoort." })); return; }
  lijst.replaceChildren(...data.map((m) => {
    const regels = [el("b", { text: SOORTEN[m.soort] || m.soort }), el("br"), el("span", { class: "hint", text: m.omschrijving })];
    if (m.kiezer_email) regels.push(el("br"), el("span", { class: "hint", text: `Uitnodiging aan: ${m.kiezer_naam || ""} <${m.kiezer_email}>` }));
    if (m.ingevulde_email && m.soort === "ander_emailadres") regels.push(el("br"), el("span", { class: "hint", text: `Ingevuld: ${m.ingevulde_naam || ""} <${m.ingevulde_email}>` }));
    if (m.aantal > 1) regels.push(el("br"), el("span", { class: "hint", text: `${m.aantal} keer` }));
    regels.push(el("br"), el("span", { class: "hint", text: fmtKort(m.aangemaakt_at) }));

    let acties;
    if (m.status !== "open") {
      const tekst = { goedgekeurd: "Goedgekeurd", afgekeurd: "Afgekeurd", gezien: "Gezien" }[m.status];
      acties = el("span", { class: `chip ${m.status === "afgekeurd" ? "rood" : "ok"}`, text: `${tekst} door ${m.afgehandeld_door}` });
    } else if (m.heeft_stem) {
      acties = el("span", { class: "rij" },
        el("button", { type: "button", class: "knop klein", onclick: (e) => afhandelen(m.id, "goedgekeurd", e.currentTarget), text: "Goedkeuren" }),
        el("button", { type: "button", class: "knop gevaar klein", onclick: (e) => afhandelen(m.id, "afgekeurd", e.currentTarget), text: "Afkeuren" }));
    } else {
      acties = el("button", { type: "button", class: "knop licht klein", onclick: (e) => afhandelen(m.id, "gezien", e.currentTarget), text: "Gezien" });
    }
    return el("div", { class: `alert ${m.status === "open" ? "" : "af"}` }, el("span", {}, ...regels), acties);
  }));
}

// Goed- en afkeuren vragen om een tweede klik ter bevestiging.
async function afhandelen(id, besluit, knop) {
  if (besluit !== "gezien" && !knop.dataset.zeker) {
    knop.dataset.zeker = "1";
    knop.textContent = besluit === "goedgekeurd" ? "Zeker? Stem telt dan mee" : "Zeker? Stem vervalt";
    knop.title = besluit === "afgekeurd"
      ? "De collega kan daarna opnieuw stemmen met een nieuwe link (stuur een herinnering)."
      : "";
    return;
  }
  knop.disabled = true;
  const { error } = await db.rpc("melding_afhandelen", { p_id: id, p_besluit: besluit });
  if (error) return toonFout(error);
  vernieuw();
}

async function laadLogboek() {
  const { data, error } = await db.from("logboek").select("at, wie, actie, details, verkiezing_id")
    .or(`verkiezing_id.eq.${huidig},verkiezing_id.is.null`).order("id", { ascending: false }).limit(100);
  if (error) return toonFout(error);
  $("#logboek").replaceChildren(el("table", {},
    el("thead", {}, el("tr", {}, el("th", { text: "Wanneer" }), el("th", { text: "Wie" }), el("th", { text: "Wat" }))),
    el("tbody", {}, ...data.map((r) => el("tr", {},
      el("td", { text: fmtKort(r.at) }), el("td", { text: r.wie }),
      el("td", {}, r.actie, r.details ? el("div", { class: "hint mono", text: Object.entries(r.details).map(([k, v]) => `${k}: ${/^\d{4}-\d\d-\d\dT/.test(v) ? fmtKort(v) : v}`).join(" · ") }) : null))))));
}

$("#mijn-akkoord").addEventListener("change", async (e) => {
  const { error } = await db.rpc("toon_akkoord", { p_verkiezing: huidig, p_aan: e.target.checked });
  if (error) { e.target.checked = !e.target.checked; return toonFout(error); }
  vernieuw();
});

$("#lijst-tonen").addEventListener("click", async () => {
  const { data, error } = await db.rpc("stemmers_lijst", { p_verkiezing: huidig });
  if (error) return toonFout(error);
  const tabel = el("table", {},
    el("thead", {}, el("tr", {}, el("th", { text: "Stemmer" }), el("th", { text: "Ingevuld" }), el("th", { text: "Keuze" }), el("th", { text: "Status" }))),
    el("tbody", {}, ...data.map((r) => el("tr", {},
      el("td", {}, r.naam || "", el("div", { class: "hint", text: r.email })),
      el("td", {}, r.ingevulde_naam || "", el("div", { class: "hint", text: r.ingevulde_email || "" })),
      el("td", { text: r.keuze }),
      el("td", { text: r.status })))));
  $("#stemmers").replaceChildren(data.length ? tabel : el("p", { class: "hint", text: "Nog geen stemmen." }));
  $("#stemmers").hidden = false;
  laadLogboek();
});

$("#uitslag-download").addEventListener("click", () => {
  const d = laatsteData;
  const regels = [csvRegel(["Kandidaat", "Stemmen"]), ...d.uitslag.map((r) => csvRegel([r.naam, r.stemmen])),
    "", csvRegel(["Kiezers", d.kiezers]), csvRegel(["Gestemd", d.gestemd]), csvRegel(["Apart gezet (niet geteld)", d.apart]),
    csvRegel(["Afgekeurd", d.afgekeurd]), csvRegel(["Gesloten op", fmtDatum(d.eind_at)])];
  download(`uitslag-${d.titel.replace(/[^\w-]+/g, "-")}.csv`, regels.join("\r\n"));
});

$("#verkiezing").addEventListener("change", (e) => { huidig = e.target.value; $("#stemmers").hidden = true; vernieuw(); });
$("#uitloggen").addEventListener("click", uitloggen);

(async function start() {
  account = await vereisLogin("commissie");
  $("#wie").textContent = `Ingelogd als ${account.naam}`;
  $("#naar-beheer").hidden = account.rol !== "beheerder";
  $("#pagina").hidden = false;
  laadHuisstijl().catch(() => {});
  try {
    await laadVerkiezingen();
    await vernieuw();
  } catch (e) { toonFout(e); }
  setInterval(() => { if (!document.hidden) vernieuw(); }, 30000);
})();
