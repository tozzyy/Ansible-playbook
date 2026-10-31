#!/usr/bin/env python3
"""
Phase 1 - vector extraction from House-Phrae_Core+Infra_20p.pdf

Reads the CAD-generated vector content of the plan sheets and writes raw,
purely numeric geometry (metres, origin = grid 1 / grid A') to data/raw/.
Nothing in here is interpreted: it only measures what is drawn.

  * wall hatch runs  (AR-08, AR-09)  - 0.24pt / 50% grey diagonal hatch strokes
  * grid lines       (AR-08, AR-09, ST-04) - 0.12pt / 33% grey dash-dot lines
  * columns          (AR-08, AR-09, ST-04) - 0.20 x 0.20 m quads

Usage:  python3 scripts/extract_pdf.py /path/to/House-Phrae_Core+Infra_20p.pdf
Requires: pip install pymupdf
"""
import collections
import json
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw"

# 1:125 on the sheet -> 1 m = 8 mm = 22.677 pt
PT_PER_M = 1000 / 125 / 25.4 * 72

# Calibration: PDF-point position of grid 1 (x) and grid A' (y) on each sheet.
# x of grid 1 and y of grid A are read from the detected grid lines; A' is
# derived from the A'-A dimension (5.00 m, AR-08) because A' is only drawn on AR-08.
SHEETS = {
    "AR-08": {"page": 3, "origin": [330.12, 260.72 - 5 * PT_PER_M]},
    "AR-09": {"page": 4, "origin": [345.60, 275.24 - 5 * PT_PER_M]},
    "ST-04": {"page": 16, "origin": [345.60, 214.40 - 5 * PT_PER_M]},
}


def to_m(sheet, x, y):
    ox, oy = SHEETS[sheet]["origin"]
    return (x - ox) / PT_PER_M, (y - oy) / PT_PER_M


def style(dr):
    return round(dr.get("width") or 0, 2), round((dr.get("color") or (9,))[0], 2)


def iter_segments(dr):
    for it in dr["items"]:
        if it[0] == "l":
            yield it[1], it[2]
        elif it[0] == "re":
            r = it[1]
            yield from ((r.tl, r.tr), (r.tr, r.br), (r.br, r.bl), (r.bl, r.tl))


def hatch_runs(doc, sheet):
    """Group 45deg hatch strokes into wall runs. Each run = rectangle of brick core."""
    page = doc[SHEETS[sheet]["page"] - 1]
    diag = []
    for dr in page.get_drawings():
        if style(dr) != (0.24, 0.5):
            continue
        for a, b in iter_segments(dr):
            x1, y1 = to_m(sheet, a.x, a.y)
            x2, y2 = to_m(sheet, b.x, b.y)
            dx, dy = abs(x2 - x1), abs(y2 - y1)
            if dx > 0.004 and dy > 0.004 and 0.6 < dx / dy < 1.7 and (dx * dx + dy * dy) ** 0.5 < 0.45:
                diag.append((min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)))

    def runs(axis):
        groups = collections.defaultdict(list)
        for s in diag:
            if axis == "h":
                groups[(round(s[1], 2), round(s[3], 2))].append((s[0], s[2]))
            else:
                groups[(round(s[0], 2), round(s[2], 2))].append((s[1], s[3]))
        out = []
        for (c0, c1), spans in groups.items():
            if not 0.05 <= c1 - c0 <= 0.4:
                continue
            spans.sort()
            cur, n = None, 0
            for a, b in spans + [(1e9, 1e9)]:
                if cur and a - cur[1] < 0.16:
                    cur[1] = max(cur[1], b)
                    n += 1
                    continue
                if cur and n >= 4:
                    out.append({"core": [c0, c1], "span": [round(cur[0], 3), round(cur[1], 3)], "strokes": n})
                cur, n = [a, b], 1
        return sorted(out, key=lambda r: (r["core"][0], r["span"][0]))

    return {"h": runs("h"), "v": runs("v"), "strokeCount": len(diag)}


def grid_lines(doc, sheet, min_len_pt=40):
    page = doc[SHEETS[sheet]["page"] - 1]
    V, H = collections.defaultdict(float), collections.defaultdict(float)
    for dr in page.get_drawings():
        if style(dr) != (0.12, 0.33):
            continue
        for a, b in iter_segments(dr):
            if abs(a.x - b.x) < 0.01 and abs(a.y - b.y) > 0.5:
                V[round(a.x, 2)] += abs(a.y - b.y)
            if abs(a.y - b.y) < 0.01 and abs(a.x - b.x) > 0.5:
                H[round(a.y, 2)] += abs(a.x - b.x)
    ox, oy = SHEETS[sheet]["origin"]
    return {
        "x": [round((k - ox) / PT_PER_M, 3) for k, v in sorted(V.items()) if v > min_len_pt],
        "y": [round((k - oy) / PT_PER_M, 3) for k, v in sorted(H.items()) if v > min_len_pt],
    }


def columns(doc, sheet):
    page = doc[SHEETS[sheet]["page"] - 1]
    found = []
    for dr in page.get_drawings():
        for it in dr["items"]:
            if it[0] != "qu":
                continue
            r = it[1].rect
            w, h = r.width / PT_PER_M, r.height / PT_PER_M
            if 0.17 <= w <= 0.23 and 0.17 <= h <= 0.23:
                x, y = to_m(sheet, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
                found.append([round(x, 3), round(y, 3), round(w, 3), round(h, 3)])
    uniq = []
    for c in sorted(found, key=lambda c: -c[2] * c[3]):
        if all(abs(c[0] - u[0]) > 0.1 or abs(c[1] - u[1]) > 0.1 for u in uniq):
            uniq.append(c)
    return sorted(uniq, key=lambda c: (c[1], c[0]))


def main(pdf):
    doc = pymupdf.open(pdf)
    OUT.mkdir(parents=True, exist_ok=True)
    raw = {
        "source": Path(pdf).name,
        "ptPerMetre": PT_PER_M,
        "sheets": SHEETS,
        "hatch": {"F1": hatch_runs(doc, "AR-08"), "F2": hatch_runs(doc, "AR-09")},
        "gridLines": {s: grid_lines(doc, s) for s in SHEETS},
        "columns": {s: columns(doc, s) for s in SHEETS},
    }
    (OUT / "pdf-extract.json").write_text(json.dumps(raw, indent=1, ensure_ascii=False))
    print("wrote", OUT / "pdf-extract.json")
    for f in ("F1", "F2"):
        print(f, "hatch runs h/v:", len(raw["hatch"][f]["h"]), len(raw["hatch"][f]["v"]))
    for s, c in raw["columns"].items():
        print(s, "columns:", len(c))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
