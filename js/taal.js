// Taal: Nederlands, Engels of Duits. Gewoon script met "defer", zodat het draait
// voordat de pagina-modules starten. Vaste teksten in de HTML worden hier vertaald;
// de modules gebruiken t() voor teksten die ze zelf maken.
// Wat gebruikers zelf invullen (namen, titels, toelichtingen) wordt nooit vertaald.
(function () {
  "use strict";
  var TALEN = ["nl", "en", "de"];
  var NAMEN = { nl: "NL", en: "EN", de: "DE" };
  var VOLUIT = { nl: "Nederlands", en: "English", de: "Deutsch" };
  var SLEUTEL = "or-taal";
  var LIJST = window.OR_VERTALINGEN || {};

  function kies() {
    try {
      var w = localStorage.getItem(SLEUTEL);
      if (TALEN.indexOf(w) >= 0) return w;
    } catch (e) { /* geen opslag */ }
    var voorkeur = navigator.languages || [navigator.language || "nl"];
    for (var i = 0; i < voorkeur.length; i++) {
      var code = String(voorkeur[i]).slice(0, 2).toLowerCase();
      if (TALEN.indexOf(code) >= 0) return code;
    }
    return "nl";
  }

  var taal = kies();
  document.documentElement.lang = taal;
  var index = taal === "en" ? 0 : taal === "de" ? 1 : -1;

  function vul(tekst, waarden) {
    if (!waarden) return tekst;
    return tekst.replace(/\{(\w+)\}/g, function (m, k) { return k in waarden ? String(waarden[k]) : m; });
  }

  // t("Nederlandse tekst met {naam}", { naam: "..." })
  function t(tekst, waarden) {
    var vertaling = index >= 0 && LIJST[tekst] ? LIJST[tekst][index] : null;
    return vul(vertaling || tekst, waarden);
  }

  function locale() { return taal === "en" ? "en-GB" : taal === "de" ? "de-DE" : "nl-NL"; }

  // Vaste teksten in de HTML vertalen (tekst en een paar attributen).
  function vertaalDom(root) {
    if (index < 0) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (!p || p.closest("script, style, [data-niet-vertalen]")) return NodeFilter.FILTER_REJECT;
        return /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    var n;
    while ((n = walker.nextNode())) {
      var ruw = n.nodeValue;
      var kern = ruw.replace(/\s+/g, " ").trim();
      var v = LIJST[kern] && LIJST[kern][index];
      if (v) n.nodeValue = ruw.match(/^\s*/)[0] + v + ruw.match(/\s*$/)[0];
    }
    var attrs = ["placeholder", "title", "aria-label", "alt"];
    var els = root.querySelectorAll("[placeholder], [title], [aria-label], [alt]");
    for (var i = 0; i < els.length; i++) {
      if (els[i].closest("[data-niet-vertalen]")) continue;
      for (var a = 0; a < attrs.length; a++) {
        var w = els[i].getAttribute(attrs[a]);
        if (w && LIJST[w] && LIJST[w][index]) els[i].setAttribute(attrs[a], LIJST[w][index]);
      }
    }
    var titel = LIJST[document.title] && LIJST[document.title][index];
    if (titel) document.title = titel;
  }

  function zet(nieuw) {
    try { localStorage.setItem(SLEUTEL, nieuw); } catch (e) { /* alleen voor nu */ }
    location.reload();
  }

  // Schakelaar in elk element met data-taal.
  function bouw() {
    var plekken = document.querySelectorAll("[data-taal]");
    for (var p = 0; p < plekken.length; p++) {
      var groep = document.createElement("div");
      groep.className = "weergave taalkeuze";
      groep.setAttribute("role", "radiogroup");
      groep.setAttribute("aria-label", t("Taal"));
      for (var k = 0; k < TALEN.length; k++) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "radio");
        b.setAttribute("lang", TALEN[k]);
        b.setAttribute("aria-checked", TALEN[k] === taal ? "true" : "false");
        b.title = VOLUIT[TALEN[k]];
        b.textContent = NAMEN[TALEN[k]];
        b.setAttribute("data-code", TALEN[k]);
        b.addEventListener("click", function () {
          var code = this.getAttribute("data-code");
          if (code !== taal) zet(code);
        });
        groep.appendChild(b);
      }
      plekken[p].replaceChildren(groep);
    }
  }

  window.OR_TAAL = { taal: taal, t: t, locale: locale, vertaalDom: vertaalDom };
  // Met "defer" is de HTML al ingelezen; de modules draaien hierna.
  vertaalDom(document.body);
  bouw();
})();
