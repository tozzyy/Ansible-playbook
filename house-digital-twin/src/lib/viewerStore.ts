"use client";
import { create } from "zustand";
import type { Selection } from "@/types/geometry";
import { HOME, snapPoint, type Ray, type SnapResult } from "@/lib/model";

export type FloorMode = "all" | "F1" | "F2";
/** exterior = whole house; interior = dollhouse (walls cut above the selected floor, roof hidden) */
export type ViewMode = "exterior" | "interior";
export type Tool = "orbit" | "measure";
export type ViewToggle = "roof" | "furniture" | "labels";

export const TOGGLE_LABELS: Record<ViewToggle, string> = {
  roof: "หลังคา",
  furniture: "เฟอร์นิเจอร์",
  labels: "ชื่อห้อง",
};

/** Camera preset in spherical coords around a target (metres, three.js world: x = plan x, z = plan y, y = up). */
export type CamPreset = { theta: number; phi: number; radius: number; target: [number, number, number] };
export type MeasureState = { a: SnapResult | null; b: SnapResult | null };

/** Dollhouse cut height above the floor being viewed (m). */
export const DOLLHOUSE_CUT = 2.2;

type State = {
  floorMode: FloorMode;
  viewMode: ViewMode;
  show: Record<ViewToggle, boolean>;
  selection: Selection;
  focusRoomId: string | null;
  camRequest: { preset: CamPreset; n: number } | null;
  tool: Tool;
  measure: MeasureState;
  setFloorMode: (m: FloorMode) => void;
  setViewMode: (m: ViewMode) => void;
  toggle: (k: ViewToggle) => void;
  select: (s: Selection) => void;
  setFocusRoom: (id: string | null) => void;
  requestCamera: (p: CamPreset) => void;
  setTool: (t: Tool) => void;
  addMeasurePoint: (p: [number, number, number], ray?: Ray) => void;
  clearMeasure: () => void;
  resetView: () => void;
};

export const useViewerStore = create<State>((set) => ({
  floorMode: "all",
  viewMode: "exterior",
  show: { roof: true, furniture: true, labels: true },
  selection: null,
  focusRoomId: null,
  camRequest: null,
  tool: "orbit",
  measure: { a: null, b: null },
  setFloorMode: (floorMode) => set({ floorMode, focusRoomId: null }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggle: (k) => set((s) => ({ show: { ...s.show, [k]: !s.show[k] } })),
  select: (selection) => set({ selection }),
  setFocusRoom: (focusRoomId) => set({ focusRoomId }),
  requestCamera: (preset) => set((s) => ({ camRequest: { preset, n: (s.camRequest?.n ?? 0) + 1 } })),
  setTool: (tool) => set({ tool, measure: { a: null, b: null } }),
  addMeasurePoint: (p, ray) => set((s) => {
    const hit = snapPoint(p, ray);
    if (!s.measure.a || s.measure.b) return { measure: { a: hit, b: null } };
    return { measure: { a: s.measure.a, b: hit } };
  }),
  clearMeasure: () => set({ measure: { a: null, b: null } }),
  resetView: () => set((s) => ({
    focusRoomId: null, selection: null, viewMode: "exterior", floorMode: "all", measure: { a: null, b: null }, tool: "orbit",
    camRequest: { preset: HOME, n: (s.camRequest?.n ?? 0) + 1 },
  })),
}));
