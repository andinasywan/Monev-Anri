(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const D = window.NKO;

  const PRED = ["ISTIMEWA", "BAIK", "CUKUP", "KURANG", "SANGAT KURANG"];
  const PRED_LABEL = { ISTIMEWA: "Istimewa", BAIK: "Baik", CUKUP: "Cukup", KURANG: "Kurang", "SANGAT KURANG": "Sangat kurang" };
  const PRED_COLOR = {
    ISTIMEWA: "var(--p-istimewa)", BAIK: "var(--p-baik)", CUKUP: "var(--p-cukup)",
    KURANG: "var(--p-kurang)", "SANGAT KURANG": "var(--p-sangat-kurang)",
  };
  const BANDS = [[90.01, "ISTIMEWA"], [75.01, "BAIK"], [60.01, "CUKUP"], [50.01, "KURANG"], [0, "SANGAT KURANG"]];
  const THRESHOLDS = [50, 60, 75, 90];
  const ASPEK = [["ka", "Kinerja anggaran"], ["lk", "Laporan kinerja"], ["em", "Pengisian e-Monev"], ["pok", "Revisi POK"]];
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!D || !D.units || !D.units.length) {
    const lede = $("#nko-lede");
    if (lede) lede.textContent = "Data Nilai Kinerja Organisasi belum termuat. Coba muat ulang halaman ini.";
    $("#nko-updated").textContent = "Data tidak tersedia";
    return;
  }

  const units = D.units;
  const quarters = D.quarters.filter((q) => q.ada);
  const year = D.tahun || "";
  const state = { tw: quarters.length ? quarters[quarters.length - 1].tw : "I", unit: 0, sort: "rank" };

  // ---------- helpers ----------
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const idn = (v, d) => v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
  const n2 = (v) => (isNum(v) ? idn(v, 2) : "–");
  const qLabel = (tw) => "Triwulan " + tw;
  const predOf = (rec) => {
    const k = (rec && rec.total_kat || "").toUpperCase().trim();
    if (PRED.includes(k)) return k;
    if (!rec || !isNum(rec.total)) return "";
    return BANDS.find(([min]) => rec.total >= min)[1];
  };
  const predByValue = (v) => (isNum(v) ? BANDS.find(([min]) => v >= min)[1] : "");
  const rec = (u, tw) => (u.tw && u.tw[tw]) || null;
  function prevTw(tw) {
    const i = quarters.findIndex((q) => q.tw === tw);
    return i > 0 ? quarters[i - 1].tw : null;
  }
  function avg(tw, key) {
    const vals = units.map((u) => rec(u, tw)).filter((r) => r && isNum(r[key])).map((r) => r[key]);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  function rankMove(u, tw) {
    const p = prevTw(tw), r = rec(u, tw), pr = p && rec(u, p);
    if (!r || !pr || !isNum(r.peringkat) || !isNum(pr.peringkat)) return null;
    return pr.peringkat - r.peringkat; // positive = moved up
  }
  function when(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " WIB";
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function predChip(p, big) {
    const c = el("span", "pred" + (big ? " big" : ""), PRED_LABEL[p] || "–");
    c.dataset.p = p;
    return c;
  }
  function moveEl(m, suffix) {
    if (m == null) return el("span", "mv same", "–");
    if (m === 0) return el("span", "mv same", "tetap");
    return el("span", "mv " + (m > 0 ? "up" : "down"), Math.abs(m) + (suffix || ""));
  }
  function heatCell(v) {
    const td = el("td", "heat", n2(v));
    if (isNum(v)) td.style.setProperty("--h", Math.max(0, Math.min(100, 100 - v)) * 0.45 + "%");
    return td;
  }

  // tooltip (same look as the Monev page)
  function tipFor(box) {
    let t = box.querySelector(".tip");
    if (!t) { t = el("div", "tip"); t.hidden = true; box.appendChild(t); }
    return t;
  }
  function showTip(box, x, y, title, rows, hint) {
    const t = tipFor(box);
    t.replaceChildren(el("div", "t", title));
    for (const r of rows) {
      const row = el("div", "r");
      const name = el("span");
      if (r.color) { const k = el("span", "key"); k.style.background = r.color; name.appendChild(k); }
      name.appendChild(document.createTextNode(r.label));
      row.append(name, el("b", null, r.value));
      t.appendChild(row);
    }
    if (hint) t.appendChild(el("div", "h", hint));
    t.hidden = false;
    const bw = box.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
    let left = x + 14;
    if (left + tw > bw) left = x - tw - 14;
    left = Math.max(0, Math.min(left, bw - tw));
    let top = y - th - 10;
    if (top < 0) top = y + 14;
    t.style.left = left + "px";
    t.style.top = top + "px";
  }
  const hideTip = (box) => { const t = box.querySelector(".tip"); if (t) t.hidden = true; };

  // ---------- header ----------
  function renderHeader() {
    const sel = $("#triwulan");
    if (!sel.options.length) {
      for (const q of quarters.slice().reverse()) sel.appendChild(new Option(qLabel(q.tw) + " " + year, q.tw));
    }
    sel.value = state.tw;
    $("#nko-updated").textContent = "Diperbarui otomatis" + (D.sourceModified ? " · data per " + when(D.sourceModified) : "");
    $("#nko-stamp").textContent = [D.sourceModified ? "Sheet terakhir diubah " + when(D.sourceModified) : "", D.generated ? "disalin ke dasbor " + when(D.generated) : ""].filter(Boolean).join(" · ");
    $("#nko-rank-title").textContent = "Peringkat unit kerja · " + qLabel(state.tw);
  }

  function rowsFor(tw) {
    return units.map((u, i) => ({ u, i, r: rec(u, tw) })).filter((x) => x.r && isNum(x.r.total));
  }
  function bobotKa(tw) {
    const u = units.find((x) => x.detail && x.detail.triwulan === tw && x.detail.aspek.length);
    return u ? u.detail.aspek[0].bobot : null;
  }

  // ---------- lede & KPIs ----------
  function renderLede() {
    const lede = $("#nko-lede");
    lede.replaceChildren();
    const rows = rowsFor(state.tw);
    if (!rows.length) { lede.textContent = "Belum ada nilai untuk " + qLabel(state.tw) + "."; return; }
    const a = avg(state.tw, "total"), p = prevTw(state.tw), pa = p && avg(p, "total");
    const add = (t, b) => lede.appendChild(b ? el("b", null, t) : document.createTextNode(t));
    add("Pada " + qLabel(state.tw) + " " + year + ", rata-rata NKO ANRI ");
    add(n2(a), true);
    add(" dengan predikat ");
    add(PRED_LABEL[predByValue(a)].toLowerCase(), true);
    if (isNum(pa)) add(", " + (a >= pa ? "naik " : "turun ") + idn(Math.abs(a - pa), 2) + " poin dari " + qLabel(p));
    add(". ");
    const count = (k) => rows.filter((x) => predOf(x.r) === k).length;
    const ist = count("ISTIMEWA"), low = count("KURANG") + count("SANGAT KURANG");
    add(ist + " unit", true);
    add(" meraih predikat istimewa" + (low ? " dan " : ". "));
    if (low) { add(low + " unit", true); add(" masih di bawah cukup. "); }
    const means = ASPEK.map(([k, label]) => [label, avg(state.tw, k)]).filter(([, v]) => isNum(v));
    if (means.length) {
      const lowest = means.reduce((m, x) => (x[1] < m[1] ? x : m));
      add("Aspek terendah adalah ");
      add(lowest[0].toLowerCase(), true);
      add(" dengan rata-rata " + n2(lowest[1]) + ".");
    }
  }

  function kpi(label, valueNode, subNodes) {
    const k = el("div", "kpi");
    k.appendChild(el("div", "kpi-label", label));
    k.appendChild(valueNode);
    for (const s of subNodes || []) if (s) k.appendChild(s);
    return k;
  }
  function sub(parts) {
    const s = el("div", "kpi-sub");
    for (const p of parts) s.appendChild(typeof p === "string" ? document.createTextNode(p) : p);
    return s;
  }
  function renderKpis() {
    const box = $("#nko-kpis");
    box.replaceChildren();
    const rows = rowsFor(state.tw);
    if (!rows.length) return;
    const tw = state.tw, p = prevTw(tw);
    const a = avg(tw, "total"), pa = p && avg(p, "total");

    const parts = [predChip(predByValue(a))];
    if (isNum(pa)) {
      const d = a - pa;
      parts.push("  ", el("span", "delta", (d >= 0 ? "+" : "−") + idn(Math.abs(d), 2) + " poin"), " dari TW " + p);
    }
    box.appendChild(kpi("Rata-rata NKO ANRI · TW " + tw, el("div", "kpi-value", n2(a)), [sub(parts)]));

    const best = rows.filter((x) => x.r.peringkat === 1);
    const top = best[0];
    box.appendChild(kpi("Peringkat 1 · TW " + tw, el("div", "kpi-name", top.u.unit),
      [sub(["Total NKO ", el("b", null, n2(top.r.total)), best.length > 1 ? " · bersama " + (best.length - 1) + " unit lain" : ""])]));

    const ka = avg(tw, "ka"), b = bobotKa(tw), pka = p && avg(p, "ka");
    const kaParts = [];
    if (isNum(pka)) {
      const d = ka - pka;
      kaParts.push(el("span", "delta", (d >= 0 ? "+" : "−") + idn(Math.abs(d), 2) + " poin"), " dari TW " + p);
    }
    if (isNum(b)) kaParts.push(kaParts.length ? " · " : "", "bobot ", el("b", null, idn(b * 100, 0) + "%"), " dari NKO");
    const meter = el("div", "meter"); const ms = el("span");
    ms.style.width = Math.max(0, Math.min(ka, 100)) + "%"; ms.style.background = "var(--accent)"; meter.appendChild(ms);
    box.appendChild(kpi("Rata-rata kinerja anggaran", el("div", "kpi-value", n2(ka)), [sub(kaParts), meter]));

    const counts = PRED.map((k) => [k, rows.filter((x) => predOf(x.r) === k).length]);
    const good = counts[0][1] + counts[1][1];
    const dist = el("div", "dist");
    for (const [k, c] of counts) {
      if (!c) continue;
      const s = el("span"); s.style.flex = c; s.style.background = PRED_COLOR[k]; s.title = PRED_LABEL[k] + ": " + c + " unit";
      dist.appendChild(s);
    }
    const leg = el("div", "dist-legend");
    for (const [k, c] of counts) {
      const item = el("span");
      item.append(document.createTextNode(PRED_LABEL[k] + " "), el("b", null, String(c)));
      leg.appendChild(item);
    }
    box.appendChild(kpi("Predikat baik ke atas", el("div", "kpi-value", good + " dari " + rows.length), [dist, leg]));
  }

  // ---------- ranking chart ----------
  function renderLegend() {
    const box = $("#nko-legend");
    if (box.childElementCount) return;
    for (const k of PRED) {
      const s = el("span");
      const key = el("span", "key"); key.style.background = PRED_COLOR[k];
      s.append(key, document.createTextNode(PRED_LABEL[k]));
      box.appendChild(s);
    }
  }

  function drawRank() {
    const box = $("#chart-nko");
    const W = box.clientWidth;
    if (!W) return;
    const rows = rowsFor(state.tw).sort((a, b) => a.r.peringkat - b.r.peringkat || a.i - b.i);
    if (!rows.length) { box.replaceChildren(el("p", "note", "Belum ada nilai untuk " + qLabel(state.tw) + ".")); return; }
    const narrow = W < 480;
    const rowH = narrow ? 22 : 24;
    // left margin from the widest label as drawn
    const probe = svgEl("svg", { width: 0, height: 0, style: "position:absolute" });
    box.replaceChildren(probe);
    let lw = 0;
    for (const x of rows) { const t = svgEl("text", {}, x.u.singkat); probe.appendChild(t); lw = Math.max(lw, t.getComputedTextLength()); }
    const m = { t: 24, r: 44, b: 24, l: Math.ceil(lw) + 30 };
    const iw = Math.max(60, W - m.l - m.r);
    const H = m.t + rows.length * rowH + m.b;
    const x = (v) => m.l + (Math.max(0, Math.min(v, 100)) / 100) * iw;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Grafik batang total NKO per unit kerja, " + qLabel(state.tw) });

    // threshold lines and ticks
    for (const v of [0].concat(THRESHOLDS, [100])) {
      const dashed = THRESHOLDS.includes(v);
      svg.appendChild(svgEl("line", { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b, stroke: v === 0 ? "var(--axis)" : "var(--grid)", "stroke-dasharray": dashed ? "3 3" : "", "stroke-width": 1 }));
      if (!(narrow && v === 50)) svg.appendChild(svgEl("text", { x: x(v), y: H - 6, "text-anchor": v === 0 ? "start" : v === 100 ? "end" : "middle" }, String(v)));
    }
    const a = avg(state.tw, "total");
    if (isNum(a)) {
      svg.appendChild(svgEl("line", { x1: x(a), x2: x(a), y1: m.t - 6, y2: H - m.b, stroke: "var(--avg-line)", "stroke-width": 1.5 }));
      const txt = "Rata-rata " + n2(a);
      const anchor = x(a) > W - 90 ? "end" : x(a) < m.l + 60 ? "start" : "middle";
      svg.appendChild(svgEl("text", { x: x(a), y: m.t - 10, "text-anchor": anchor, class: "lbl-strong" }, txt));
    }

    const sel = units[state.unit];
    const hits = [];
    rows.forEach((row, k) => {
      const y = m.t + k * rowH;
      const isSel = row.u === sel;
      if (isSel) svg.appendChild(svgEl("rect", { x: 0, y: y + 1, width: W, height: rowH - 2, rx: 4, fill: "var(--soft)" }));
      const p = predOf(row.r);
      const bh = Math.min(14, rowH - 8);
      const x1 = x(row.r.total);
      const r = Math.min(4, bh / 2, Math.max(0, x1 - m.l));
      const yb = y + (rowH - bh) / 2;
      svg.appendChild(svgEl("path", {
        d: `M${m.l},${yb}H${x1 - r}Q${x1},${yb} ${x1},${yb + r}V${yb + bh - r}Q${x1},${yb + bh} ${x1 - r},${yb + bh}H${m.l}Z`,
        fill: PRED_COLOR[p] || "var(--p-cukup)",
      }));
      svg.appendChild(svgEl("text", { x: 4, y: y + rowH / 2 + 4, class: "lbl-strong", style: "font-variant-numeric:tabular-nums" }, String(row.r.peringkat)));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y + rowH / 2 + 4, "text-anchor": "end", class: isSel ? "lbl-strong" : "" }, row.u.singkat));
      svg.appendChild(svgEl("text", { x: x1 + 6, y: y + rowH / 2 + 4, class: "lbl-strong", style: "font-variant-numeric:tabular-nums" }, n2(row.r.total)));
      const hit = svgEl("rect", { x: 0, y, width: W, height: rowH, fill: "transparent", style: "cursor:pointer" });
      svg.appendChild(hit);
      hits.push({ row, hit, y });
    });
    box.replaceChildren(svg);
    for (const { row, hit, y } of hits) {
      const show = () => {
        const rr = svg.getBoundingClientRect(), kk = rr.width / W;
        const mv = rankMove(row.u, state.tw);
        const rowsTip = [
          { label: "Total NKO", value: n2(row.r.total) },
          { label: "Predikat", value: PRED_LABEL[predOf(row.r)] || "–" },
          { label: "Peringkat", value: row.r.peringkat + (mv ? (mv > 0 ? " (naik " : " (turun ") + Math.abs(mv) + ")" : "") },
          { label: "Kinerja anggaran", value: n2(row.r.ka) },
        ];
        showTip(box, x(row.r.total) * kk, (y + 4) * kk, row.u.unit, rowsTip, "Klik untuk melihat profil unit");
      };
      hit.addEventListener("pointerenter", show);
      hit.addEventListener("pointerleave", () => hideTip(box));
      hit.addEventListener("click", () => { hideTip(box); pickUnit(row.i, true); });
    }
  }

  // ---------- profile ----------
  function renderUnitSelect() {
    const sel = $("#nko-unit");
    if (!sel.options.length) units.forEach((u, i) => sel.appendChild(new Option(u.unit, String(i))));
    sel.value = String(state.unit);
  }

  function drawUnitTrend(box, u) {
    const W = box.clientWidth;
    if (!W) return;
    const H = 150, m = { t: 14, r: 14, b: 26, l: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const qs = D.quarters;
    const band = iw / qs.length;
    const x = (i) => m.l + (i + 0.5) * band;
    const vals = [];
    qs.forEach((q, i) => {
      const r = rec(u, q.tw);
      const a = q.ada ? avg(q.tw, "total") : null;
      vals.push({ i, tw: q.tw, unit: r && isNum(r.total) ? r.total : null, avg: a, rank: r && r.peringkat });
    });
    const all = vals.flatMap((v) => [v.unit, v.avg]).filter(isNum);
    let lo = Math.floor((Math.min(...all, 60) - 5) / 10) * 10;
    lo = Math.max(0, lo);
    const y = (v) => m.t + ih - ((v - lo) / (100 - lo)) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Tren total NKO " + u.unit + " dibanding rata-rata ANRI" });
    const step = (100 - lo) > 40 ? 20 : 10;
    for (let v = 100; v >= lo; v -= step) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), stroke: v === lo ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end" }, String(v)));
    }
    vals.forEach((v) => svg.appendChild(svgEl("text", { x: x(v.i), y: H - 8, "text-anchor": "middle", class: v.tw === state.tw ? "lbl-strong" : "" }, "TW " + v.tw)));
    const line = (key, color, dash) => {
      const pts = vals.filter((v) => isNum(v[key]));
      if (!pts.length) return;
      svg.appendChild(svgEl("path", { d: pts.map((p, k) => (k ? "L" : "M") + x(p.i) + "," + y(p[key])).join(""), fill: "none", stroke: color, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": dash || "" }));
      for (const p of pts) svg.appendChild(svgEl("circle", { cx: x(p.i), cy: y(p[key]), r: p.tw === state.tw ? 4.5 : 3, fill: color, stroke: "var(--panel)", "stroke-width": 2 }));
    };
    line("avg", "var(--muted)", "4 3");
    line("unit", "var(--accent)");
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const move = (ev) => {
      const rr = svg.getBoundingClientRect();
      const sx = ((ev.clientX - rr.left) / rr.width) * W;
      const i = Math.max(0, Math.min(qs.length - 1, Math.floor((sx - m.l) / band)));
      const v = vals[i];
      if (!isNum(v.unit) && !isNum(v.avg)) { hideTip(box); return; }
      const k = rr.width / W;
      showTip(box, x(i) * k, y(Math.max(v.unit || 0, v.avg || 0)) * k, qLabel(v.tw), [
        { label: "Unit ini", value: n2(v.unit), color: "var(--accent)" },
        { label: "Rata-rata ANRI", value: n2(v.avg), color: "var(--muted)" },
        { label: "Peringkat", value: isNum(v.rank) ? String(v.rank) : "–" },
      ]);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => hideTip(box));
  }

  function renderProfile() {
    const body = $("#nko-profile-body");
    body.replaceChildren();
    const u = units[state.unit];
    const r = rec(u, state.tw);
    if (!r) { body.appendChild(el("p", "note", "Belum ada nilai untuk unit ini pada " + qLabel(state.tw) + ".")); return; }
    const total = rowsFor(state.tw).length;

    const head = el("div", "profile-head");
    const left = el("div");
    left.appendChild(el("h3", null, u.unit));
    const meta = el("div", "profile-meta");
    const rk = el("span"); rk.append("Peringkat ", el("b", null, r.peringkat + " dari " + total)); meta.appendChild(rk);
    const mv = rankMove(u, state.tw);
    if (mv != null) {
      const s = el("span"); s.append(moveEl(mv), document.createTextNode(" dari TW " + prevTw(state.tw))); meta.appendChild(s);
    }
    left.appendChild(meta);
    const right = el("div", "profile-score");
    right.append(el("div", "score-num", n2(r.total)), predChip(predOf(r), true));
    head.append(left, right);
    body.appendChild(head);

    const detail = u.detail && u.detail.triwulan === state.tw ? u.detail : null;
    const aspects = el("div", "aspects");
    ASPEK.forEach(([k, label], idx) => {
      const v = r[k];
      const row = el("div", "aspect");
      const name = el("div", "a-name", label);
      const d = detail && detail.aspek[idx];
      if (d && isNum(d.bobot)) name.appendChild(el("small", null, " · bobot " + idn(d.bobot * 100, 0) + "%"));
      const bar = el("div", "a-bar"); const s = el("span");
      s.style.width = (isNum(v) ? Math.max(0, Math.min(v, 100)) : 0) + "%";
      s.style.background = isNum(v) && v < 60 ? "var(--p-sangat-kurang)" : "var(--accent)";
      bar.appendChild(s);
      row.append(name, el("div", "a-val", n2(v)), bar);
      const notes = [];
      if (r[k + "_kat"]) notes.push(r[k + "_kat"]);
      if (d && d.isian !== "" && d.isian != null && k !== "ka") notes.push(k === "pok" ? "jumlah revisi " + d.isian : String(d.isian));
      if (notes.length) row.appendChild(el("div", "a-note", notes.join(" · ")));
      aspects.appendChild(row);
    });
    body.appendChild(aspects);

    const trendHead = el("div", "legend");
    const a1 = el("span"); const k1 = el("span", "key"); k1.style.background = "var(--accent)"; a1.append(k1, "Unit ini");
    const a2 = el("span"); const k2 = el("span", "key"); k2.style.background = "var(--muted)"; a2.append(k2, "Rata-rata ANRI");
    trendHead.append(a1, a2);
    const chart = el("div", "chart");
    chart.id = "chart-nko-unit";
    body.append(trendHead, chart);
    drawUnitTrend(chart, u);

    if (u.evaluasi && state.tw === D.evaluasiTw) {
      const ev = el("div", "evaluasi");
      ev.append(el("h4", null, "Evaluasi dan rekomendasi · TW " + D.evaluasiTw), el("p", null, u.evaluasi));
      body.appendChild(ev);
    }
  }

  // ---------- table ----------
  function renderTable() {
    const tb = $("#tabel-nko tbody");
    tb.replaceChildren();
    let rows = rowsFor(state.tw);
    if (!rows.length) {
      const tr = el("tr"); const td = el("td", "empty", "Belum ada nilai untuk " + qLabel(state.tw) + "."); td.colSpan = 9; tr.appendChild(td); tb.appendChild(tr);
      return;
    }
    if (state.sort === "rank") rows.sort((a, b) => a.r.peringkat - b.r.peringkat || a.i - b.i);
    else if (state.sort === "ka") rows.sort((a, b) => (a.r.ka ?? 999) - (b.r.ka ?? 999));
    else if (state.sort === "move") rows.sort((a, b) => (rankMove(a.u, state.tw) ?? 0) - (rankMove(b.u, state.tw) ?? 0));
    for (const { u, i, r } of rows) {
      const tr = el("tr", "nko-row" + (i === state.unit ? " sel" : ""));
      tr.tabIndex = 0;
      tr.title = "Lihat profil " + u.unit;
      tr.appendChild(el("td", "r rank", String(r.peringkat)));
      const name = el("td"); name.appendChild(el("span", "u-name", u.unit)); tr.appendChild(name);
      tr.appendChild(el("td", "r", n2(r.total)));
      const pc = el("td"); pc.appendChild(predChip(predOf(r))); tr.appendChild(pc);
      const mv = el("td", "r opt"); mv.appendChild(moveEl(rankMove(u, state.tw))); tr.appendChild(mv);
      tr.appendChild(heatCell(r.ka));
      for (const k of ["lk", "em", "pok"]) { const c = heatCell(r[k]); c.classList.add("opt"); tr.appendChild(c); }
      const go = () => pickUnit(i, true);
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      tb.appendChild(tr);
    }
  }

  // ---------- averages & distribution ----------
  function renderAverages() {
    const t = $("#nko-avg");
    t.replaceChildren();
    const thead = el("thead"); const hr = el("tr");
    hr.appendChild(el("th", null, "Aspek"));
    for (const q of D.quarters) {
      const th = el("th", "r", "TW " + q.tw);
      if (q.tw === state.tw) th.style.color = "var(--fg)";
      hr.appendChild(th);
    }
    thead.appendChild(hr); t.appendChild(thead);
    const tbody = el("tbody");
    for (const [k, label] of [["total", "Total NKO"]].concat(ASPEK)) {
      const tr = el("tr");
      tr.appendChild(el("td", null, label));
      for (const q of D.quarters) {
        const v = q.ada ? avg(q.tw, k) : null;
        const td = heatCell(v);
        if (k === "total") td.style.fontWeight = "800";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    t.appendChild(tbody);
  }

  function renderSebaran() {
    const box = $("#nko-sebaran");
    box.replaceChildren();
    const leg = el("div", "legend");
    for (const k of PRED) { const s = el("span"); const key = el("span", "key"); key.style.background = PRED_COLOR[k]; s.append(key, PRED_LABEL[k]); leg.appendChild(s); }
    box.appendChild(leg);
    const list = el("div", "aspects");
    list.style.marginTop = "10px";
    for (const q of quarters) {
      const rows = rowsFor(q.tw);
      const counts = PRED.map((k) => [k, rows.filter((x) => predOf(x.r) === k).length]);
      const row = el("div", "aspect");
      const name = el("div", "a-name", qLabel(q.tw));
      if (q.tw === state.tw) name.style.color = "var(--accent)";
      const good = counts[0][1] + counts[1][1];
      row.append(name, el("div", "a-val", good + " unit baik ke atas"));
      const dist = el("div", "dist"); dist.style.gridColumn = "1 / -1"; dist.style.height = "16px";
      for (const [k, c] of counts) {
        if (!c) continue;
        const s = el("span"); s.style.flex = c; s.style.background = PRED_COLOR[k]; s.title = PRED_LABEL[k] + ": " + c + " unit";
        dist.appendChild(s);
      }
      row.appendChild(dist);
      row.appendChild(el("div", "a-note", counts.filter(([, c]) => c).map(([k, c]) => PRED_LABEL[k] + " " + c).join(" · ")));
      list.appendChild(row);
    }
    box.appendChild(list);
  }

  // ---------- wiring ----------
  function pickUnit(i, scroll) {
    state.unit = i;
    $("#nko-unit").value = String(i);
    renderProfile();
    drawRank();
    renderTable();
    if (scroll && window.innerWidth < 960) $("#nko-profile").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function renderAll() {
    renderHeader();
    renderLede();
    renderKpis();
    renderLegend();
    renderUnitSelect();
    drawRank();
    renderProfile();
    renderTable();
    renderAverages();
    renderSebaran();
  }

  // default unit: peringkat 1 in the latest quarter
  const top = rowsFor(state.tw).sort((a, b) => a.r.peringkat - b.r.peringkat)[0];
  if (top) state.unit = top.i;

  $("#triwulan").addEventListener("change", (e) => { state.tw = e.target.value; renderAll(); });
  $("#nko-unit").addEventListener("change", (e) => pickUnit(Number(e.target.value), false));
  $("#nko-urut").addEventListener("change", (e) => { state.sort = e.target.value; renderTable(); });

  renderAll();

  let raf = 0, lastW = 0;
  new ResizeObserver(() => {
    const w = document.documentElement.clientWidth;
    if (w === lastW) return;
    lastW = w;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => window.NKO_PAGE.redraw());
  }).observe(document.body);

  window.NKO_PAGE = {
    redraw: () => {
      drawRank();
      const c = $("#chart-nko-unit");
      if (c) drawUnitTrend(c, units[state.unit]);
    },
  };
})();
