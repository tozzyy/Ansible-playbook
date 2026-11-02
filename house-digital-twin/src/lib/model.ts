/**
 * Pure helpers that turn the verified Geometry JSON into 3D-ready descriptors.
 * No three.js here - rendering components consume these.
 * World axes (three.js): x = plan x, z = plan y (towards grid F), y = up (absolute level).
 */
import { building, floors } from "@/lib/data";
import type { Opening, Room, Wall } from "@/types/geometry";
import type { CamPreset } from "@/lib/viewerStore";

export const wallLength = (w: Wall) => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);

/** W4 is the arched entrance window (AR-27: R1.300, 2.60 wide). */
export const isArched = (o: Opening) => o.typeCode === "W4";

export type WallProfile = {
  /** closed outline in wall-local (u along wall from start, v up from wall base) */
  outline: [number, number][];
  /** window holes in wall-local coords: [u0, v0, u1, v1, archRadius] (archRadius 0 = rectangle) */
  holes: [number, number, number, number, number][];
};

/** Wall elevation profile: doors (sill at base) are cut as notches, windows as holes. */
export function wallProfile(w: Wall, openings: Opening[]): WallProfile {
  const L = wallLength(w);
  const H = w.height;
  const eps = 0.02;
  const notches: [number, number, number][] = [];
  const holes: [number, number, number, number, number][] = [];
  for (const o of openings) {
    const u0 = Math.max(o.offset, 0);
    const u1 = Math.min(o.offset + o.width, L);
    if (u1 - u0 < 0.05) continue;
    const v0 = o.sillZ - w.baseElevation;
    const v1 = Math.min(v0 + o.height, H - eps);
    if (v0 <= eps) notches.push([u0, u1, v1]);
    else if (v1 - v0 > 0.05) holes.push([Math.max(u0, eps), v0, Math.min(u1, L - eps), v1, isArched(o) ? (u1 - u0) / 2 : 0]);
  }
  notches.sort((a, b) => a[0] - b[0]);
  const outline: [number, number][] = [[0, 0]];
  for (const [u0, u1, top] of notches) {
    outline.push([u0, 0], [u0, top], [u1, top], [u1, 0]);
  }
  outline.push([L, 0], [L, H], [0, H]);
  // drop consecutive duplicates (notch touching wall ends)
  const clean = outline.filter((p, i) => i === 0 || Math.abs(p[0] - outline[i - 1][0]) > 1e-4 || Math.abs(p[1] - outline[i - 1][1]) > 1e-4);
  return { outline: clean, holes };
}

/** Wall placement: origin at wall start on its centre-line, rotation about Y so local +x runs along the wall. */
export function wallPlacement(w: Wall): { position: [number, number, number]; rotationY: number } {
  const t = w.thickness / 2;
  if (w.axis === "h") return { position: [w.start[0], w.baseElevation, w.start[1] - t], rotationY: 0 };
  return { position: [w.start[0] + t, w.baseElevation, w.start[1]], rotationY: -Math.PI / 2 };
}

/** Opening centre in world coords. */
export function openingCenter(o: Opening, w: Wall): [number, number, number] {
  const u = o.offset + o.width / 2;
  const y = o.sillZ + o.height / 2;
  return w.axis === "h" ? [w.start[0] + u, y, w.start[1]] : [w.start[0], y, w.start[1] + u];
}

