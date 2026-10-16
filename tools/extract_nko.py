"""Extract the Nilai Kinerja Organisasi (NKO) workbook into nko.js.

Usage: python3 extract_nko.py <workbook.xlsx> <out_dir> <source_modified_iso>

Reads the "Rekap Penilaian ..." sheet (one row per unit, four quarters side by
side) and, for the current quarter's detail, the per-unit sheets whose cell A4
reads "Unit Kerja: <name>". Columns are located by their header labels.
"""
import json
import re
import sys
from datetime import datetime, timezone

import openpyxl

TW_LABELS = ["I", "II", "III", "IV"]
ASPECTS = [  # (key, header prefix in row 2)
    ("ka", "KINERJA ANGGARAN"),
    ("lk", "PENYAMPAIAN LAPORAN KINERJA"),
    ("em", "PENGISIAN E-MONEV"),
    ("pok", "REVISI POK"),
    ("total", "TOTAL"),
]


def norm(v):
    return " ".join(str(v).upper().replace("\n", " ").split()) if isinstance(v, str) else ""


def num(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("%", "")
    if not s or s in ("-", "–", "—") or s.startswith("#"):
        return None
    try:
        return float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)
    except ValueError:
        return None


def text(v):
    return " ".join(str(v).split()) if v not in (None, "") else ""


def find_rekap(wb):
    for ws in wb.worksheets:
        if norm(ws.title).startswith("REKAP PENILAIAN"):
            return ws
    raise SystemExit("Sheet 'Rekap Penilaian ...' not found")


def locate(ws):
    """Map quarter -> aspect -> {'nilai': col, 'kat': col}, plus unit/eval columns."""
    tw_start = {}
    for c in range(1, ws.max_column + 1):
        m = re.match(r"^TRIWULAN (IV|III|II|I)$", norm(ws.cell(1, c).value))
        if m:
            tw_start[m.group(1)] = c
    if not tw_start:
        raise SystemExit("Quarter headers (TRIWULAN I..IV) not found in row 1")
    starts = sorted(tw_start.values())
    cols = {}
    eval_col = None
    unit_col = None
    for c in range(1, ws.max_column + 1):
        if norm(ws.cell(1, c).value) == "UNIT":
            unit_col = c
        if norm(ws.cell(2, c).value).startswith("EVALUASI"):
            eval_col = c
    for tw, start in tw_start.items():
        nxt = [s for s in starts if s > start]
        end = nxt[0] - 1 if nxt else start + 10
        block = {}
        for c in range(start, end + 1):
            h = norm(ws.cell(2, c).value)
            for key, prefix in ASPECTS:
                if h.startswith(prefix) and key not in block:
                    block[key] = {"nilai": c, "kat": c + 1}
        cols[tw] = block
    return unit_col or 2, cols, eval_col


def unit_sheets(wb):
    """Full unit name -> (sheet title, detail of the current quarter)."""
    out = {}
    for ws in wb.worksheets:
        a4 = text(ws["A4"].value)
        if not a4.upper().startswith("UNIT KERJA:"):
            continue
        name = a4.split(":", 1)[1].strip()
        detail = {"triwulan": "", "aspek": []}
        m = re.search(r"TRIWULAN\s+(IV|III|II|I)\b", norm(ws["A3"].value))
        if m:
            detail["triwulan"] = m.group(1)
        for r in range(6, 12):
            bobot = ws.cell(r, 3).value
            if isinstance(bobot, (int, float)) and 0 < bobot <= 1:
                detail["aspek"].append({
                    "aspek": text(ws.cell(r, 2).value),
                    "bobot": round(float(bobot), 4),
                    "isian": text(ws.cell(r, 5).value) if not isinstance(ws.cell(r, 5).value, (int, float))
                    else ws.cell(r, 5).value,
                    "kategori": text(ws.cell(r, 6).value),
                })
        out[name.upper()] = (ws.title.strip(), name, detail)
    return out


def tokens(name):
    words = re.findall(r"[A-Z0-9]+", name.upper())
    return {w for w in words if w not in ("DAN", "DI")}


def match_sheet(name, sheets):
    """Unit sheets spell some names a little differently; pick the closest by shared words."""
    want = tokens(name)
    best, score = None, 0.0
    for key, val in sheets.items():
        have = tokens(key)
        s = len(want & have) / max(len(want | have), 1)
        if s > score:
            best, score = val, s
    return best if score >= 0.6 else None


def main():
    src, out_dir, modified = sys.argv[1], sys.argv[2], sys.argv[3]
    wb = openpyxl.load_workbook(src, data_only=True)
    ws = find_rekap(wb)
    unit_col, cols, eval_col = locate(ws)
    m = re.search(r"TW\s+(IV|III|II|I)\b", norm(ws.title))
    eval_tw = m.group(1) if m else ""
    sheets = unit_sheets(wb)

    units = []
    for r in range(4, ws.max_row + 1):
        name = text(ws.cell(r, unit_col).value)
        no = ws.cell(r, 1).value
        if not name or not isinstance(no, (int, float)):
            if units:
                break  # end of the unit block
            continue
        tw = {}
        for q in TW_LABELS:
            block = cols.get(q, {})
            rec = {}
            for key, _ in ASPECTS:
                if key in block:
                    rec[key] = num(ws.cell(r, block[key]["nilai"]).value)
                    rec[key + "_kat"] = text(ws.cell(r, block[key]["kat"]).value)
            tw[q] = rec if rec.get("total") is not None else None
        short, full, detail = match_sheet(name, sheets) or (name, name, None)
        units.append({
            "no": int(no),
            "unit": name,
            "singkat": short,
            "tw": tw,
            "evaluasi": text(ws.cell(r, eval_col).value) if eval_col else "",
            "detail": detail,
        })

    # Rank per quarter (1 = highest total; equal totals share a rank).
    for q in TW_LABELS:
        totals = [u["tw"][q]["total"] for u in units if u["tw"][q]]
        for u in units:
            if u["tw"][q]:
                t = u["tw"][q]["total"]
                u["tw"][q]["peringkat"] = 1 + sum(1 for v in totals if v > t)

    quarters = [{"tw": q, "label": "Triwulan " + q,
                 "ada": any(u["tw"][q] for u in units)} for q in TW_LABELS]
    year = re.search(r"(20\d\d)", ws.title)
    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sourceModified": modified,
        "tahun": int(year.group(1)) if year else None,
        "evaluasiTw": eval_tw,
        "quarters": quarters,
        "units": units,
    }
    js = "window.NKO=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(f"{out_dir}/nko.js", "w", encoding="utf-8") as f:
        f.write(js)
    with open(f"{out_dir}/nko-meta.json", "w", encoding="utf-8") as f:
        json.dump({"sourceModified": modified, "generated": payload["generated"],
                   "quarters": [q["tw"] for q in quarters if q["ada"]]}, f)
    print("sheet:", ws.title, "| units:", len(units),
          "| quarters with data:", [q["tw"] for q in quarters if q["ada"]],
          "| units with detail sheet:", sum(1 for u in units if u["detail"]),
          "| nko.js bytes:", len(js.encode("utf-8")))


if __name__ == "__main__":
    main()
