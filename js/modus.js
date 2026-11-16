// Weergave: licht, donker of automatisch (volgt het apparaat).
// Gewoon script (geen module), in de <head> geladen, zodat de pagina meteen in
// de juiste kleuren verschijnt. De keuze wordt per browser onthouden.
(function () {
  "use strict";
  var SLEUTEL = "or-weergave";
  var root = document.documentElement;

  function lees() {
    try {
      var w = localStorage.getItem(SLEUTEL);
      return w === "licht" || w === "donker" ? w : "auto";
    } catch (e) { return "auto"; }
  }

  function zet(modus) {
    if (modus === "licht" || modus === "donker") root.setAttribute("data-modus", modus);
    else root.removeAttribute("data-modus");
    try {
      if (modus === "auto") localStorage.removeItem(SLEUTEL);
      else localStorage.setItem(SLEUTEL, modus);
    } catch (e) { /* privévenster: dan alleen voor deze pagina */ }
    document.dispatchEvent(new CustomEvent("weergave-gewijzigd"));
    var knoppen = document.querySelectorAll(".weergave button");
    for (var i = 0; i < knoppen.length; i++) {
      knoppen[i].setAttribute("aria-checked", knoppen[i].getAttribute("data-modus") === modus ? "true" : "false");
    }
  }

  var begin = lees();
  if (begin !== "auto") root.setAttribute("data-modus", begin);

  // Schakelaar in elk element met data-weergave.
  function bouw() {
    var plekken = document.querySelectorAll("[data-weergave]");
    var keuzes = [["licht", "Licht"], ["donker", "Donker"], ["auto", "Auto"]];
    for (var p = 0; p < plekken.length; p++) {
      var groep = document.createElement("div");
      groep.className = "weergave";
      groep.setAttribute("role", "radiogroup");
      groep.setAttribute("aria-label", "Weergave");
      for (var k = 0; k < keuzes.length; k++) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "radio");
        b.setAttribute("data-modus", keuzes[k][0]);
        b.setAttribute("aria-checked", keuzes[k][0] === lees() ? "true" : "false");
        b.title = keuzes[k][0] === "auto" ? "Automatisch, zoals je apparaat is ingesteld" : keuzes[k][1] + "e weergave";
        b.textContent = keuzes[k][1];
        b.addEventListener("click", function () { zet(this.getAttribute("data-modus")); });
        groep.appendChild(b);
      }
      plekken[p].replaceChildren(groep);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bouw);
  else bouw();
})();
