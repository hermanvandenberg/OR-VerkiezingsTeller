// Stempagina: één kandidaat (of onthouden) kiezen, gegevens invullen, bevestigen.
import { db, $, $$, el, t, fmtDatum, fotoOf, laadHuisstijl } from "./gemeen.js?v=20261116h";
import { pasThemaToe } from "./thema.js?v=20261116h";

const token = location.hash.replace(/^#/, "").trim().toLowerCase();
// Voorbeeld vanuit het beheerscherm: gegevens komen van dat venster, er wordt niets verstuurd.
const voorbeeld = token === "voorbeeld";
let keuze = null; // { id: uuid | null, naam: string }

function geenStem(kop, tekst) {
  $("#laden").hidden = true;
  $("#biljet").hidden = true;
  $("#geen-stem-kop").textContent = kop;
  $("#geen-stem-tekst").textContent = tekst;
  $("#geen-stem").hidden = false;
}

function bericht(tekst, isFout = false) {
  const b = $("#bericht");
  b.textContent = tekst;
  b.className = isFout ? "fout" : "hint";
}

function kies(tegel, id, naam) {
  for (const t of $$(".tegel")) t.setAttribute("aria-checked", t === tegel ? "true" : "false");
  keuze = { id, naam };
  $("#versturen").setAttribute("aria-disabled", "false");
  bericht(t("Gekozen: {naam}", { naam }));
}

function toonBiljet(b) {
  $("#titel").textContent = b.titel;
  document.title = t("Stemmen · {titel}", { titel: b.titel });
  $("#sluit").textContent = t("Stemmen kan tot {datum}", { datum: fmtDatum(b.eind_at) });
  for (const img of $$("img.logo")) {
    if (b.logo_url) { img.src = b.logo_url; img.alt = b.organisatie || t("Logo"); img.hidden = false; }
  }

  if (b.al_gestemd) return geenStem(t("Je hebt al gestemd"), t("Met deze link is al een stem uitgebracht. Iedere collega kan één keer stemmen."));
  if (b.status === "nog_niet_open") return geenStem(t("De stemming is nog niet open"), t("Je kunt stemmen vanaf {datum}. Bewaar de mail met je link.", { datum: fmtDatum(b.start_at) }));
  if (b.status === "gesloten") return geenStem(t("De stemming is gesloten"), t("Stemmen is niet meer mogelijk. De uitslag wordt bekendgemaakt door de OR."));

  $("#toelichting").textContent = b.toelichting || "";
  $("#toelichting").hidden = !b.toelichting;

  const tegels = $("#tegels");
  if (b.kandidaten.length > 2) tegels.classList.add("drie");
  b.kandidaten.forEach((k, i) => {
    const tegel = el("button", { type: "button", class: "tegel", role: "radio", "aria-checked": "false" },
      el("span", { class: "vink", "aria-hidden": "true" }),
      fotoOf(k.naam, k.foto_url, i),
      el("h3", { text: k.naam }),
      k.functie ? el("p", { class: "functie", text: k.functie }) : null,
      k.tekst ? el("p", { class: "bio", text: k.tekst }) : null,
    );
    tegel.addEventListener("click", () => kies(tegel, k.id, k.naam));
    tegels.append(tegel);
  });
  const ont = $("#onthouden");
  ont.addEventListener("click", () => kies(ont, null, t("Onthouden")));

  // Pijltjestoetsen binnen de keuzes, zoals bij gewone keuzerondjes.
  const alle = $$(".tegel");
  alle.forEach((t, i) => t.addEventListener("keydown", (e) => {
    const stap = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!stap) return;
    e.preventDefault();
    const volgende = alle[(i + stap + alle.length) % alle.length];
    volgende.focus();
    volgende.click();
  }));

  $("#geheim-uitleg").textContent = t("Je stem is geheim. Er wordt nergens opgeslagen op wie jij hebt gestemd; alleen dát je gestemd hebt.");

  $("#laden").hidden = true;
  $("#biljet").hidden = false;
}

