"use client";
import { create } from "zustand";
import type { Selection } from "@/types/geometry";

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
