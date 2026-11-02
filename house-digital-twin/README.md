# House Digital Twin — Interactive 3D house from construction drawings

Web-based digital twin of an RC 2-storey residence, built **only** from the construction drawing set
`House-Phrae_Core+Infra_20p.pdf` (20-page extract of the 64/65-sheet set). It is the base for home
infrastructure planning (LAN, fibre, conduit, Wi-Fi AP, CCTV, network cabinet, electrical).

> **Status: Phase 1 approved (owner decisions DEC-01…04, 2026-11-02). Phase 2 3D model ready for review at `/3d`.**

## What is in Phase 1

| Deliverable | Where |
|---|---|
| Vector extraction from the PDF (walls, grids, columns) | `scripts/extract_pdf.py` → `data/raw/pdf-extract.json` |
| Hand-read inputs with a source for every value | `data/inputs/*.json` |
| Geometry JSON per floor | `src/data/geometry/floor-1.json`, `floor-2.json` |
| Building data (levels, grids, columns, door/window types, north, issues, sheet map) | `src/data/building.json` |
| 2D Verification Overlay (PDF sheet + geometry on the same scale, opacity controls) | `/verify` |
| Geometry Verification Report | `/report` and `docs/VERIFICATION_REPORT.md` |
| Source drawing mapping (sheet ↔ PDF page) | `data/inputs/sheets.json`, report §2 |

### How the geometry is produced (no invented layout)

1. **Calibration.** The plan sheets are true 1:125 on A3, so 1 m = 22.677 pt. The grid 1 → 5 dimension
   (16.00 m) measures 16.002 m and A → F (21.70 m) matches on AR-08, AR-09 and ST-04. The origin is grid 1 × grid A'.
2. **Walls** come from the wall hatch strokes (0.24 pt, 50 % grey, 45°). Each hatch run gives the brick-core
   rectangle, measured to about 1 cm. Finished thickness = core + 0.03 m of plaster (the plaster face lines measure 0.01–0.02 m on each side).
   Walls drawn without hatch are listed in `manualWalls` and are always **Unverified**.
3. **Grid lines and columns** (0.20 × 0.20 quads) are detected on AR-08, AR-09 and ST-04 and cross-checked.
4. **Openings** need a type tag read from the plan. Size and sill come from AR-26 / AR-27, never from the plan.
   The clear gap between the hatched jambs is measured; a mismatch over 0.15 m downgrades the size to **Unverified**.
5. **Rooms** use wall centre-lines and the room tags (F = floor level, C = ceiling height above the floor).
6. **Conflicts are never resolved.** The element is marked **Conflict** and its issue (`ISS-xx`) lists
   every value with its sheet and page.

## Owner decisions (2026-11-02)

| ID | Resolves | Decision |
|---|---|---|
| DEC-01 | ISS-32 | Door/window sizes = frame (วงกบ) sizes from AR-26 / AR-27 |
| DEC-02 | ISS-03 | First-floor ceiling = 2.80 m above floor (AR-08) |
| DEC-03 | ISS-02 | Ridge = +11.07 (AR-11) — used for the roof in Phase 4 |
| DEC-04 | ISS-29 | North derived from AR-07 confirmed (plan +Y ≈ NE) |

Decisions live in `data/inputs/building.json` → `decisions`. The build script applies them, and every resolved issue keeps its original values plus the decision text.

## Phase 2 — 3D viewer (`/3d`)

Built with React Three Fiber + drei, reading **only** `src/data/*.json`:

- **Walls:** each wall's elevation profile is extruded to the wall thickness. Doors are cut as notches and windows as holes, using the opening `offset`, `width`, `height` and `sillZ`.
- **Floors:** room slabs at the room-tag level (wet rooms +0.55 / +4.15, garage ±0.00). The carport roof slab sits at +3.70 (ST-04). Voids are drawn as dashed outlines.
- **Stairs (AR-28/29):** 2 × 9 treads of 0.25 m, 20 risers of 0.18 m, and the landing at +2.45 (ISS-07 is still open).
- **Columns:** 0.20 m columns drawn floor-to-floor; they are visual only, because column heights aren't dimensioned on the sheets.
- **Viewer UX** (adapted from a reference viewer):
  - critically-damped spring camera for presets and room focus;
  - presets: Iso / Top / Front (Elevation A) / Back / Left / Right / Reset;
  - optional auto-orbit after 8 s idle;
  - grid dimension chains that appear in top view;
  - room focus: other walls ghosted, width/length lines and an info card;
  - room pill bar for mobile; a compass driven by the confirmed north.
