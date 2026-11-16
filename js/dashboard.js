// Scherm van de kiescommissie.
import { db, $, el, t, fmtDatum, fmtKort, fmtDag, laadHuisstijl, vereisLogin, uitloggen, foutTekst, download, csvRegel } from "./gemeen.js?v=20261116c";

const SOORTEN = {
  ander_emailadres: t("Ander e-mailadres ingevuld"),
  opnieuw_geprobeerd: t("Opnieuw geprobeerd te stemmen"),
  veel_ongeldige_links: t("Veel ongeldige stemlinks"),
  mail_mislukt: t("Mail niet verstuurd"),
};
// Leesbare namen voor technische logboekregels.
const ACTIES = { "kandidaat insert": "kandidaat toegevoegd", "kandidaat update": "kandidaat gewijzigd", "kandidaat delete": "kandidaat verwijderd" };
// Detailvelden in het logboek waarvan de waarde een vaste code is (geen ingevulde tekst).
const CODES = ["soort", "uitslag", "verzendwijze", "rol", "status"];
const STATUS = { open: [t("Stemming open"), "ok"], nog_niet_open: [t("Nog niet begonnen"), "warn"], gesloten: [t("Gesloten"), ""] };

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
  return d ? t("{d}d {u}u", { d, u }) : u ? t("{u}u {m}m", { u, m }) : t("{m}m", { m });
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
  $("#periode").textContent = t("{start} tot {eind}", { start: fmtDatum(d.start_at), eind: fmtDatum(d.eind_at) });
  $("#c-gestemd").textContent = d.gestemd;
  $("#c-gestemd-van").textContent = t("van {n} gestemd", { n: d.kiezers });
  const pct = d.kiezers ? Math.round((d.gestemd / d.kiezers) * 100) : 0;
  $("#c-opkomst").textContent = `${pct}%`;
  $("#opkomst-balk").style.width = `${pct}%`;
  $("#c-meldingen").textContent = d.open_meldingen;
  if (d.status === "nog_niet_open") { $("#c-tijd").textContent = resterend(d.start_at); $("#c-tijd-label").textContent = t("tot start"); }
  else if (d.status === "gesloten") { $("#c-tijd").textContent = "0"; $("#c-tijd-label").textContent = t("gesloten"); }
  else { $("#c-tijd").textContent = resterend(d.eind_at); $("#c-tijd-label").textContent = t("tot sluiting"); }

  // Uitslag
  const zichtbaar = Array.isArray(d.uitslag);
  $("#uitslag-slot").hidden = zichtbaar;
  $("#uitslag").hidden = !zichtbaar;
  $("#uitslag-download").hidden = !(zichtbaar && d.status === "gesloten");
  $("#uitslag-slot-tekst").textContent = t("De uitslag is zichtbaar vanaf {datum}.", { datum: fmtDatum(d.eind_at) });
  if (zichtbaar) {
    const totaal = d.uitslag.reduce((s, r) => s + Number(r.stemmen), 0);
    $("#uitslag").replaceChildren(...d.uitslag.map((r, i) => {
      const p = totaal ? Math.round((r.stemmen / totaal) * 100) : 0;
      const balk = el("i");
      balk.style.width = `${p}%`;
      return el("div", { class: `r ${r.volgorde === 1000000 ? "onth" : `c${i % 4}`}` },
        el("span", { text: r.volgorde === 1000000 ? t(r.naam) : r.naam }), el("span", { class: "balk" }, balk), el("em", { text: `${r.stemmen} · ${p}%` }));
    }));
  }
  const extra = [];
  if (d.status === "open" && zichtbaar) extra.push(t("Dit is een tussenstand."));
  if (d.apart) extra.push(d.apart === 1 ? t("1 stem staat apart en telt pas mee na goedkeuring.") : t("{n} stemmen staan apart en tellen pas mee na goedkeuring.", { n: d.apart }));
  if (d.afgekeurd) extra.push(t("{n} afgekeurd.", { n: d.afgekeurd }));
  $("#uitslag-extra").textContent = extra.join(" ");

  const bewaar = $("#bewaar-info");
  bewaar.hidden = !d.vernietigen_op && !d.vernietigd_at;
  bewaar.className = d.vernietigd_at ? "notitie" : "hint";
  bewaar.textContent = d.vernietigd_at
    ? t("De stemmen, de kiezerslijst en de meldingen zijn vernietigd op {datum}. De uitslag hierboven is bewaard.", { datum: fmtDatum(d.vernietigd_at) })
    : t("Bewaartermijn: de stemmen en kiezersgegevens worden vernietigd op {datum}.", { datum: fmtDag(d.vernietigen_op) });

  await Promise.all([laadMeldingen(), laadLogboek()]);
}

// Vaste teksten uit de database vertalen; de foutmelding van de mailserver blijft zoals hij is.
function omschrijving(tekst) {
  const mail = "Een mail kon niet worden verstuurd: ";
  return tekst.startsWith(mail) ? t("Een mail kon niet worden verstuurd:") + " " + tekst.slice(mail.length) : t(tekst);
}