export function roomBounds(r: Room) {
  const xs = r.polygon.map((p) => p[0]), ys = r.polygon.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

export function centroid(p: [number, number][]): [number, number] {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Stair steps as boxes [x0, x1, y0, y1, zTop] in plan coords + absolute top level. */
export function stairSteps() {
  const out: { id: string; x0: number; x1: number; y0: number; y1: number; zTop: number; zBottom: number }[] = [];
  for (const f of floors) {
    for (const s of f.stairs) {
      for (const fl of s.flights) {
        const n = fl.risers[1] - fl.risers[0]; // treads in flight
        const dir = fl.dir === "+y" ? 1 : -1;
        for (let i = 0; i < n; i++) {
          const a = fl.yStart + dir * i * s.tread, b = fl.yStart + dir * (i + 1) * s.tread;
          out.push({ id: `${fl.id}-${i + 1}`, x0: fl.x[0], x1: fl.x[1], y0: Math.min(a, b), y1: Math.max(a, b),
            zTop: fl.startZ + (i + 1) * s.riser, zBottom: fl.startZ - 0.15 });
        }
      }
    }
  }
  return out;
}

/** Building extents (plan) used by camera presets. */
export const EXTENTS = { x0: -0.2, x1: 17.2, y0: -0.2, y1: 26.8, zTop: 8.5 };
const C: [number, number, number] = [8.5, 2.5, 12.5];

export const PRESETS: Record<string, { label: string; preset: CamPreset }> = {
  home:      { label: "หน้าบ้าน",  preset: { theta: -0.45, phi: 1.32, radius: 34, target: [9, 3.2, 14] } },
  front:     { label: "ด้านหน้า",  preset: { theta: 0,     phi: 1.42, radius: 36, target: C } },
  side:      { label: "ด้านข้าง",  preset: { theta: -Math.PI / 2, phi: 1.32, radius: 34, target: C } },
  back:      { label: "ด้านหลัง",  preset: { theta: Math.PI, phi: 1.32, radius: 34, target: C } },
  top:       { label: "มุมบน",    preset: { theta: 0, phi: 0.001, radius: 40, target: [8.5, 0, 13] } },
  dollhouse: { label: "ภายใน",    preset: { theta: 0.35, phi: 0.75, radius: 32, target: [8.5, 0.65, 10] } },
};
export const HOME = PRESETS.home.preset;

export function roomPreset(r: Room): CamPreset {
  const b = roomBounds(r);
  const size = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  return { theta: Math.PI / 8, phi: 0.6, radius: size * 2.2 + 8, target: [(b.x0 + b.x1) / 2, r.floorElevation + 0.5, (b.y0 + b.y1) / 2] };
}

export const northPlan = building.north.planVector; // unit vector in plan coords

// ------------------------------------------------------------------ measurement snapping
export type SnapResult = { p: [number, number, number]; label: string | null };
type Cand = { p: [number, number, number]; label: string };
let _cands: Cand[] | null = null;

/** Snap targets built from the verified data, in world coords (x, level, plan y). */
export function snapCandidates(): Cand[] {
  if (_cands) return _cands;
  const c: Cand[] = [];
  const W = (x: number, z: number, y: number, label: string) => c.push({ p: [x, z, y], label });
  for (const f of floors) {
    for (const w of f.walls) {
      const t = w.thickness / 2;
      const z0 = w.baseElevation, z1 = w.baseElevation + w.height;
      for (const [x, y] of [w.start, w.end]) {
        for (const z of [z0, z1]) {
          W(x, z, y, `ปลายผนัง ${w.id} (แนวศูนย์กลาง)`);
          if (w.axis === "h") { W(x, z, y - t, `มุมผิวผนัง ${w.id}`); W(x, z, y + t, `มุมผิวผนัง ${w.id}`); }
          else { W(x - t, z, y, `มุมผิวผนัง ${w.id}`); W(x + t, z, y, `มุมผิวผนัง ${w.id}`); }
        }
      }
    }
    const wallById = new Map(f.walls.map((w) => [w.id, w]));
    for (const o of f.openings) {
      const w = wallById.get(o.wallId)!;
      for (const u of [o.offset, o.offset + o.width]) {
        for (const z of [o.sillZ, o.sillZ + o.height]) {
          const [x, y] = w.axis === "h" ? [w.start[0] + u, w.start[1]] : [w.start[0], w.start[1] + u];
          W(x, z, y, `ขอบช่อง ${o.typeCode} ${o.id}`);
        }
      }
    }
    for (const r of f.rooms) for (const [x, y] of r.polygon) W(x, r.floorElevation, y, `มุมห้อง ${r.name}`);
  }
  for (const col of building.columns) {
    for (const z of [0, 0.65, 4.25]) {
      W(col.x, z, col.y, `ศูนย์กลางเสา ${col.id}`);
      for (const [dx, dy] of [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]]) W(col.x + dx, z, col.y + dy, `มุมเสา ${col.id}`);
    }
  }
  for (const gx of building.grids.x) for (const gy of building.grids.y) for (const z of [0, 0.65, 4.25]) W(gx.pos, z, gy.pos, `Grid ${gx.name}/${gy.name}`);
  _cands = c;
  return c;
}

export const SNAP_RADIUS = 0.2;

export type Ray = { origin: [number, number, number]; dir: [number, number, number] };
/** max angle between the click ray and a snap target (radians, ~0.7 deg) */
export const SNAP_ANGLE = 0.012;

/**
 * Snap a clicked point to verified geometry: first within SNAP_RADIUS of the surface hit,
 * otherwise the target closest to the click ray (screen-space style), so edge clicks still snap.
 */
export function snapPoint(p: [number, number, number], ray?: Ray): SnapResult {
  let best: Cand | null = null, bd = SNAP_RADIUS;
  for (const c of snapCandidates()) {
    const d = Math.hypot(c.p[0] - p[0], c.p[1] - p[1], c.p[2] - p[2]);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best && ray) {
    const [ox, oy, oz] = ray.origin, [dx, dy, dz] = ray.dir;
    let ba = SNAP_ANGLE;
    for (const c of snapCandidates()) {
      const vx = c.p[0] - ox, vy = c.p[1] - oy, vz = c.p[2] - oz;
      const t = vx * dx + vy * dy + vz * dz;
      if (t <= 0) continue;
      const px = vx - t * dx, py = vy - t * dy, pz = vz - t * dz;
      const a = Math.hypot(px, py, pz) / t;
      if (a < ba) { ba = a; best = c; }
    }
  }
  return best ? { p: best.p, label: best.label } : { p, label: null };
}

/** Plane helpers for the section tool (world coords). */
export const floorLevel = (floorId: "F1" | "F2") => (floorId === "F2" ? 4.25 : 0.65);

// ------------------------------------------------------------------ roof
export type RoofFace = { pts: [number, number, number][]; gable: boolean; eaveAlong: [number, number, number]; eave: number };

/**
 * Hip roof over a plan rectangle. Ridge along `ridgeAxis`; each end is hipped (true) or a vertical gable (false).
 * Returns faces in world coords [x, z(level), planY].
 */
export function hipRoof(rect: [number, number, number, number], eave: number, ridge: number, ridgeAxis: "x" | "y", hip: [boolean, boolean]): RoofFace[] {
  const [x0, y0, x1, y1] = rect;
  const [u0, u1, v0, v1] = ridgeAxis === "x" ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
  const h = (v1 - v0) / 2, vm = (v0 + v1) / 2;
  const r0 = u0 + (hip[0] ? h : 0), r1 = u1 - (hip[1] ? h : 0);
  const P = (u: number, v: number, z: number): [number, number, number] => (ridgeAxis === "x" ? [u, z, v] : [v, z, u]);
  const U: [number, number, number] = ridgeAxis === "x" ? [1, 0, 0] : [0, 0, 1];
  const V: [number, number, number] = ridgeAxis === "x" ? [0, 0, 1] : [1, 0, 0];
  return [
    { pts: [P(u0, v0, eave), P(u1, v0, eave), P(r1, vm, ridge), P(r0, vm, ridge)], gable: false, eaveAlong: U, eave },
    { pts: [P(u1, v1, eave), P(u0, v1, eave), P(r0, vm, ridge), P(r1, vm, ridge)], gable: false, eaveAlong: U, eave },
    { pts: [P(u0, v1, eave), P(u0, v0, eave), P(r0, vm, ridge)], gable: !hip[0], eaveAlong: V, eave },
    { pts: [P(u1, v0, eave), P(u1, v1, eave), P(r1, vm, ridge)], gable: !hip[1], eaveAlong: V, eave },
  ];
}
