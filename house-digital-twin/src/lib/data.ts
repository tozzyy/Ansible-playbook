import buildingJson from "@/data/building.json";
import floor1Json from "@/data/geometry/floor-1.json";
import floor2Json from "@/data/geometry/floor-2.json";
import type { Building, Floor, Issue, SheetInfo, VerificationStatus } from "@/types/geometry";

export const building = buildingJson as unknown as Building;
export const floors = [floor1Json, floor2Json] as unknown as Floor[];

export const floorById = (id: string) => floors.find((f) => f.floorId === id)!;
export const issueById = (id: string): Issue | undefined => building.issues.find((i) => i.id === id);
export const sheetByCode = (code: string): SheetInfo | undefined => building.sheets.sheets.find((s) => s.sheet === code);
export const openingType = (code: string) => [...building.doorTypes, ...building.windowTypes].find((t) => t.code === code);

/** Sheets that can be used as a calibrated 2D overlay background, and which floor geometry sits on them. */
export const OVERLAY_SHEETS: { sheet: string; floorId: string; label: string }[] = [
  { sheet: "AR-08", floorId: "F1", label: "AR-08 · First floor plan" },
  { sheet: "AR-09", floorId: "F2", label: "AR-09 · Second floor plan" },
  { sheet: "ST-04", floorId: "F2", label: "ST-04 · L2 beam plan (grid/column check)" },
];

export const STATUS_COLOR: Record<VerificationStatus, string> = {
  verified: "#16a34a",
  unverified: "#d97706",
  conflict: "#dc2626",
};

export function counts(items: readonly { status: VerificationStatus }[]) {
  const c = { verified: 0, unverified: 0, conflict: 0 };
  for (const i of items) c[i.status]++;
  return c;
}
