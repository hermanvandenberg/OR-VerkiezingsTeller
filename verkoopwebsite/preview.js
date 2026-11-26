// Previewbalk voor het prototype: wisselen tussen ontwerpen, demo en kopen.
// Bij livegang verwijderen (één regel per pagina: <script src="preview.js">).
(function () {
  const pagina = (location.pathname.split("/").pop() || "index.html").replace(/\?.*$/, "");
  const lees = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const schrijf = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };
  const m = pagina.match(/^versie-([a-f])\.html$/);
  if (m) schrijf("or-ontwerp", m[1]);
  const ontwerp = lees("or-ontwerp") || "d";

  const css = document.createElement("style");
  css.textContent = `
    .pv-balk { position: fixed; left: 50%; transform: translateX(-50%); bottom: max(12px, env(safe-area-inset-bottom, 0px)); z-index: 1000;
      display: flex; align-items: center; gap: 4px; padding: 5px; border-radius: 999px; background: #111827; color: #fff;
      box-shadow: 0 10px 30px -8px rgb(0 0 0 / .45); font: 600 13px/1 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; max-width: calc(100vw - 24px); overflow-x: auto; }
    .pv-balk a { color: #cbd5e1; text-decoration: none; padding: 8px 11px; border-radius: 999px; white-space: nowrap; }
    .pv-balk a:hover { background: #1f2937; color: #fff; }
    .pv-balk a[aria-current="page"] { background: #fff; color: #111827; }
    .pv-balk .pv-sep { width: 1px; height: 18px; background: #374151; margin: 0 4px; flex: none; }
    .pv-balk .pv-label { color: #9ca3af; padding: 0 6px 0 8px; white-space: nowrap; }
    @media (max-width: 560px) { .pv-balk .pv-label { display: none; } .pv-balk a { padding: 8px 9px; } }
    body { padding-bottom: 72px !important; }
    .prototype { display: none !important; }
    .pv-toast { position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%); z-index: 1001; background: #111827; color: #fff; padding: 10px 16px; border-radius: 10px;
      font: 500 14px system-ui, -apple-system, "Segoe UI", Arial, sans-serif; box-shadow: 0 10px 30px -8px rgb(0 0 0 / .45); max-width: calc(100vw - 32px); text-align: center; }
  `;
  document.head.append(css);

  const balk = document.createElement("nav");
  balk.className = "pv-balk"; balk.setAttribute("aria-label", "Preview");
  const link = (href, tekst, actief) => { const a = document.createElement("a"); a.href = href; a.textContent = tekst; if (actief) a.setAttribute("aria-current", "page"); return a; };
  const sep = () => { const s = document.createElement("span"); s.className = "pv-sep"; return s; };
  balk.append(link("index.html", "Overzicht", pagina === "index.html"), sep());
  const lab = document.createElement("span"); lab.className = "pv-label"; lab.textContent = "Ontwerp"; balk.append(lab);
  "abcdef".split("").forEach(l => balk.append(link(`versie-${l}.html`, l.toUpperCase(), m && m[1] === l)));
  balk.append(sep(), link("demo.html", "Demo", pagina === "demo.html"), link("kopen.html", "Kopen", pagina === "kopen.html"));
  document.body.append(balk);

  // Logo in demo en kopen gaat terug naar het laatst bekeken ontwerp
  document.querySelectorAll("[data-terug]").forEach(a => a.href = `versie-${ontwerp}.html`);

  // Links die bij livegang een eigen pagina krijgen
  let timer;
  function toast(tekst) {
    let t = document.querySelector(".pv-toast");
    if (!t) { t = document.createElement("div"); t.className = "pv-toast"; t.setAttribute("role", "status"); document.body.append(t); }
    t.textContent = tekst; t.hidden = false; clearTimeout(timer); timer = setTimeout(() => t.hidden = true, 2600);
  }
  document.addEventListener("click", e => {
    const a = e.target.closest('a[href="#"]');
    if (!a) return;
    e.preventDefault();
    if (a.classList.contains("merk")) { scrollTo({ top: 0, behavior: "smooth" }); return; }
    const naam = a.textContent.trim().replace(/\s+/g, " ");
    toast(`"${naam}" wordt bij livegang een eigen pagina.`);
  });
})();
