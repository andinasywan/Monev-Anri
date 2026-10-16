(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const BLN3 = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const STANDALONE = "Pusat, Balai dan Inspektorat";
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const D = window.MONEV;
  if (!D || !D.months || !D.months.length) {
    $("#lede").replaceWith(Object.assign(document.createElement("div"), { className: "error", textContent: "Data dasbor belum termuat. Coba muat ulang halaman ini." }));
    $("#updated").textContent = "Data tidak tersedia";
    return;
  }

  // ---------- data ----------
  const F = D.fields;
  const months = D.months.slice().sort((a, b) => a.tahun - b.tahun || a.no - b.no);
  const year = months[months.length - 1].tahun;
  const bySheet = {};
  for (const m of months) {
    bySheet[m.sheet] = (D.rows[m.sheet] || []).map((arr) => {
      const o = {};
      F.forEach((f, i) => (o[f] = arr[i]));
      return o;
    });
  }
  const totalOf = (sheet) => (bySheet[sheet] || []).find((r) => r.level === "total");
  const isNum = (v) => typeof v === "number" && isFinite(v);

  const state = { sheet: months[months.length - 1].sheet, unit: "", unitSort: "sheet", roSort: "sheet", q: "", open: new Set() };

  // ---------- formatting ----------
  const idn = (v, d) => v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
  function rp(v) {
    if (!isNum(v)) return "–";
    const a = Math.abs(v);
    if (a >= 1e12) return "Rp " + idn(v / 1e12, 2) + " T";
    if (a >= 1e9) return "Rp " + idn(v / 1e9, 2) + " M";
    if (a >= 1e6) return "Rp " + idn(v / 1e6, 1) + " jt";
    return "Rp " + idn(v, 0);
  }
  const rpFull = (v) => (isNum(v) ? "Rp " + idn(v, 0) : "–");
  const pct = (v, d = 1) => (isNum(v) ? idn(v * 100, d) + "%" : "–");
  const qty = (v) => (isNum(v) ? v.toLocaleString("id-ID", { maximumFractionDigits: 2 }) : "–");
  function axisRp(v) {
    if (v === 0) return "0";
    const f = (x) => idn(x, x % 1 ? 1 : 0);
    if (v >= 1e12) return f(v / 1e12) + " T";
    if (v >= 1e9) return f(v / 1e9) + " M";
    return f(v / 1e6) + " jt";
  }
  // ascending (dir 1) or descending (dir -1); rows without a value go last
  function sortRows(rows, key, dir) {
    return rows.slice().sort((a, b) => {
      const av = isNum(a[key]), bv = isNum(b[key]);
      if (!av || !bv) return av === bv ? 0 : av ? -1 : 1;
      return dir * (a[key] - b[key]);
    });
  }
  const monthOf = (sheet) => months.find((m) => m.sheet === sheet);
  const monthName = (m) => BULAN[m.no - 1] + " " + m.tahun;
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
  function bar(v, color) {
    const wrap = el("div", "bar");
    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.background = color;
    fill.style.width = isNum(v) ? Math.max(0, Math.min(v, 1)) * 100 + "%" : "0";
    track.appendChild(fill);
    if (isNum(v) && v > 1) wrap.classList.add("over");
    wrap.append(track, el("span", "val", pct(v)));
    return wrap;
  }

  // ---------- tooltip ----------
  function tipFor(box) {
    let t = box.querySelector(".tip");
    if (!t) { t = el("div", "tip"); t.hidden = true; box.appendChild(t); }
    return t;
  }
  function showTip(box, x, y, title, rows, hint) {
    const t = tipFor(box);
    t.replaceChildren();
    t.appendChild(el("div", "t", title));
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

  function niceTicks(max, n) {
    if (!(max > 0)) return [0, 1];
    let step = Math.pow(10, Math.floor(Math.log10(max / n)));
    const err = max / n / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    const out = [];
    for (let v = 0; v <= max + step * 0.999; v += step) out.push(+v.toFixed(6));
    return out;
  }

  // ---------- header, lede, KPIs ----------
  function renderHeader() {
    const sel = $("#bulan");
    if (!sel.options.length) {
      for (const m of months.slice().reverse()) sel.appendChild(new Option(monthName(m), m.sheet));
    }
    sel.value = state.sheet;
    const stamp = D.sourceModified ? "Sheet terakhir diubah " + when(D.sourceModified) : "";
    $("#updated").textContent = "Diperbarui otomatis" + (D.sourceModified ? " · data per " + when(D.sourceModified) : "");
    $("#stamp").textContent = [stamp, D.generated ? "disalin ke dasbor " + when(D.generated) : ""].filter(Boolean).join(" · ");
  }

  function prevSheet(sheet) {
    const i = months.findIndex((m) => m.sheet === sheet);
    return i > 0 ? months[i - 1].sheet : null;
  }
  function roRows(sheet) { return (bySheet[sheet] || []).filter((r) => r.level === "ro"); }
  function unitRows(sheet) { return (bySheet[sheet] || []).filter((r) => r.level === "unit"); }

  function renderLede() {
    const m = monthOf(state.sheet), t = totalOf(state.sheet);
    const lede = $("#lede");
    lede.replaceChildren();
    if (!t) { lede.textContent = "Baris total ANRI tidak ditemukan di sheet " + state.sheet + "."; return; }
    const ps = prevSheet(state.sheet), pt = ps && totalOf(ps);
    const add = (txt, bold) => lede.appendChild(bold ? el("b", null, txt) : document.createTextNode(txt));
    add("Sampai " + monthName(m) + ", realisasi SP2D ANRI mencapai ");
    add(pct(t.pct_sp2d), true);
    add(" dari pagu aktif " + rp(t.pagu_aktif));
    if (pt && isNum(pt.pct_sp2d) && isNum(t.pct_sp2d)) {
      const d = (t.pct_sp2d - pt.pct_sp2d) * 100;
      add(", " + (d >= 0 ? "naik " : "turun ") + idn(Math.abs(d), 1) + " poin dari " + BULAN[monthOf(ps).no - 1]);
    }
    add(". ");
    const units = unitRows(state.sheet).filter((u) => isNum(u.pct_sp2d) && (u.pagu_aktif || 0) > 0);
    if (units.length) {
      const low = units.reduce((a, b) => (b.pct_sp2d < a.pct_sp2d ? b : a));
      add("Serapan terendah ada di ");
      add(low.uraian, true);
      add(" (" + pct(low.pct_sp2d) + ").");
    }
  }

  function kpi(label, value, sub, opts = {}) {
    const k = el("div", "kpi");
    k.appendChild(el("div", "kpi-label", label));
    const v = el("div", "kpi-value", value);
    if (opts.title) v.title = opts.title;
    k.appendChild(v);
    if (sub) k.appendChild(sub);
    if (opts.meter != null) {
      const m = el("div", "meter"); const s = el("span");
      s.style.width = Math.max(0, Math.min(opts.meter, 1)) * 100 + "%";
      if (opts.meterColor) s.style.background = opts.meterColor;
      m.appendChild(s); k.appendChild(m);
    }
    return k;
  }
  function sub(parts) {
    const s = el("div", "kpi-sub");
    for (const p of parts) s.appendChild(typeof p === "string" ? document.createTextNode(p) : p);
    return s;
  }

  function renderKpis() {
    const box = $("#kpis");
    box.replaceChildren();
    const t = totalOf(state.sheet);
    if (!t) return;
    const m = monthOf(state.sheet);
    const ps = prevSheet(state.sheet), pt = ps && totalOf(ps);
    const bln = BULAN[m.no - 1];

    box.appendChild(kpi("Pagu aktif", rp(t.pagu_aktif), sub(["Pagu DIPA ", el("b", null, rp(t.pagu_dipa))]), { title: rpFull(t.pagu_aktif) }));

    const parts = [el("b", null, rp(t.sp2d_sd)), " dari pagu aktif"];
    if (pt && isNum(pt.pct_sp2d)) {
      const d = (t.pct_sp2d - pt.pct_sp2d) * 100;
      parts.push(" · ", el("span", "delta", (d >= 0 ? "+" : "−") + idn(Math.abs(d), 1) + " poin"), " dari " + BULAN[monthOf(ps).no - 1]);
    }
    box.appendChild(kpi("Realisasi SP2D s.d. " + bln, pct(t.pct_sp2d), sub(parts), { meter: t.pct_sp2d, meterColor: "var(--sp2d)", title: rpFull(t.sp2d_sd) }));

    box.appendChild(kpi("Realisasi SPM s.d. " + bln, pct(t.pct_spm), sub(["Nilai SPM terbit ", el("b", null, rp(t.spm_sd))]), { meter: t.pct_spm, meterColor: "var(--spm)", title: rpFull(t.spm_sd) }));

    if (isNum(t.pagu_aktif) && isNum(t.sp2d_sd)) {
      const sisa = t.pagu_aktif - t.sp2d_sd;
      box.appendChild(kpi("Sisa pagu belum SP2D", rp(sisa), sub([el("b", null, pct(sisa / t.pagu_aktif)), " dari pagu aktif"]), { title: rpFull(sisa) }));
    }

    const ro = roRows(state.sheet).filter((r) => isNum(r.pct_fisik));
    if (ro.length) {
      const avg = ro.reduce((s, r) => s + r.pct_fisik, 0) / ro.length;
      box.appendChild(kpi("Capaian fisik rata-rata", pct(avg), sub(["rata-rata sederhana ", el("b", null, ro.length + " RO")]), { meter: avg, meterColor: "var(--fisik)" }));
    }
  }

  // ---------- charts ----------
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawTrend() {
    const box = $("#chart-tren");
    const W = box.clientWidth;
    if (!W) return;
    const narrow = W < 520;
    const H = narrow ? 250 : 280;
    const m = { t: 14, r: narrow ? 78 : 92, b: 46, l: 42 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const pts = BULAN.map((_, i) => {
      const mo = months.find((x) => x.tahun === year && x.no === i + 1);
      const t = mo && totalOf(mo.sheet);
      return t && (isNum(t.pct_sp2d) || isNum(t.pct_spm)) ? { i, sheet: mo.sheet, sp2d: t.pct_sp2d, spm: t.pct_spm } : null;
    });
    const valid = pts.filter(Boolean);
    const maxV = Math.max(1, ...valid.flatMap((p) => [p.sp2d || 0, p.spm || 0]));
    const yMax = Math.ceil(maxV * 4) / 4;
    const band = iw / 12;
    const x = (i) => m.l + (i + 0.5) * band;
    const y = (v) => m.t + ih - (v / yMax) * ih;

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Grafik garis persentase realisasi SP2D dan SPM per bulan" });
    // quarter bands
    for (let q = 0; q < 4; q++) {
      if (q % 2 === 1) svg.appendChild(svgEl("rect", { x: m.l + q * 3 * band, y: m.t, width: 3 * band, height: ih, fill: "var(--soft)" }));
      svg.appendChild(svgEl("text", { x: m.l + (q * 3 + 1.5) * band, y: H - 6, "text-anchor": "middle", "font-size": "11", style: "letter-spacing:.06em" }, "TW " + ["I", "II", "III", "IV"][q]));
    }
    for (let v = 0; v <= yMax + 1e-9; v += 0.25) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), stroke: v === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, idn(v * 100, 0) + "%"));
    }
    BLN3.forEach((b, i) => {
      if (narrow && i % 2 === 1) return;
      svg.appendChild(svgEl("text", { x: x(i), y: m.t + ih + 17, "text-anchor": "middle", class: pts[i] && pts[i].sheet === state.sheet ? "lbl-strong" : "" }, b));
    });
    const sel = pts.find((p) => p && p.sheet === state.sheet);
    if (sel) svg.appendChild(svgEl("line", { x1: x(sel.i), x2: x(sel.i), y1: m.t, y2: m.t + ih, stroke: "var(--axis)", "stroke-dasharray": "3 3" }));

    const series = [["sp2d", "SP2D", "var(--sp2d)"], ["spm", "SPM", "var(--spm)"]];
    const ends = [];
    for (const [key, name, color] of series) {
      const ps = valid.filter((p) => isNum(p[key]));
      if (!ps.length) continue;
      const d = ps.map((p, k) => (k ? "L" : "M") + x(p.i).toFixed(1) + "," + y(p[key]).toFixed(1)).join("");
      svg.appendChild(svgEl("path", { d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      for (const p of ps) {
        const big = p.sheet === state.sheet;
        svg.appendChild(svgEl("circle", { cx: x(p.i), cy: y(p[key]), r: big ? 5 : 3.5, fill: color, stroke: "var(--panel)", "stroke-width": 2 }));
      }
      const last = ps[ps.length - 1];
      ends.push({ x: x(last.i), y: y(last[key]), text: name + " " + pct(last[key]), color });
    }
    if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 16) {
      const mid = (ends[0].y + ends[1].y) / 2;
      const up = ends[0].y <= ends[1].y ? 0 : 1;
      ends[up].y = mid - 8; ends[1 - up].y = mid + 8;
    }
    for (const e of ends) {
      svg.appendChild(svgEl("line", { x1: e.x + 8, x2: e.x + 16, y1: e.y, y2: e.y, stroke: e.color, "stroke-width": 2, "stroke-linecap": "round" }));
      svg.appendChild(svgEl("text", { x: e.x + 20, y: e.y + 4, class: "lbl-strong" }, e.text));
    }
    const cross = svgEl("line", { y1: m.t, y2: m.t + ih, stroke: "var(--fg)", "stroke-opacity": 0.35, visibility: "hidden" });
    svg.appendChild(cross);
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const sx = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(11, Math.floor((sx - m.l) / band)));
      const p = pts[i];
      if (!p) { cross.setAttribute("visibility", "hidden"); hideTip(box); return; }
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      const k = r.width / W;
      showTip(box, x(i) * k, y(Math.max(p.sp2d || 0, p.spm || 0)) * k, BULAN[i] + " " + year + " (kumulatif)", [
        { label: "SP2D", value: pct(p.sp2d), color: "var(--sp2d)" },
        { label: "SPM", value: pct(p.spm), color: "var(--spm)" },
      ]);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(box); });
  }

  function drawBulanan() {
    const box = $("#chart-bulanan");
    const W = box.clientWidth;
    if (!W) return;
    const narrow = W < 520;
    const H = narrow ? 250 : 280;
    const vals = BULAN.map((_, i) => {
      const mo = months.find((x) => x.tahun === year && x.no === i + 1);
      const t = mo && totalOf(mo.sheet);
      return t && isNum(t.sp2d_bln) ? { i, sheet: mo.sheet, v: t.sp2d_bln } : null;
    });
    const max = Math.max(1, ...vals.filter(Boolean).map((p) => p.v));
    const ticks = niceTicks(max, 4);
    const yMax = ticks[ticks.length - 1];
    // left margin from widest tick label
    const probe = svgEl("svg", { width: 0, height: 0, style: "position:absolute" });
    box.replaceChildren(probe);
    let lw = 0;
    for (const t of ticks) { const tx = svgEl("text", {}, axisRp(t)); probe.appendChild(tx); lw = Math.max(lw, tx.getComputedTextLength()); }
    const m = { t: 14, r: 8, b: 46, l: Math.ceil(lw) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / 12;
    const bw = Math.min(28, band * 0.62);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Grafik batang realisasi SP2D per bulan" });
    for (let q = 0; q < 4; q++) {
      if (q % 2 === 1) svg.appendChild(svgEl("rect", { x: m.l + q * 3 * band, y: m.t, width: 3 * band, height: ih, fill: "var(--soft)" }));
      svg.appendChild(svgEl("text", { x: m.l + (q * 3 + 1.5) * band, y: H - 6, "text-anchor": "middle", "font-size": "11", style: "letter-spacing:.06em" }, "TW " + ["I", "II", "III", "IV"][q]));
    }
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, axisRp(t)));
    }
    BLN3.forEach((b, i) => {
      if (narrow && i % 2 === 1) return;
      svg.appendChild(svgEl("text", { x: m.l + (i + 0.5) * band, y: m.t + ih + 17, "text-anchor": "middle", class: vals[i] && vals[i].sheet === state.sheet ? "lbl-strong" : "" }, b));
    });
    const bars = [];
    vals.forEach((p) => {
      if (!p) return;
      const x0 = m.l + (p.i + 0.5) * band - bw / 2, x1 = x0 + bw;
      const yt = y(Math.max(0, p.v)), yb = y(0);
      const r = Math.min(4, bw / 2, yb - yt);
      const d = `M${x0},${yb}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x1 - r}Q${x1},${yt} ${x1},${yt + r}V${yb}Z`;
      const isSel = p.sheet === state.sheet;
      const path = svgEl("path", { d, fill: "var(--sp2d)", "fill-opacity": isSel ? 1 : 0.42 });
      svg.appendChild(path);
      bars.push({ p, path, isSel });
    });
    const sel = vals.find((p) => p && p.sheet === state.sheet);
    if (sel) {
      const lx = Math.max(m.l + 20, Math.min(m.l + (sel.i + 0.5) * band, m.l + iw - 20));
      svg.appendChild(svgEl("text", { x: lx, y: y(sel.v) - 7, "text-anchor": "middle", class: "lbl-strong" }, rp(sel.v).replace("Rp ", "")));
    }
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const move = (ev) => {
      const rr = svg.getBoundingClientRect();
      const sx = ((ev.clientX - rr.left) / rr.width) * W;
      const i = Math.max(0, Math.min(11, Math.floor((sx - m.l) / band)));
      bars.forEach((b) => b.path.setAttribute("fill-opacity", b.p.i === i || b.isSel ? 1 : 0.42));
      const p = vals[i];
      if (!p) { hideTip(box); return; }
      const k = rr.width / W;
      showTip(box, (m.l + (i + 0.5) * band) * k, y(p.v) * k, BULAN[i] + " " + year, [{ label: "SP2D bulan ini", value: rp(p.v) }], rpFull(p.v));
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { bars.forEach((b) => b.path.setAttribute("fill-opacity", b.isSel ? 1 : 0.42)); hideTip(box); });
  }

  function drawSebar() {
    const box = $("#chart-sebar");
    const W = box.clientWidth;
    if (!W) return;
    const units = unitRows(state.sheet).filter((u) => isNum(u.pct_sp2d) && isNum(u.pct_fisik));
    const H = Math.min(340, Math.max(260, W * 0.62));
    const m = { t: 12, r: 14, b: 40, l: 44 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const maxV = Math.max(1, ...units.map((u) => Math.max(u.pct_sp2d, u.pct_fisik)));
    const dom = Math.ceil(maxV * 4) / 4;
    const x = (v) => m.l + (v / dom) * iw;
    const y = (v) => m.t + ih - (v / dom) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Sebaran unit kerja menurut serapan SP2D dan capaian fisik" });
    for (let v = 0; v <= dom + 1e-9; v += 0.25) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), stroke: v === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("line", { x1: x(v), x2: x(v), y1: m.t, y2: m.t + ih, stroke: v === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, idn(v * 100, 0) + "%"));
      svg.appendChild(svgEl("text", { x: x(v), y: m.t + ih + 16, "text-anchor": v === 0 ? "start" : "middle" }, idn(v * 100, 0) + "%"));
    }
    svg.appendChild(svgEl("line", { x1: x(0), y1: y(0), x2: x(dom), y2: y(dom), stroke: "var(--axis)", "stroke-dasharray": "5 4", "stroke-width": 1.5 }));
    svg.appendChild(svgEl("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle" }, "Serapan SP2D terhadap pagu aktif →"));
    const yl = svgEl("text", { x: 0, y: 0, "text-anchor": "middle", transform: `translate(11 ${m.t + ih / 2}) rotate(-90)` }, "Capaian fisik →");
    svg.appendChild(yl);
    const dots = [];
    for (const u of units) {
      const active = !state.unit || state.unit === u.uraian;
      const g = svgEl("g", { style: "cursor:pointer", tabindex: "0", role: "button", "aria-label": u.uraian + ", serapan " + pct(u.pct_sp2d) + ", fisik " + pct(u.pct_fisik) });
      g.appendChild(svgEl("circle", { cx: x(u.pct_sp2d), cy: y(u.pct_fisik), r: 12, fill: "transparent" }));
      const c = svgEl("circle", { cx: x(u.pct_sp2d), cy: y(u.pct_fisik), r: state.unit === u.uraian ? 7 : 5.5, fill: "var(--accent)", "fill-opacity": active ? 0.9 : 0.25, stroke: "var(--panel)", "stroke-width": 2 });
      g.appendChild(c);
      svg.appendChild(g);
      dots.push({ u, g });
    }
    box.replaceChildren(svg);
    for (const { u, g } of dots) {
      const show = () => {
        const rr = svg.getBoundingClientRect(), k = rr.width / W;
        showTip(box, x(u.pct_sp2d) * k, y(u.pct_fisik) * k, u.uraian, [
          { label: "Serapan SP2D", value: pct(u.pct_sp2d), color: "var(--sp2d)" },
          { label: "Capaian fisik", value: pct(u.pct_fisik), color: "var(--fisik)" },
        ], "Klik untuk melihat RO unit ini");
      };
      g.addEventListener("pointerenter", show);
      g.addEventListener("focus", show);
      g.addEventListener("pointerleave", () => hideTip(box));
      g.addEventListener("blur", () => hideTip(box));
      const pick = () => { hideTip(box); pickUnit(u.uraian, true); };
      g.addEventListener("click", pick);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    }
  }

  // ---------- program & satker ----------
  function renderSatker() {
    const box = $("#satker");
    box.replaceChildren();
    const rows = (bySheet[state.sheet] || []).filter((r) => r.level === "program" || r.level === "satker");
    let lastLevel = "";
    for (const r of rows) {
      if (r.level !== lastLevel) {
        box.appendChild(el("div", "mini-group", r.level === "program" ? "Program" : "Satuan kerja"));
        lastLevel = r.level;
      }
      const row = el("div", "mini-row");
      const name = el("div", "mini-name", r.uraian.toLowerCase().replace(/(^|[\s,(])([a-z])/g, (a, p, c) => p + c.toUpperCase()).replace(/\bDan\b/g, "dan").replace(/\bAnri\b/g, "ANRI"));
      name.appendChild(el("small", null, (r.level === "program" ? "Kode " : "Kode satker ") + r.kode));
      const pg = el("div", "mini-pagu", rp(r.pagu_aktif));
      pg.title = "Pagu aktif " + rpFull(r.pagu_aktif);
      const bars = el("div", "mini-bars");
      bars.append(bar(r.pct_sp2d, "var(--sp2d)"), bar(r.pct_spm, "var(--spm)"));
      row.append(name, pg, bars);
      box.appendChild(row);
    }
  }

  // ---------- unit table ----------
  function unitTr(u) {
    const tr = el("tr", "unit-row");
    tr.tabIndex = 0;
    tr.title = "Lihat RO " + u.uraian;
    const name = el("td");
    name.appendChild(el("span", "u-name", u.uraian));
    if (state.unitSort !== "sheet") name.appendChild(el("span", "u-sub", u.kelompok));
    const pagu = el("td", "r opt", rp(u.pagu_aktif)); pagu.title = rpFull(u.pagu_aktif);
    const sp = el("td", "r opt", rp(u.sp2d_sd)); sp.title = rpFull(u.sp2d_sd);
    const a = el("td", "barcell"); a.appendChild(bar(u.pct_sp2d, "var(--sp2d)"));
    const f = el("td", "barcell"); f.appendChild(bar(u.pct_fisik, "var(--fisik)"));
    tr.append(name, pagu, sp, a, f);
    const go = () => pickUnit(u.uraian, true);
    tr.addEventListener("click", go);
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    return tr;
  }
  function renderUnits() {
    const m = monthOf(state.sheet);
    $("#unit-pos").textContent = "Posisi s.d. " + monthName(m) + " · klik baris untuk melihat RO-nya";
    const tb = $("#tabel-unit tbody");
    tb.replaceChildren();
    const all = bySheet[state.sheet] || [];
    const units = all.filter((r) => r.level === "unit");
    if (!units.length) { const tr = el("tr"); const td = el("td", "empty", "Tidak ada data unit kerja untuk bulan ini."); td.colSpan = 5; tr.appendChild(td); tb.appendChild(tr); return; }
    if (state.unitSort === "sheet") {
      const e1 = all.filter((r) => r.level === "eselon1");
      const groups = e1.map((g) => ({ name: g.uraian, row: g }));
      if (units.some((u) => u.kelompok === STANDALONE)) groups.push({ name: STANDALONE, row: null });
      for (const g of groups) {
        const members = units.filter((u) => u.kelompok === g.name);
        if (!members.length && !g.row) continue;
        const tr = el("tr", "grp");
        const n = el("td"); n.appendChild(el("span", "grp-name", g.name));
        tr.appendChild(n);
        if (g.row) {
          const p = el("td", "r opt", rp(g.row.pagu_aktif)); p.title = rpFull(g.row.pagu_aktif);
          const s = el("td", "r opt", rp(g.row.sp2d_sd)); s.title = rpFull(g.row.sp2d_sd);
          const a = el("td", "barcell"); a.appendChild(bar(g.row.pct_sp2d, "var(--sp2d)"));
          const f = el("td", "barcell"); f.appendChild(bar(g.row.pct_fisik, "var(--fisik)"));
          tr.append(p, s, a, f);
        } else {
          const td = el("td"); td.colSpan = 4; tr.appendChild(td);
        }
        tb.appendChild(tr);
        members.forEach((u) => tb.appendChild(unitTr(u)));
      }
      const loose = units.filter((u) => !groups.some((g) => g.name === u.kelompok));
      loose.forEach((u) => tb.appendChild(unitTr(u)));
    } else {
      const key = { anggaran: "pct_sp2d", fisik: "pct_fisik", pagu: "pagu_aktif" }[state.unitSort];
      sortRows(units, key, state.unitSort === "pagu" ? -1 : 1).forEach((u) => tb.appendChild(unitTr(u)));
    }
  }

  // ---------- RO table ----------
  function renderUnitSelect() {
    const sel = $("#ro-unit");
    const units = unitRows(state.sheet).map((u) => u.uraian);
    if (state.unit && !units.includes(state.unit)) state.unit = "";
    sel.replaceChildren(new Option("Semua unit", ""), ...units.map((u) => new Option(u, u)));
    sel.value = state.unit;
  }
  function renderRO() {
    const tb = $("#tabel-ro tbody");
    tb.replaceChildren();
    const all = roRows(state.sheet);
    const q = state.q.trim().toLowerCase();
    let rows = all.filter((r) => (!state.unit || r.unit === state.unit) &&
      (!q || [r.kode, r.uraian, r.satuan, r.unit, r.catatan].some((s) => s && String(s).toLowerCase().includes(q))));
    if (state.roSort !== "sheet") {
      const key = { anggaran: "pct_sp2d", fisik: "pct_fisik", pagu: "pagu_aktif" }[state.roSort];
      rows = sortRows(rows, key, state.roSort === "pagu" ? -1 : 1);
    }
    $("#ro-count").textContent = rows.length === all.length ? all.length + " RO" : "Menampilkan " + rows.length + " dari " + all.length + " RO";
    if (!rows.length) {
      const tr = el("tr"); const td = el("td", "empty", "Tidak ada RO yang cocok. Ubah kata kunci atau pilih Semua unit."); td.colSpan = 7; tr.appendChild(td); tb.appendChild(tr);
      return;
    }
    for (const r of rows) {
      const id = state.sheet + "#" + r.baris;
      const tr = el("tr");
      const kode = el("td"); kode.appendChild(el("span", "code", r.kode && r.kode.trim() ? r.kode : "—"));
      const nm = el("td");
      nm.appendChild(el("div", "ro-name", r.uraian));
      nm.appendChild(el("span", "u-sub", r.unit));
      let detail = null;
      if (r.catatan) {
        const btn = el("button", "toggle");
        btn.type = "button";
        const open = state.open.has(id);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.innerHTML = '<svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true"><path d="M2 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btn.appendChild(document.createTextNode("Catatan"));
        detail = el("tr", "catatan");
        const td = el("td"); td.colSpan = 7; td.appendChild(el("p", null, r.catatan));
        detail.appendChild(td);
        detail.hidden = !open;
        btn.addEventListener("click", () => {
          const now = detail.hidden;
          detail.hidden = !now;
          btn.setAttribute("aria-expanded", now ? "true" : "false");
          if (now) state.open.add(id); else state.open.delete(id);
        });
        nm.appendChild(el("br"));
        nm.appendChild(btn);
      }
      const tgt = el("td", "r opt", qty(r.target) + (r.satuan ? " " + r.satuan : ""));
      tgt.style.whiteSpace = "normal"; tgt.style.minWidth = "7em";
      const real = el("td", "r opt", qty(r.fisik_sd));
      const fis = el("td", "barcell"); fis.appendChild(bar(r.pct_fisik, "var(--fisik)"));
      const ang = el("td", "barcell"); ang.appendChild(bar(r.pct_sp2d, "var(--sp2d)"));
      const pg = el("td", "r opt", rp(r.pagu_aktif)); pg.title = rpFull(r.pagu_aktif);
      tr.append(kode, nm, tgt, real, fis, ang, pg);
      tb.appendChild(tr);
      if (detail) tb.appendChild(detail);
    }
  }

  function pickUnit(name, scroll) {
    state.unit = name;
    $("#ro-unit").value = name;
    renderRO();
    drawSebar();
    if (scroll) $("#rincian-ro").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  // ---------- wiring ----------
  function renderAll() {
    renderHeader();
    renderLede();
    renderKpis();
    drawTrend();
    drawBulanan();
    drawSebar();
    renderSatker();
    renderUnits();
    renderUnitSelect();
    renderRO();
  }

  $("#bulan").addEventListener("change", (e) => { state.sheet = e.target.value; state.open.clear(); renderAll(); });
  $("#unit-urut").addEventListener("change", (e) => { state.unitSort = e.target.value; renderUnits(); });
  $("#ro-urut").addEventListener("change", (e) => { state.roSort = e.target.value; renderRO(); });
  $("#ro-unit").addEventListener("change", (e) => { state.unit = e.target.value; renderRO(); drawSebar(); });
  $("#ro-cari").addEventListener("input", (e) => { state.q = e.target.value; renderRO(); });

  renderAll();

  let raf = 0, lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = document.documentElement.clientWidth;
    if (w === lastW) return;
    lastW = w;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { drawTrend(); drawBulanan(); drawSebar(); });
  });
  ro.observe(document.body);

  window.MONEV_PAGE = { redraw: () => { drawTrend(); drawBulanan(); drawSebar(); } };
})();
