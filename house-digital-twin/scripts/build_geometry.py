#!/usr/bin/env python3
"""
Phase 1 - build the Geometry JSON + Verification Report.

  data/raw/pdf-extract.json      (measured from the PDF by extract_pdf.py)
+ data/inputs/*.json             (hand-read interpretation, every item has a source)
= src/data/geometry/floor-1.json, floor-2.json, src/data/building.json
  docs/VERIFICATION_REPORT.md

Rules (no invention):
  * A wall exists only where the PDF has wall hatch, or where an unhatched wall
    line is listed in manualWalls (always status "unverified").
  * Hatch runs on the same line are joined only across a column or across a
    scheduled opening that is tagged on the plan. Other gaps stay open.
  * Opening width/height/sill come from the AR-26/AR-27 type, never from the plan.
    The hatch gap is measured; |gap - width| > 0.15 m downgrades to "unverified".
  * Conflicting values are never resolved - the status becomes "conflict" and
    the issue lists every value with its sheet.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = json.loads((ROOT / "data/raw/pdf-extract.json").read_text())
SHEETS = json.loads((ROOT / "data/inputs/sheets.json").read_text())
BUILDING = json.loads((ROOT / "data/inputs/building.json").read_text())
FLOORS = [json.loads((ROOT / f"data/inputs/floor-{n}.input.json").read_text()) for n in (1, 2)]

PLASTER = 0.03          # 2 x ~0.015 plaster faces measured outside the hatch core
LINE_TOL = 0.08         # runs within 8 cm (centreline) are on the same wall line
BAND_GAP = 0.06         # two hatch bands closer than this = one thick wall
GAP_TOL = 0.15          # allowed |hatch gap - scheduled width|
RANK = {"verified": 0, "unverified": 1, "conflict": 2}

PAGE = {s["sheet"]: s["pdfPage"] for s in SHEETS["sheets"]}
TYPES = {t["code"]: t for t in BUILDING["doorTypes"] + BUILDING["windowTypes"]}
DECISIONS = BUILDING.get("decisions", [])
RESOLVED = {iss: d["id"] for d in DECISIONS for iss in d["resolves"]}   # issue id -> decision id
CEILING_ISSUES = {"ISS-03", "ISS-05", "ISS-17", "ISS-18"}
FLOOR_ISSUES = {"ISS-04", "ISS-17"}


def resolve(status, issues):
    """A non-verified status whose related issues are all resolved by a decision becomes verified."""
    rel = [i for i in issues if i.startswith("ISS-")]
    if status != "verified" and rel and all(i in RESOLVED for i in rel):
        return "verified", sorted({RESOLVED[i] for i in rel})
    return status, []


# apply decisions to the door/window types
for _t in TYPES.values():
    _t["status"], _t["decisions"] = resolve(_t["status"], _t.get("issues", []))


def src(sheet, note=None):
    d = {"sheet": sheet, "pdfPage": PAGE[sheet]}
    if note:
        d["note"] = note
    return d


def worst(*st):
    return max((s for s in st if s), key=lambda s: RANK[s])


def r3(v):
    return round(v + 0.0, 3)


def inside(b, x, y):
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


# --------------------------------------------------------------------------- walls
def load_runs(fl):
    runs = []
    for axis in ("h", "v"):
        for r in RAW["hatch"][fl["floorId"]][axis]:
            c0, c1 = r["core"]
            s0, s1 = r["span"]
            mid = ((s0 + s1) / 2, (c0 + c1) / 2) if axis == "h" else ((c0 + c1) / 2, (s0 + s1) / 2)
            if any(inside(e["bbox"], *mid) for e in fl.get("excludeHatch", [])):
                continue
            runs.append({"axis": axis, "c0": c0, "c1": c1, "s0": s0, "s1": s1, "manual": False})
    # merge parallel double bands (e.g. 0.19 m wall on grid 1)
    changed = True
    while changed:
        changed = False
        for i, a in enumerate(runs):
            for b in runs[i + 1:]:
                if a["axis"] != b["axis"]:
                    continue
                ov = min(a["s1"], b["s1"]) - max(a["s0"], b["s0"])
                gap = max(a["c0"], b["c0"]) - min(a["c1"], b["c1"])
                if ov > 0.5 * min(a["s1"] - a["s0"], b["s1"] - b["s0"]) and 0 <= gap <= BAND_GAP:
                    a.update(c0=min(a["c0"], b["c0"]), c1=max(a["c1"], b["c1"]),
                             s0=min(a["s0"], b["s0"]), s1=max(a["s1"], b["s1"]), bands=2)
                    runs.remove(b)
                    changed = True
                    break
            if changed:
                break
    for r in runs:
        r["c"] = (r["c0"] + r["c1"]) / 2
        r["t"] = (r["c1"] - r["c0"]) + PLASTER
    for m in fl.get("manualWalls", []):
        runs.append({"axis": m["axis"], "c": m["at"], "t": m["thickness"], "s0": m["from"], "s1": m["to"],
                     "manual": True, "manualId": m["id"], "note": m["note"]})
    return runs


class DSU:
    def __init__(self, n):
        self.p = list(range(n))

    def f(self, i):
        while self.p[i] != i:
            self.p[i] = self.p[self.p[i]]
            i = self.p[i]
        return i

    def u(self, a, b):
        self.p[self.f(a)] = self.f(b)


def build_floor(fl, columns):
    F = fl["floorId"]
    sheet = fl["sheet"]
    runs = load_runs(fl)
    dsu = DSU(len(runs))

    def rule_of(r):
        mid = ((r["s0"] + r["s1"]) / 2, r["c"]) if r["axis"] == "h" else (r["c"], (r["s0"] + r["s1"]) / 2)
        return next(k for k, rr in enumerate(fl["heightRules"]) if inside(rr["bbox"], *mid))

    for r in runs:
        r["rule"] = rule_of(r)

    def same_line(a, b):
        return a["axis"] == b["axis"] and abs(a["c"] - b["c"]) <= LINE_TOL and a["rule"] == b["rule"]

    # join touching pieces of the same wall (never across columns: the column sits between two walls)
    for i, a in enumerate(runs):
        for j, b in enumerate(runs):
            if i != j and same_line(a, b) and -0.01 <= b["s0"] - a["s1"] <= 0.02:
                dsu.u(i, j)

    def jambs(axis, at):
        """Solid intervals along a wall line: runs on the line, columns on the line, perpendicular walls ending on it."""
        out = []
        for i, r in enumerate(runs):
            if r["axis"] == axis and abs(r["c"] - at) <= LINE_TOL:
                out.append((r["s0"], r["s1"], i, "wall"))
            elif r["axis"] != axis and (r["s0"] - 0.3 <= at <= r["s1"] + 0.3):
                out.append((r["c"] - r["t"] / 2, r["c"] + r["t"] / 2, None, "cross-wall"))
        for cx, cy, cw, ch in columns:
            along, perp = (cx, cy) if axis == "h" else (cy, cx)
            if abs(perp - at) < 0.2:
                out.append((along - 0.1, along + 0.1, None, "column"))
        return out

    # openings: find the clear gap between the nearest solid jambs
    pre = []
    for o in fl["openings"]:
        T = TYPES[o["code"]]
        cen, w = o["center"], T["width"]
        J = jambs(o["axis"], o["at"])
        cont = [j for j in J if j[2] is not None and j[0] - 0.01 <= cen <= j[1] + 0.01]
        if cont:
            pre.append((o, cont[0][2], None, None, "inside " + ("manual wall " + runs[cont[0][2]]["manualId"] if runs[cont[0][2]]["manual"] else "hatch run")))
            continue
        L_ = [j for j in J if j[1] <= cen + 0.01]
        R_ = [j for j in J if j[0] >= cen - 0.01]
        lj = max(L_, key=lambda j: j[1]) if L_ else None
        rj = min(R_, key=lambda j: j[0]) if R_ else None
        if lj and rj and rj[0] - lj[1] <= 3.5:
            gap = (lj[1], rj[0])
            info = f"gap {gap[0]:.2f}-{gap[1]:.2f} between {lj[3]} and {rj[3]}"
        else:
            gap, info = None, "only one jamb found"
        wall_l = [j for j in L_ if j[2] is not None and cen - j[1] <= 3.5]
        wall_r = [j for j in R_ if j[2] is not None and j[0] - cen <= 3.5]
        li = max(wall_l, key=lambda j: j[1])[2] if wall_l else None
        ri = min(wall_r, key=lambda j: j[0])[2] if wall_r else None
        if li is not None and ri is not None and runs[li]["rule"] == runs[ri]["rule"] \
                and not any(j[3] in ("column", "cross-wall") and lj and rj and lj[1] - 0.01 <= j[0] and j[1] <= rj[0] + 0.01 for j in J) \
                and lj and lj[2] == li and rj and rj[2] == ri:
            dsu.u(li, ri)                    # wall continues on both sides of the opening
            host = li
        else:
            host = li if li is not None and (ri is None or cen - runs[li]["s1"] <= runs[ri]["s0"] - cen) else ri
            if host is None:
                raise SystemExit(f"{F}: no host wall for opening {o}")
            r = runs[host]                   # extend the host run up to the far jamb
            if r["s1"] <= cen:
                r["s1"] = max(r["s1"], rj[0] if rj else cen + w / 2)
            else:
                r["s0"] = min(r["s0"], lj[1] if lj else cen - w / 2)
        pre.append((o, host, gap, (lj, rj), info))

    # an opening gap shared by several openings at overlapping heights cannot be measured per opening
    def zr(o):
        T = TYPES[o["code"]]
        return (T["sill"], T["sill"] + T["height"])
    opening_hosts = []
    for o, host, gap, jj, info in pre:
        shared = [p for p in pre if p[0] is not o and p[2] and gap and abs(p[2][0] - gap[0]) < 1e-6 and abs(p[2][1] - gap[1]) < 1e-6
                  and min(zr(o)[1], zr(p[0])[1]) > max(zr(o)[0], zr(p[0])[0])]
        g = None
        if gap and not shared:
            g = gap[1] - gap[0]
        elif gap and shared:
            info += f"; gap shared by {len(shared) + 1} openings"
        opening_hosts.append((o, host, g, info, bool(gap)))

    # group into walls
    groups = {}
    for i in range(len(runs)):
        groups.setdefault(dsu.f(i), []).append(i)
    walls, run2wall = [], {}
    ordered = sorted(groups.values(), key=lambda g: (runs[g[0]]["axis"], round(min(runs[i]["c"] for i in g), 2), min(runs[i]["s0"] for i in g)))
    for n, g in enumerate(ordered, 1):
        members = [runs[i] for i in g]
        hatch = [m for m in members if not m["manual"]]
        axis = members[0]["axis"]
        c = sum(m["c"] for m in hatch) / len(hatch) if hatch else members[0]["c"]
        t = max(m["t"] for m in hatch) if hatch else members[0]["t"]
        s0, s1 = min(m["s0"] for m in members), max(m["s1"] for m in members)
        start, end = ([s0, c], [s1, c]) if axis == "h" else ([c, s0], [c, s1])
        rule = fl["heightRules"][members[0]["rule"]]
        status = "verified" if not any(m["manual"] for m in members) else "unverified"
        notes, issues = [], ["ISS-23"]
        if any(m.get("bands") for m in hatch):
            notes.append("two hatch bands merged (thick wall)")
        for m in members:
            if m["manual"]:
                notes.append(f'{m["manualId"]}: {m["note"]}')
        wid = f"{F}-W{n:03d}"
        sources = [src(sheet, "wall hatch (vector) - position & core thickness" if hatch else "drawn line, no hatch")]
        sources += rule.get("sources", [])
        walls.append({
            "id": wid, "floorId": F, "axis": axis,
            "start": [r3(start[0]), r3(start[1])], "end": [r3(end[0]), r3(end[1])],
            "thickness": r3(t), "baseElevation": rule["base"], "height": rule["height"],
            "status": worst(status, rule["status"]),
            "fieldStatus": {"position": status, "thickness": status, "height": rule["status"]},
            "hatchSpans": [[r3(m["s0"]), r3(m["s1"])] for m in sorted(hatch, key=lambda m: m["s0"])],
            "sources": sources,
            "issues": sorted(set(issues + rule.get("issues", []))),
            "note": "; ".join(notes + [rule["note"]]),
        })
        for i in g:
            run2wall[i] = walls[-1]

    # openings out
    openings = []
    for n, (o, host, gap, hostinfo, two_jambs) in enumerate(opening_hosts, 1):
        T = TYPES[o["code"]]
        wall = run2wall[host]
        s0 = wall["start"][0] if wall["axis"] == "h" else wall["start"][1]
        notes = [f'tag: {o["tag"]}', hostinfo]
        # position: both jambs drawn solid (hatch/column/cross wall) in the PDF
        pos = "verified" if two_jambs and wall["fieldStatus"]["position"] == "verified" else "unverified"
        if pos != "verified":
            notes.append("position from tag only (host not hatched or jamb missing)")
        size = T["status"]
        if gap is not None:
            notes.append(f"measured clear gap {gap:.2f} m vs scheduled width {T['width']:.2f} m")
            if abs(gap - T["width"]) > GAP_TOL and size == "verified":
                if "ISS-32" in RESOLVED:
                    notes.append(f'plan gap != schedule width; schedule frame size used ({RESOLVED["ISS-32"]})')
                else:
                    size = "unverified"
                    notes.append("plan gap != schedule width (>0.15 m)")
        tagst, tagdec = resolve(o.get("status", "verified"), o.get("issues", []))
        status = worst(pos, size, tagst)
        type_sheet = T["sources"][0]["sheet"]
        openings.append({
            "id": f"{F}-O{n:03d}", "floorId": F, "wallId": wall["id"], "kind": T["kind"], "typeCode": o["code"],
            "offset": r3(o["center"] - T["width"] / 2 - s0), "center": r3(o["center"]),
            "width": T["width"], "height": T["height"], "sillHeight": T["sill"],
            # absolute bottom level of the opening; sill datum = host wall base unless the type says otherwise
            "sillZ": r3((4.10 if "คานชั้น 2" in T.get("sillDatum", "") else wall["baseElevation"]) + T["sill"]),
            "status": status,
            "fieldStatus": {"position": pos, "size": size, "tag": tagst},
            "measuredGap": r3(gap) if gap is not None else None,
            "sources": [src(sheet, "tag + position"), src(type_sheet, f"type {o['code']} size")],
            "issues": sorted(set(o.get("issues", []) + T.get("issues", []))),
            "decisions": sorted(set(T.get("decisions", []) + tagdec)),
            "note": "; ".join(notes),
        })

    # rooms
    rooms = []
    for r in fl["rooms"]:
        poly = r.get("polygon") or [[r["rect"][0], r["rect"][1]], [r["rect"][2], r["rect"][1]],
                                     [r["rect"][2], r["rect"][3]], [r["rect"][0], r["rect"][3]]]
        area = abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
                       for i in range(len(poly)))) / 2
        xs, ys = [p[0] for p in poly], [p[1] for p in poly]
        tag = r["tag"]
        st = dict(r["status"])
        decided = set()
        for field, rel in (("ceiling", CEILING_ISSUES), ("floor", FLOOR_ISSUES)):
            st[field], d = resolve(st[field], sorted(rel & set(r.get("issues", []))))
            decided |= set(d)
        decided = sorted(decided)
        tagtxt = f'{tag["F"]} {tag["fl"]:+.2f} / {tag["C"] or "-"} {("%+.2f" % tag["cl"]) if tag["cl"] is not None else "-"}'
        rooms.append({
            "id": r["id"], "floorId": F, "name": r["name"], "nameEn": r["nameEn"],
            "polygon": [[r3(x), r3(y)] for x, y in poly],
            "floorElevation": tag["fl"], "ceilingHeight": tag["cl"],
            "ceilingLevel": r3(tag["fl"] + tag["cl"]) if tag["cl"] is not None else None,
            "finish": {"floor": tag["F"], "ceiling": tag["C"], "status": "unverified", "issues": ["ISS-01"]},
            "area": r3(area), "bbox": {"x": r3(max(xs) - min(xs)), "y": r3(max(ys) - min(ys))},
            "areaBasis": "wall centre-lines",
            "status": worst(st["polygon"], st["floor"], st["ceiling"]),
            "fieldStatus": st,
            "sources": [src(sheet, f"room tag {tagtxt}; polygon from wall centre-lines")] + r.get("sources", []),
            "issues": r.get("issues", []),
            "decisions": decided,
            "note": r.get("note", ""),
        })

    return {
        "floorId": F, "name": fl["name"], "level": fl["level"], "sheet": sheet, "pdfPage": fl["pdfPage"],
        "walls": walls, "openings": openings, "rooms": rooms,
        "stairs": [_resolve_stair(x) for x in fl["stairs"]], "voids": fl["voids"], "slabs": fl["slabs"], "unassigned": fl["unassigned"],
    }


# --------------------------------------------------------------------------- grids/columns/north
def _resolve_stair(s):
    s = json.loads(json.dumps(s))
    s["landing"]["status"], s["landing"]["decisions"] = resolve(s["landing"]["status"], s["landing"].get("issues", []))
    return s


def levels():
    out = []
    for l in BUILDING["levels"]:
        l = dict(l)
        if l["status"] != "verified":
            l["status"], d = resolve(l["status"], l.get("issues", []))
            l["decisions"] = sorted(set(l.get("decisions", []) + d))
        out.append(l)
    return out


def grids():
    out = {}
    for axis in ("x", "y"):
        lst = []
        for g in BUILDING["grids"][axis]:
            det = {s: any(abs(v - g["pos"]) < 0.03 for v in RAW["gridLines"][s][axis]) for s in RAW["gridLines"]}
            n = sum(det.values())
            status = "verified" if n >= 1 else "unverified"
            dec = []
            if g.get("issues"):
                status, dec = resolve("conflict", g["issues"])
            lst.append({**g, "detectedOn": det, "status": status, "decisions": dec,
                        "sources": [src(s, "grid line detected") for s, v in det.items() if v]})
        out[axis] = lst
    return out


def grid_name(x, y):
    gx = next((g["name"] for g in BUILDING["grids"]["x"] if abs(g["pos"] - x) < 0.06), None)
    gy = next((g["name"] for g in BUILDING["grids"]["y"] if abs(g["pos"] - y) < 0.06), None)
    return f"{gx}/{gy}" if gx and gy else None


def columns_check():
    allc = []
    for sheet in ("AR-08", "AR-09", "ST-04"):
        for x, y, w, h in RAW["columns"][sheet]:
            hit = next((c for c in allc if abs(c["x"] - x) < 0.1 and abs(c["y"] - y) < 0.1), None)
            if not hit:
                hit = {"x": x, "y": y, "size": [w, h], "on": {}}
                allc.append(hit)
            hit["on"][sheet] = True
    out, mism = [], []
    for n, c in enumerate(sorted(allc, key=lambda c: (c["y"], c["x"])), 1):
        on = {s: c["on"].get(s, False) for s in ("AR-08", "AR-09", "ST-04")}
        k = sum(on.values())
        if k == 3:
            st = "verified"
        elif c["y"] < 4.5 and on["AR-08"]:
            st = "unverified"   # kitchen block: only AR-08 covers it
        else:
            st = "conflict"
        g = grid_name(c["x"], c["y"])
        was = st
        dec = []
        if st != "verified":
            st, dec = resolve(st, ["ISS-21"])
        role = "structural (ST-04)" if on["ST-04"] else "architectural plan only"
        rec = {"id": f"C{n:02d}", "x": r3(c["x"]), "y": r3(c["y"]), "size": [0.2, 0.2], "grid": g, "shownOn": on, "role": role,
               "status": st, "decisions": dec, "sources": [src(s, "column 0.20x0.20") for s, v in on.items() if v],
               "issues": ["ISS-21"] if was != "verified" else []}
        out.append(rec)
        if was == "conflict":
            mism.append(f'{g or "(%.2f, %.2f)" % (c["x"], c["y"])}: ' + ", ".join(f'{s} {"yes" if v else "NO"}' for s, v in on.items()))
    return out, mism


def north():
    m = BUILDING["north"]["measured"]
    a = math.radians(m["buildingYAxisPageAngleDeg"])
    ux, uy = math.cos(a), math.sin(a)                      # plan +Y on site sheet (page coords, y down)
    th = math.atan2(-ux, uy)                               # rotation plan->page
    nx, ny = m["northArrowPageVector"]
    L = math.hypot(nx, ny)
    nx, ny = nx / L, ny / L
    px = math.cos(-th) * nx - math.sin(-th) * ny            # rotate back into plan coords
    py = math.sin(-th) * nx + math.cos(-th) * ny
    bearing_up = (math.degrees(math.atan2(px, -py)) + 360) % 360   # clockwise from sheet-up to north
    return {**BUILDING["north"], "planVector": [r3(px), r3(py)],
            "northClockwiseFromSheetUpDeg": round(bearing_up, 1),
            "planPlusYBearingDeg": round((180 - bearing_up) % 360, 1)}


# --------------------------------------------------------------------------- report
def md_table(rows, head):
    out = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


BADGE = {"verified": "✅ Verified", "unverified": "⚠️ Unverified", "conflict": "❌ Conflict"}


def refs(sources):
    return "<br>".join(f'{s["sheet"]} (p.{s["pdfPage"]})' for s in sources)


def report(floors, bld):
    L = ["# Geometry Verification Report — Phase 1", "",
         "Generated by `scripts/build_geometry.py` from `data/raw/pdf-extract.json` (vector measurements) and "
         "`data/inputs/*.json` (hand-read values). Do not edit by hand — edit the inputs and rebuild.", "",
         "Source: `House-Phrae_Core+Infra_20p.pdf` (20-page extract). Sheet numbers are authoritative; "
         "`p.N` = page in the 20-page PDF.", "",
         "Status legend: ✅ **Verified** = measured from vectors and/or confirmed by ≥1 sheet with no contradiction · "
         "⚠️ **Unverified** = drawn but not measurable / interpreted / single weak source · "
         "❌ **Conflict** = two sheets disagree (all values listed, none chosen).", ""]
    # summary
    rows = []
    for f in floors:
        for k in ("walls", "rooms", "openings"):
            c = {s: sum(1 for e in f[k] if e["status"] == s) for s in RANK}
            rows.append([f["floorId"], k, len(f[k]), c["verified"], c["unverified"], c["conflict"]])
    cols = bld["columns"]
    rows.append(["all", "columns", len(cols)] + [sum(1 for c in cols if c["status"] == s) for s in RANK])
    L += ["## 1. Summary", "", md_table(rows, ["Floor", "Element", "Total", "Verified", "Unverified", "Conflict"]), ""]
    # sheet map
    L += ["## 2. Source Drawing Mapping (sheet ↔ PDF page)", "",
          md_table([[s["sheet"], s["pdfPage"], s["title"], s.get("scale") or "-", s["phase"], s.get("note", "")] for s in SHEETS["sheets"]],
                   ["Sheet", "PDF page", "Title", "Scale", "Phase", "Note"]), ""]
    # calibration
    L += ["## 3. Scale calibration & coordinate system", "",
          "- Origin (0,0) = grid **1** × grid **A'**. +X along numeric grids, +Y towards F (down on AR-08), Z = absolute level.",
          f"- Plan sheets are true 1:125 on A3: 1 m = {SHEETS['ptPerMetre1to125']:.4f} pt. Check: grid 1→5 measured 362.88 pt = 16.002 m vs dimension 16.00 m (AR-08); A→F 21.70 m (AR-08, AR-09, ST-04).",
          ""]
    L += [md_table([[s["sheet"], s["calibration"]["originPt"], s["calibration"]["method"]] for s in SHEETS["sheets"] if "calibration" in s],
                   ["Sheet", "Origin (pt)", "Method"]), ""]
    n = bld["north"]
    L += [f"- North (AR-07): {n['northClockwiseFromSheetUpDeg']}° clockwise from sheet-up on AR-08; plan +Y (A→F) bears {n['planPlusYBearingDeg']}°. Status {BADGE[n['status']]} (ISS-29).", ""]
    # levels
    L += ["## 4. Levels", "", md_table([[l["name"], "/".join(f'{v["z"]:+.2f} ({v["sheet"]})' for v in l["values"]) if l.get("values") else f'{l["z"]:+.2f}',
                                          BADGE[l["status"]], refs(l["sources"]), ", ".join(l.get("issues", []))] for l in bld["levels"]],
                                        ["Level", "Value", "Status", "Sources", "Issues"]), ""]
    # grids
    rows = []
    for ax in ("x", "y"):
        for g in bld["grids"][ax]:
            rows.append([ax.upper(), g["name"], f'{g["pos"]:.2f}', " ".join(f'{s}:{"✔" if v else "–"}' for s, v in g["detectedOn"].items()),
                         BADGE[g["status"]], ", ".join(g.get("issues", []))])
    L += ["## 5. Grid lines (AR-08 / AR-09 / ST-04)", "",
          "✔ = dash-dot grid line found in the vector data within ±3 cm of the dimensioned position; – = bubble only / not drawn on that sheet.", "",
          md_table(rows, ["Axis", "Grid", "Pos (m)", "Line detected", "Status", "Issues"]), ""]
    L += ["Dimension chains read:", ""] + [f'- **{d["sheet"]}**: {d["chain"]}' for d in BUILDING["grids"]["dimensionChecks"]] + [""]
    # columns
    L += ["## 6. Columns cross-check (0.20 × 0.20 quads)", "",
          md_table([[c["id"], c["grid"] or "-", f'{c["x"]:.2f}', f'{c["y"]:.2f}',
                     " ".join(f'{s}:{"✔" if v else "–"}' for s, v in c["shownOn"].items()), BADGE[c["status"]]] for c in cols],
                   ["ID", "Grid", "X", "Y", "Shown on", "Status"]), ""]
    # per floor
    for f in floors:
        L += [f'## 7.{f["floorId"][1]} {f["name"]} — {f["sheet"]} (p.{f["pdfPage"]})', ""]
        L += ["### Rooms", "", md_table([[r["id"], r["name"], r["nameEn"], f'{r["area"]:.2f}', f'{r["bbox"]["x"]:.2f} × {r["bbox"]["y"]:.2f}',
                                          f'{r["floorElevation"]:+.2f}', f'{r["ceilingHeight"]:.2f}' if r["ceilingHeight"] is not None else "-",
                                          " / ".join(f"{k}:{BADGE[v].split()[0]}" for k, v in r["fieldStatus"].items()),
                                          BADGE[r["status"]], refs(r["sources"]), ", ".join(r["issues"])] for r in f["rooms"]],
                                        ["ID", "Name", "EN", "Area m²", "W × D (m)", "Floor", "Ceil (rel)", "polygon/floor/ceiling", "Status", "Sources", "Issues"]), ""]
        if f["unassigned"]:
            L += [f'- Unassigned space (no tag, not a room): {u["rect"]} — {u["note"]}' for u in f["unassigned"]] + [""]
        L += ["### Walls", "", md_table([[w["id"], w["axis"], f'({w["start"][0]:.2f}, {w["start"][1]:.2f}) → ({w["end"][0]:.2f}, {w["end"][1]:.2f})',
                                          f'{w["thickness"]:.2f}', f'{w["baseElevation"]:+.2f} / {w["height"]:.2f}',
                                          " ".join(f"{a:.2f}–{b:.2f}" for a, b in w["hatchSpans"]) or "(none)",
                                          BADGE[w["status"]], w["note"]] for w in f["walls"]],
                                        ["ID", "Axis", "Centre-line", "Thk", "Base / H", "Hatch spans", "Status", "Note"]), ""]
        L += ["### Openings", "", md_table([[o["id"], o["typeCode"], o["kind"], o["wallId"], f'{o["center"]:.2f}', f'{o["width"]:.2f} × {o["height"]:.2f}',
                                             f'{o["sillHeight"]:.2f}', f'{o["measuredGap"]:.2f}' if o["measuredGap"] is not None else "-",
                                             " / ".join(f"{k}:{BADGE[v].split()[0]}" for k, v in o["fieldStatus"].items()),
                                             BADGE[o["status"]], ", ".join(o["issues"]), o["note"]] for o in f["openings"]],
                                           ["ID", "Type", "Kind", "Wall", "Centre", "W × H", "Sill", "Plan gap", "position/size/tag", "Status", "Issues", "Note"]), ""]
        for s in f["stairs"]:
            L += ["### Stair", "", f'- **{s["id"]}** {s["name"]}: {s["risers"]} risers × {s["riser"]} = {s["risers"] * s["riser"]:.2f} m '
                  f'({s["fromLevel"]:+.2f} → {s["toLevel"]:+.2f}), tread {s["tread"]}, bbox {s["bbox"]} — {BADGE[s["status"]]} — {refs(s["sources"])}']
            L += [f'  - Flight {fl["id"]}: risers {fl["risers"][0]}–{fl["risers"][1]}, x {fl["x"]}, y {fl["yStart"]}→{fl["yEnd"]}' for fl in s["flights"]]
            L += [f'  - Landing {s["landing"]["rect"]} at {s["landing"]["z"]:+.2f} (label {s["landing"]["labelValue"]}) — {BADGE[s["landing"]["status"]]} {", ".join(s["landing"]["issues"])}', ""]
        for v in f["voids"] + f["slabs"]:
            L += [f'- **{v["id"]}** {v["name"]} — {BADGE[v["status"]]} — {refs(v["sources"])}']
        L += [""]
    # decisions
    L += ["## 8. Decisions (owner + delegated engineering judgement)", "", md_table([[d["id"], d["date"], d["by"], ", ".join(d["resolves"]), d["decision"], d["effect"]] for d in bld["decisions"]],
                                               ["ID", "Date", "By", "Resolves", "Decision", "Rationale / effect"]), ""]
    # issues
    L += ["## 9. Issues — Conflicts, Unverified items, Notes", ""]
    for kind in ("conflict", "unverified", "info"):
        for i in bld["issues"]:
            if i["type"] != kind:
                continue
            res = f' · RESOLVED by {i["resolution"]["decision"]}' if i.get("resolution") else ""
            L += [f'### {i["id"]} · {kind.upper()}{res} · {i["title"]}', ""]
            if i.get("resolution"):
                L += [f'> **{i["resolution"]["decision"]} ({i["resolution"]["date"]}, {i["resolution"]["by"]}):** {i["resolution"]["text"]}', ""]
            for v in i.get("values", []):
                L += [f'- `{v["value"]}` — {v["sheet"]} (p.{v["pdfPage"]})']
            if i.get("detail"):
                L += ["", i["detail"]]
            L += [""]
    return "\n".join(L) + "\n"


def main():
    floors = []
    for fl, sheet in zip(FLOORS, ("AR-08", "AR-09")):
        floors.append(build_floor(fl, RAW["columns"][sheet]))
    cols, mism = columns_check()
    issues = list(BUILDING["issues"])
    issues.append({"id": "ISS-21", "type": "conflict", "title": "Column positions differ between AR-08, AR-09 and ST-04",
                   "values": [{"value": m, "sheet": "AR-08/AR-09/ST-04", "pdfPage": 3} for m in mism],
                   "detail": "Columns are 0.20 m quads extracted from the vectors. A column missing on a sheet that covers its position is flagged. ST-04 is a level-2 beam plan, so some differences may be by design (e.g. columns that stop at L2) - needs structural confirmation."})
    issues.sort(key=lambda i: i["id"])
    for i in issues:
        if i["id"] in RESOLVED:
            d = next(x for x in DECISIONS if x["id"] == RESOLVED[i["id"]])
            i["resolution"] = {"decision": d["id"], "date": d["date"], "by": d["by"], "text": d["decision"]}
    bld = {
        "project": BUILDING["project"], "units": BUILDING["units"], "coordinateSystem": BUILDING["coordinateSystem"],
        "north": north(), "levels": levels(), "grids": grids(), "columns": cols,
        "doorTypes": BUILDING["doorTypes"], "windowTypes": BUILDING["windowTypes"],
        "issues": issues, "decisions": DECISIONS, "sheets": SHEETS,
    }
    out = ROOT / "src/data"
    (out / "geometry").mkdir(parents=True, exist_ok=True)
    for f in floors:
        (out / "geometry" / f'floor-{f["floorId"][1]}.json').write_text(json.dumps(f, indent=1, ensure_ascii=False))
    (out / "building.json").write_text(json.dumps(bld, indent=1, ensure_ascii=False))
    (ROOT / "docs/VERIFICATION_REPORT.md").write_text(report(floors, bld))
    for f in floors:
        print(f["floorId"], {k: len(f[k]) for k in ("walls", "openings", "rooms")},
              {s: sum(1 for k in ("walls", "openings", "rooms") for e in f[k] if e["status"] == s) for s in RANK})
    print("columns", {s: sum(1 for c in cols if c["status"] == s) for s in RANK}, "north", bld["north"]["northClockwiseFromSheetUpDeg"])


if __name__ == "__main__":
    main()
