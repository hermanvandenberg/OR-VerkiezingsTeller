// Prototype: demogegevens in de browser. In het echte product staan ze in Supabase
// onder een organisatie met status 'demo' (zie technische-aanpak.md).
const SLEUTEL = "or-demo-v1";
function legeDemo() {
  return { verkiezing: { org: "", titel: "", start: "", eind: "", zetels: "", kleur: "#0d5f63" }, kandidaten: [], kiezers: [], proefstemmen: [] };
}
function laadDemo() {
  try { const t = localStorage.getItem(SLEUTEL); if (t) return Object.assign(legeDemo(), JSON.parse(t)); } catch (e) {}
  return legeDemo();
}
function bewaarDemo(d) { try { localStorage.setItem(SLEUTEL, JSON.stringify(d)); } catch (e) {} }
function voorbeeldDemo() {
  return {
    verkiezing: { org: "Bakkerij de Korenaar", titel: "OR-verkiezing 2027", start: "2027-03-08", eind: "2027-03-12", zetels: "7", kleur: "#b23a48" },
    kandidaten: [
      { naam: "Sanne Jansen", afdeling: "Logistiek" }, { naam: "Mohamed Bakker", afdeling: "Klantenservice" },
      { naam: "Lisa de Vries", afdeling: "Productie" }, { naam: "Pieter van Dijk", afdeling: "Financiën" }
    ],
    kiezers: ["anna@korenaar.nl", "bram@korenaar.nl", "chantal@korenaar.nl", "dennis@korenaar.nl", "eva@korenaar.nl", "fatima@korenaar.nl"],
    proefstemmen: [1, 0, 1]
  };
}
function samenvatting(d) {
  const delen = [];
  if (d.verkiezing.titel) delen.push(d.verkiezing.titel);
  delen.push(d.kandidaten.length + " kandidaten", d.kiezers.length + " kiezers");
  return delen.join(" · ") + " staan klaar om mee te nemen.";
}