$("#biljet").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!keuze) return bericht(t("Je hebt nog geen kandidaat gekozen. Kies een tegel of onthouden."), true);
  const naam = $("#naam").value.trim();
  const email = $("#email").value.trim();
  if (!naam) { $("#naam").focus(); return bericht(t("Vul je naam in."), true); }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("#email").focus(); return bericht(t("Vul een geldig e-mailadres in."), true); }
  $("#bevestig-keuze").textContent = keuze.naam;
  $("#bevestig-gegevens").textContent = `${naam} · ${email}`;
  $("#bevestig-fout").hidden = true;
  $("#bevestig").showModal();
});

$("#bevestig-nee").addEventListener("click", () => $("#bevestig").close());

$("#bevestig-ja").addEventListener("click", async () => {
  const knop = $("#bevestig-ja");
  if (voorbeeld) {
    $("#bevestig").close();
    $("#biljet").hidden = true;
    $("#bedankt-keuze").textContent = keuze.naam;
    $("#bedankt-apart").hidden = true;
    $("#bedankt-hint").textContent = t("Dit was een voorbeeld: er is geen stem opgeslagen. Je kunt dit venster sluiten.");
    $("#bedankt").hidden = false;
    return;
  }
  knop.disabled = true;
  knop.textContent = t("Bezig met versturen…");
  const { data, error } = await db.rpc("stem_uitbrengen", {
    p_token: token,
    p_kandidaat: keuze.id,
    p_onthouden: keuze.id === null,
    p_naam: $("#naam").value.trim(),
    p_email: $("#email").value.trim(),
  });
  knop.disabled = false;
  knop.textContent = t("Ja, verstuur mijn stem");

  if (error) {
    $("#bevestig-fout").textContent = t("Versturen lukte niet. Controleer je internetverbinding en probeer het opnieuw.");
    $("#bevestig-fout").hidden = false;
    return;
  }
  if (data?.ok) {
    $("#bevestig").close();
    $("#biljet").hidden = true;
    $("#bedankt-keuze").textContent = keuze.naam;
    $("#bedankt-apart").hidden = !data.apart;
    $("#bedankt").hidden = false;
    history.replaceState(null, "", location.pathname);
    return;
  }
  $("#bevestig").close();
  const teksten = {
    al_gestemd: [t("Je hebt al gestemd"), t("Met deze link is al een stem uitgebracht.")],
    nog_niet_open: [t("De stemming is nog niet open"), t("Probeer het later opnieuw.")],
    gesloten: [t("De stemming is gesloten"), t("Stemmen is niet meer mogelijk.")],
    ongeldig: [t("Deze link werkt niet"), t("Gebruik de link uit je meest recente uitnodiging. Lukt het niet, neem dan contact op met de OR.")],
  };
  if (teksten[data?.fout]) return geenStem(...teksten[data.fout]);
  if (data?.fout === "gegevens") return bericht(t("Vul je naam en een geldig e-mailadres in."), true);
  bericht(t("Kies een kandidaat of onthouden."), true);
});

function startVoorbeeld() {
  document.title = t("Voorbeeld stempagina");
  $("#voorbeeld-balk").hidden = false;
  if (!window.opener) {
    return geenStem(t("Voorbeeld niet beschikbaar"), t("Open het voorbeeld via de knop \"Voorbeeld stempagina\" in het beheerscherm."));
  }
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.source !== window.opener || e.data?.soort !== "voorbeeld-biljet") return;
    pasThemaToe(e.data.thema);
    toonBiljet({ ...e.data.biljet, status: "open", al_gestemd: false });
  }, { once: true });
  window.opener.postMessage({ soort: "voorbeeld-klaar" }, location.origin);
}

async function start() {
  if (voorbeeld) return startVoorbeeld();
  laadHuisstijl().catch(() => {});
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return geenStem(t("Deze link werkt niet"), t("Open de stempagina via de knop in je uitnodigingsmail. Kopieer je de link, neem dan de hele link mee."));
  }
  const { data, error } = await db.rpc("stembiljet", { p_token: token });
  if (error) return geenStem(t("Er ging iets mis"), t("Het stembiljet kon niet worden geladen. Probeer het over een paar minuten opnieuw."));
  if (data?.fout) return geenStem(t("Deze link werkt niet"), t("Gebruik de link uit je meest recente uitnodiging. Lukt het niet, neem dan contact op met de OR."));
  toonBiljet(data);
}

start();
