/**
 * Pure helpers that turn the verified Geometry JSON into 3D-ready descriptors.
 * No three.js here - rendering components consume these.
 * World axes (three.js): x = plan x, z = plan y (towards grid F), y = up (absolute level).
 */
import { building, floors } from "@/lib/data";
import type { Opening, Room, Wall } from "@/types/geometry";
import type { CamPreset } from "@/lib/viewerStore";

export const wallLength = (w: Wall) => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);

export type WallProfile = {
  /** closed outline in wall-local (u along wall from start, v up from wall base) */
  outline: [number, number][];
  /** rectangular holes (windows) in wall-local coords: [u0, v0, u1, v1] */
  holes: [number, number, number, number][];
};

/** Wall elevation profile: doors (sill at base) are cut as notches, windows as holes. */
export function wallProfile(w: Wall, openings: Opening[]): WallProfile {
  const L = wallLength(w);
  const H = w.height;
  const eps = 0.02;
  const notches: [number, number, number][] = [];
  const holes: [number, number, number, number][] = [];
  for (const o of openings) {
    const u0 = Math.max(o.offset, 0);
    const u1 = Math.min(o.offset + o.width, L);
    if (u1 - u0 < 0.05) continue;
    const v0 = o.sillZ - w.baseElevation;
    const v1 = Math.min(v0 + o.height, H - eps);
    if (v0 <= eps) notches.push([u0, u1, v1]);
    else if (v1 - v0 > 0.05) holes.push([Math.max(u0, eps), v0, Math.min(u1, L - eps), v1]);
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
  iso:   { label: "ไอโซ (Iso)",    preset: { theta: Math.PI / 4,      phi: 0.95, radius: 38, target: C } },
  top:   { label: "มุมบน (Top)",   preset: { theta: 0,                phi: 0.001, radius: 40, target: [8.5, 0, 13] } },
  front: { label: "ด้านหน้า (A)",  preset: { theta: 0,                phi: 1.35, radius: 34, target: C } },
  back:  { label: "ด้านหลัง",      preset: { theta: Math.PI,          phi: 1.35, radius: 34, target: C } },
  left:  { label: "ด้านซ้าย",       preset: { theta: -Math.PI / 2,     phi: 1.35, radius: 34, target: C } },
  right: { label: "ด้านขวา",       preset: { theta: Math.PI / 2,      phi: 1.35, radius: 34, target: C } },
};
export const HOME = PRESETS.iso.preset;

export function roomPreset(r: Room): CamPreset {
  const b = roomBounds(r);
  const size = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  return { theta: Math.PI / 8, phi: 0.6, radius: size * 2.2 + 8, target: [(b.x0 + b.x1) / 2, r.floorElevation + 0.5, (b.y0 + b.y1) / 2] };
}

export const northPlan = building.north.planVector; // unit vector in plan coords
