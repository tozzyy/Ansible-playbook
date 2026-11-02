"use client";
import { create } from "zustand";
import type { Selection } from "@/types/geometry";
import { HOME, sectionLine, snapPoint, type Ray, type SnapResult } from "@/lib/model";

export type FloorMode = "all" | "F1" | "F2";
export type ColorMode = "materials" | "status";
export type ViewLayer = "floors" | "walls" | "openings" | "stairs" | "columns" | "slabs" | "grid" | "labels" | "dims";

export const VIEW_LAYER_LABELS: Record<ViewLayer, string> = {
  floors: "พื้นห้อง (Floors)",
  walls: "ผนัง (Walls)",
  openings: "ประตู / หน้าต่าง",
  stairs: "บันได (Stairs)",
  columns: "เสา (Columns)",
  slabs: "พื้นหลังคาโรงจอดรถ / void",
  grid: "เส้น Grid",
  labels: "ชื่อห้อง (Labels)",
  dims: "เส้นบอกระยะ (มุมบน)",
};

/** Camera preset in spherical coords around a target (metres, three.js world: x = plan x, z = plan y, y = up). */
export type CamPreset = { theta: number; phi: number; radius: number; target: [number, number, number] };

export type Tool = "orbit" | "measure";
/** plan = horizontal cut at `pos` m above the active floor; A-A / B-B = cut lines from AR-08; x / y = free vertical planes at `pos` */
export type SectionMode = "off" | "plan" | "A-A" | "B-B" | "x" | "y";
export type SectionState = { mode: SectionMode; pos: number; flip: boolean };
export type MeasureState = { a: SnapResult | null; b: SnapResult | null };

type State = {
  floorMode: FloorMode;
  layers: Record<ViewLayer, boolean>;
  wallOpacity: number;
  explode: number; // metres of extra lift for the upper floor
  colorMode: ColorMode;
  autoOrbit: boolean;
  selection: Selection;
  focusRoomId: string | null;
  camRequest: { preset: CamPreset; n: number } | null;
  tool: Tool;
  section: SectionState;
  measure: MeasureState;
  setTool: (t: Tool) => void;
  setSection: (s: Partial<SectionState>) => void;
  addMeasurePoint: (p: [number, number, number], ray?: Ray) => void;
  clearMeasure: () => void;
  resetView: () => void;
  setFloorMode: (m: FloorMode) => void;
  toggleLayer: (k: ViewLayer) => void;
  setWallOpacity: (v: number) => void;
  setExplode: (v: number) => void;
  setColorMode: (m: ColorMode) => void;
  setAutoOrbit: (v: boolean) => void;
  select: (s: Selection) => void;
  setFocusRoom: (id: string | null) => void;
  requestCamera: (p: CamPreset) => void;
};

export const useViewerStore = create<State>((set) => ({
  floorMode: "all",
  layers: { floors: true, walls: true, openings: true, stairs: true, columns: true, slabs: true, grid: true, labels: true, dims: true },
  wallOpacity: 1,
  explode: 0,
  colorMode: "materials",
  autoOrbit: false,
  selection: null,
  focusRoomId: null,
  camRequest: null,
  tool: "orbit",
  section: { mode: "off", pos: 1.2, flip: false },
  measure: { a: null, b: null },
  // measuring uses real coordinates, so the exploded offset is removed while the tool is on
  setTool: (tool) => set((s) => ({ tool, explode: tool === "measure" ? 0 : s.explode, measure: { a: null, b: null } })),
  setSection: (p) => set((s) => ({ section: { ...s.section, ...p } })),
  addMeasurePoint: (p, ray) => set((s) => {
    const hit = snapPoint(p, ray);
    if (!s.measure.a || s.measure.b) return { measure: { a: hit, b: null } };
    return { measure: { a: s.measure.a, b: hit } };
  }),
  clearMeasure: () => set({ measure: { a: null, b: null } }),
  resetView: () => set((s) => ({
    focusRoomId: null, selection: null, section: { ...s.section, mode: "off" }, measure: { a: null, b: null }, tool: "orbit",
    camRequest: { preset: HOME, n: (s.camRequest?.n ?? 0) + 1 },
  })),
  setFloorMode: (floorMode) => set({ floorMode, focusRoomId: null }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setWallOpacity: (wallOpacity) => set({ wallOpacity }),
  setExplode: (explode) => set({ explode }),
  setColorMode: (colorMode) => set({ colorMode }),
  setAutoOrbit: (autoOrbit) => set({ autoOrbit }),
  select: (selection) => set({ selection }),
  setFocusRoom: (focusRoomId) => set({ focusRoomId }),
  requestCamera: (preset) => set((s) => ({ camRequest: { preset, n: (s.camRequest?.n ?? 0) + 1 } })),
}));

/** Camera that looks at a vertical cut the same way the section sheet is drawn (AR-11: grid 1 left; AR-12: grid D left). */
export function applySection(mode: SectionMode) {
  const s = useViewerStore.getState();
  if (mode === "A-A" || mode === "B-B") {
    const l = sectionLine(mode);
    s.setSection({ mode, flip: false });
    s.requestCamera(l.axis === "y"
      ? { theta: 0, phi: 1.45, radius: 30, target: [8.5, 3.6, l.pos] }
      : { theta: Math.PI / 2, phi: 1.45, radius: 30, target: [l.pos, 3.6, 11] });
  } else if (mode === "plan") {
    s.setSection({ mode, pos: 1.2, flip: false });
    s.requestCamera({ theta: 0.35, phi: 0.55, radius: 34, target: [8.5, 0.65, 12] });
  } else if (mode === "x") s.setSection({ mode, pos: 7.0 });
  else if (mode === "y") s.setSection({ mode, pos: 11.0 });
  else s.setSection({ mode });
}