- **Controls:**
  - floor selector (all / F1 / F2) and exploded floors;
  - wall transparency;
  - colour by material or by verification status;
  - layer toggles;
  - click any element to see its sources and issues.

The roof (AR-10) and finish materials are Phase 4. Section and measure tools are Phase 3.

## Install & run

Requirements: Node.js ≥ 20, Python ≥ 3.10 with `pip install pymupdf` (only needed for the scripts).

```bash
cd house-digital-twin
npm install

# Render the drawing sheets used as overlay backgrounds (local only, git-ignored)
npm run sheets -- "/path/to/House-Phrae_Core+Infra_20p.pdf"

npm run dev        # http://localhost:3000
```

Rebuild the geometry after editing anything in `data/inputs/`:

```bash
npm run extract -- "/path/to/House-Phrae_Core+Infra_20p.pdf"   # only if the PDF changes
npm run geometry                                               # regenerates src/data/* and docs/VERIFICATION_REPORT.md
```

## Using the 2D Verification Overlay (`/verify`)

- **Left sidebar:** pick the sheet (AR-08 ↔ ground-floor geometry, AR-09 / ST-04 ↔ upper-floor geometry),
  PDF / geometry opacity, layers, status filter, and the Room Explorer (click a room to zoom to it).
- **Canvas:** mouse wheel = zoom, drag = pan, click = inspect. The bottom-left readout shows the cursor
  position in metres and its offset from the nearest grid line (e.g. `B+0.05`). Turn on **Measured hatch spans**
  to see exactly what was read from the PDF.
- **Right panel:** dimensions, levels, per-field status (position / size / tag, polygon / floor / ceiling),
  source sheet and PDF page, and the full text of any issue.

Colours: green = Verified, amber = Unverified, red = Conflict. A dashed room outline means the boundary
is not a drawn wall (open-plan space).

## Data model (excerpt)

```ts
type VerificationStatus = "verified" | "unverified" | "conflict";
type SourceRef = { sheet: string; pdfPage: number; note?: string };

type Wall = { id; floorId; axis: "h" | "v"; start: [x, y]; end: [x, y]; thickness; baseElevation; height;
              status; fieldStatus: { position; thickness; height }; hatchSpans; sources; issues; note };
type Opening = { id; floorId; wallId; kind: "door" | "window"; typeCode; offset; center; width; height;
                 sillHeight; measuredGap; status; fieldStatus: { position; size; tag }; sources; issues };
type Room = { id; floorId; name; nameEn; polygon; floorElevation; ceilingHeight; ceilingLevel; area;
              status; fieldStatus: { polygon; floor; ceiling }; sources; issues };
```

The full types are in `src/types/geometry.ts`. Geometry is plain JSON, separate from all rendering code. Phase 2 will
read the same files with React Three Fiber, and GLB/GLTF import can be added next to them.

## Security / privacy

The PDF title blocks contain personal data (owner, engineers, licence and phone numbers, site address).
This repository is **public**, so:

- the PDF and the rendered sheet PNGs are **git-ignored** (`*.pdf`, `public/sheets/*`) and are produced locally with `npm run sheets`;
- only numeric geometry and drawing references (sheet numbers, levels, sizes) are committed.

Consider making the repository private before adding infrastructure data (Phase 5: network cabinet,
CCTV positions, Wi-Fi APs). Those are security-sensitive for a private residence.

## Roadmap

| Phase | Scope | State |
|---|---|---|
| 1 | Floor-plan extraction, Geometry JSON, 2D overlay, verification report | ✅ approved |
| 2 | 3D floors, walls, doors, windows, stairs (Three.js / R3F) | ✅ ready for review |
| 3 | Camera presets, floor switching, room focus, layer visibility, section / measure tools | |
| 4 | Materials (finish codes once defined), lighting, roof (AR-10, AR-11/12 – ridge conflict) | |
| 5 | Infrastructure layers + EE-02…EE-05 device positions (no invented circuits) | |