async function laadMeldingen() {
  const { data, error } = await db.rpc("meldingen_lijst", { p_verkiezing: huidig });
  if (error) return toonFout(error);
  const lijst = $("#meldingen");
  if (!data.length) { lijst.replaceChildren(el("p", { class: "hint", text: t("Geen meldingen. Alles loopt zoals het hoort.") })); return; }
  lijst.replaceChildren(...data.map((m) => {
    const regels = [el("b", { text: SOORTEN[m.soort] || m.soort }), el("br"), el("span", { class: "hint", text: omschrijving(m.omschrijving) })];
    if (m.kiezer_email) regels.push(el("br"), el("span", { class: "hint", text: t("Uitnodiging aan: {naam} <{email}>", { naam: m.kiezer_naam || "", email: m.kiezer_email }) }));
    if (m.ingevulde_email && m.soort === "ander_emailadres") regels.push(el("br"), el("span", { class: "hint", text: t("Ingevuld: {naam} <{email}>", { naam: m.ingevulde_naam || "", email: m.ingevulde_email }) }));
    if (m.aantal > 1) regels.push(el("br"), el("span", { class: "hint", text: t("{n} keer", { n: m.aantal }) }));
    regels.push(el("br"), el("span", { class: "hint", text: fmtKort(m.aangemaakt_at) }));

    let acties;
    if (m.status !== "open") {
      const tekst = { goedgekeurd: t("Goedgekeurd"), afgekeurd: t("Afgekeurd"), gezien: t("Gezien") }[m.status];
      acties = el("span", { class: `chip ${m.status === "afgekeurd" ? "rood" : "ok"}`, text: t("{besluit} door {naam}", { besluit: tekst, naam: m.afgehandeld_door }) });
    } else if (m.heeft_stem) {
      acties = el("span", { class: "rij" },
        el("button", { type: "button", class: "knop klein", onclick: (e) => afhandelen(m.id, "goedgekeurd", e.currentTarget), text: t("Goedkeuren") }),
        el("button", { type: "button", class: "knop gevaar klein", onclick: (e) => afhandelen(m.id, "afgekeurd", e.currentTarget), text: t("Afkeuren") }));
    } else {
      acties = el("button", { type: "button", class: "knop licht klein", onclick: (e) => afhandelen(m.id, "gezien", e.currentTarget), text: t("Gezien") });
    }
    return el("div", { class: `alert ${m.status === "open" ? "" : "af"}` }, el("span", {}, ...regels), acties);
  }));
}

// Goed- en afkeuren vragen om een tweede klik ter bevestiging.
async function afhandelen(id, besluit, knop) {
  if (besluit !== "gezien" && !knop.dataset.zeker) {
    knop.dataset.zeker = "1";
    knop.textContent = besluit === "goedgekeurd" ? t("Zeker? Stem telt dan mee") : t("Zeker? Stem vervalt");
    knop.title = besluit === "afgekeurd"
      ? t("De collega kan daarna opnieuw stemmen met een nieuwe link (stuur een herinnering).")
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
    el("thead", {}, el("tr", {}, el("th", { text: t("Wanneer") }), el("th", { text: t("Wie") }), el("th", { text: t("Wat") }))),
    el("tbody", {}, ...data.map((r) => el("tr", {},
      el("td", { text: fmtKort(r.at) }), el("td", { text: r.wie }),
      el("td", {}, t(ACTIES[r.actie] || r.actie), r.details ? el("div", { class: "hint mono", text: Object.entries(r.details).map(([k, v]) => `${t(k)}: ${CODES.includes(k) ? t(v) : /^\d{4}-\d\d-\d\dT/.test(v) ? fmtKort(v) : v && typeof v === "object" ? Object.values(v).filter(Boolean).join(", ") : v}`).join(" · ") }) : null))))));
}

$("#uitslag-download").addEventListener("click", () => {
  const d = laatsteData;
  const regels = [csvRegel([t("Kandidaat"), t("Stemmen")]), ...d.uitslag.map((r) => csvRegel([r.volgorde === 1000000 ? t(r.naam) : r.naam, r.stemmen])),
    "", csvRegel([t("Kiezers"), d.kiezers]), csvRegel([t("Gestemd"), d.gestemd]), csvRegel([t("Apart gezet (niet geteld)"), d.apart]),
    csvRegel([t("Afgekeurd"), d.afgekeurd]), csvRegel([t("Gesloten op"), fmtDatum(d.eind_at)])];
  download(`uitslag-${d.titel.replace(/[^\w-]+/g, "-")}.csv`, regels.join("\r\n"));
});

$("#verkiezing").addEventListener("change", (e) => { huidig = e.target.value; vernieuw(); });
$("#uitloggen").addEventListener("click", uitloggen);

(async function start() {
  account = await vereisLogin("commissie");
  $("#wie").textContent = t("Ingelogd als {naam}", { naam: account.naam });
  $("#naar-beheer").hidden = account.rol !== "beheerder";
  $("#pagina").hidden = false;
  laadHuisstijl().catch(() => {});
  await db.rpc("vernietigen_verlopen").then(() => {}, () => {});
  try {
    await laadVerkiezingen();
    await vernieuw();
  } catch (e) { toonFout(e); }
  setInterval(() => { if (!document.hidden) vernieuw(); }, 30000);
})();
