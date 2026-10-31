"use client";
import { create } from "zustand";
import type { Selection, VerificationStatus } from "@/types/geometry";

export type LayerKey =
  | "pdf"
  | "grid"
  | "walls"
  | "hatch"
  | "columns"
  | "rooms"
  | "openings"
  | "stairs"
  | "areas"
  | "labels";

export const LAYER_LABELS: Record<LayerKey, string> = {
  pdf: "PDF sheet (background)",
  grid: "Grid lines",
  walls: "Walls (centre-line + thickness)",
  hatch: "Measured hatch spans",
  columns: "Columns",
  rooms: "Rooms",
  openings: "Doors & windows",
  stairs: "Stairs",
  areas: "Voids / slabs / unassigned",
  labels: "Labels",
};

type State = {
  sheet: string;
  layers: Record<LayerKey, boolean>;
  pdfOpacity: number;
  geomOpacity: number;
  statusFilter: Record<VerificationStatus, boolean>;
  selection: Selection;
  hover: [number, number] | null;
  /** metre rect the canvas should zoom to (bumped counter forces re-focus) */
  focus: { rect: [number, number, number, number]; n: number } | null;
  setSheet: (s: string) => void;
  toggleLayer: (k: LayerKey) => void;
  setPdfOpacity: (v: number) => void;
  setGeomOpacity: (v: number) => void;
  toggleStatus: (s: VerificationStatus) => void;
  select: (s: Selection) => void;
  setHover: (p: [number, number] | null) => void;
  focusOn: (rect: [number, number, number, number] | null) => void;
};

export const useVerifyStore = create<State>((set) => ({
  sheet: "AR-08",
  layers: { pdf: true, grid: true, walls: true, hatch: false, columns: true, rooms: true, openings: true, stairs: true, areas: true, labels: true },
  pdfOpacity: 0.85,
  geomOpacity: 0.75,
  statusFilter: { verified: true, unverified: true, conflict: true },
  selection: null,
  hover: null,
  focus: null,
  setSheet: (sheet) => set({ sheet, selection: null }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setPdfOpacity: (pdfOpacity) => set({ pdfOpacity }),
  setGeomOpacity: (geomOpacity) => set({ geomOpacity }),
  toggleStatus: (st) => set((s) => ({ statusFilter: { ...s.statusFilter, [st]: !s.statusFilter[st] } })),
  select: (selection) => set({ selection }),
  setHover: (hover) => set({ hover }),
  focusOn: (rect) => set((s) => ({ focus: rect ? { rect, n: (s.focus?.n ?? 0) + 1 } : null })),
}));
