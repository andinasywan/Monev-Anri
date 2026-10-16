(function () {
  "use strict";
  const PAGES = {
    monev: { title: "Monev Renja ANRI 2026", redraw: () => window.MONEV_PAGE && window.MONEV_PAGE.redraw() },
    nko: { title: "Penilaian Kinerja Organisasi 2026", redraw: () => window.NKO_PAGE && window.NKO_PAGE.redraw() },
  };

  function show(name) {
    if (!PAGES[name]) name = "monev";
    document.body.dataset.page = name;
    for (const key of Object.keys(PAGES)) {
      const on = key === name;
      document.getElementById("page-" + key).hidden = !on;
      document.getElementById("tab-" + key).setAttribute("aria-selected", on ? "true" : "false");
    }
    document.getElementById("page-title").textContent = PAGES[name].title;
    PAGES[name].redraw();
  }

  function fromHash() {
    const h = location.hash.slice(1);
    if (PAGES[h]) return show(h);
    // A link to a section (for example #rincian-ro) opens the page that holds it.
    const el = h && document.getElementById(h);
    const page = el && el.closest(".page");
    show(page ? page.id.replace("page-", "") : "monev");
    if (el) el.scrollIntoView();
  }

  window.addEventListener("hashchange", fromHash);
  fromHash();
})();
