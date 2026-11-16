// Inloggen, registreren, wachtwoord herstellen en tweestapsverificatie.
import { db, $, $$, t, laadHuisstijl } from "./gemeen.js?v=20261116f";

const VIEWS = ["inloggen", "registreren", "vergeten", "nieuw", "mfa-instellen", "mfa-code"];
let herstelModus = false;

function toon(naam) {
  for (const v of VIEWS) $(`#v-${v}`).hidden = v !== naam;
  for (const f of $$(".fout, .melding-ok", $(`#v-${naam}`))) f.hidden = true;
  $(`#v-${naam} input`)?.focus();
}

function fout(view, tekst) {
  const f = $(`#v-${view} .fout`);
  f.textContent = tekst;
  f.hidden = false;
}

function ok(view, tekst) {
  const f = $(`#v-${view} .melding-ok`);
  f.textContent = tekst;
  f.hidden = false;
}

function bezig(form, aan) {
  const knop = $("button[type=submit]", form);
  knop.disabled = aan;
}

function viaHash() {
  const h = location.hash.replace("#", "");
  if (["registreren", "vergeten", "inloggen"].includes(h)) toon(h);
}

const terugUrl = () => location.origin + location.pathname;

// Na inloggen: tweede stap regelen en doorsturen.
async function naInloggen() {
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") return doorsturen();

  const { data: factoren } = await db.auth.mfa.listFactors();
  const geldig = factoren?.totp?.find((f) => f.status === "verified");
  if (geldig) {
    toon("mfa-code");
    $("#v-mfa-code").dataset.factor = geldig.id;
    return;
  }
  // Oude, niet afgemaakte pogingen opruimen en een nieuwe code maken.
  for (const f of factoren?.all ?? []) {
    if (f.status !== "verified") await db.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: "OR-VerkiezingsTeller" });
  if (error) { toon("inloggen"); return fout("inloggen", t("Tweestapsverificatie kon niet worden gestart: ") + error.message); }
  $("#mfa-qr").src = data.totp.qr_code;
  $("#mfa-sleutel").textContent = data.totp.secret;
  $("#v-mfa-instellen").dataset.factor = data.id;
  toon("mfa-instellen");
}

async function doorsturen() {
  const { data: account } = await db.rpc("mijn_account");
  if (!account) {
    await db.auth.signOut();
    toon("inloggen");
    return fout("inloggen", t("Dit account heeft (nog) geen toegang. Vraag de beheerder om je uit te nodigen."));
  }
  location.replace(account.rol === "beheerder" ? "beheer.html" : "dashboard.html");
}

$("#v-inloggen").addEventListener("submit", async (e) => {
  e.preventDefault();
  bezig(e.target, true);
  const { error } = await db.auth.signInWithPassword({
    email: $("#li-email").value.trim(), password: $("#li-ww").value,
  });
  bezig(e.target, false);
  if (error) {
    return fout("inloggen", /confirm/i.test(error.message)
      ? t("Bevestig eerst je e-mailadres via de link in de mail die je kreeg.")
      : t("E-mailadres of wachtwoord klopt niet."));
  }
  naInloggen();
});

$("#v-registreren").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ww = $("#re-ww").value;
  if (ww.length < 12) return fout("registreren", t("Kies een wachtwoord van minimaal 12 tekens."));
  if (ww !== $("#re-ww2").value) return fout("registreren", t("De twee wachtwoorden zijn niet gelijk."));
  bezig(e.target, true);
  const { error } = await db.auth.signUp({
    email: $("#re-email").value.trim(), password: ww, options: { emailRedirectTo: terugUrl() },
  });
  bezig(e.target, false);
  if (error) {
    return fout("registreren", /database error|niet uitgenodigd/i.test(error.message)
      ? t("Dit e-mailadres is niet uitgenodigd. Vraag de beheerder om je toe te voegen aan de kiescommissie.")
      : error.message);
  }
  ok("registreren", t("Gelukt. Je krijgt een mail om je e-mailadres te bevestigen. Klik op de link in die mail en log daarna in."));
});

$("#v-vergeten").addEventListener("submit", async (e) => {
  e.preventDefault();
  bezig(e.target, true);
  await db.auth.resetPasswordForEmail($("#ve-email").value.trim(), { redirectTo: terugUrl() });
  bezig(e.target, false);
  ok("vergeten", t("Als dit adres bij ons bekend is, ontvang je binnen een paar minuten een mail met een herstellink."));
});

$("#v-nieuw").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ww = $("#nw-ww").value;
  if (ww.length < 12) return fout("nieuw", t("Kies een wachtwoord van minimaal 12 tekens."));
  bezig(e.target, true);
  const { error } = await db.auth.updateUser({ password: ww });
  bezig(e.target, false);
  if (error) return fout("nieuw", error.message);
  herstelModus = false;
  naInloggen();
});

async function verifieer(view, invoer) {
  const code = $(invoer).value.replace(/\D/g, "");
  if (code.length !== 6) return fout(view, t("Vul de 6 cijfers uit je app in."));
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId: $(`#v-${view}`).dataset.factor, code });
  if (error) return fout(view, t("Deze code klopt niet of is verlopen. Probeer de nieuwe code uit je app."));
  doorsturen();
}

$("#v-mfa-instellen").addEventListener("submit", (e) => { e.preventDefault(); verifieer("mfa-instellen", "#mfa-code1"); });
$("#v-mfa-code").addEventListener("submit", (e) => { e.preventDefault(); verifieer("mfa-code", "#mfa-code2"); });
$("#mfa-annuleer").addEventListener("click", async () => { await db.auth.signOut(); toon("inloggen"); });

db.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") { herstelModus = true; toon("nieuw"); }
});

window.addEventListener("hashchange", viaHash);

(async function start() {
  laadHuisstijl().catch(() => {});
  viaHash();
  const { data: { session } } = await db.auth.getSession();
  if (session && !herstelModus && !location.hash.includes("type=recovery")) naInloggen();
})();
