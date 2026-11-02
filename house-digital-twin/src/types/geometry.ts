/**
 * Building geometry data model.
 * Units: metres. Origin = grid 1 x grid A'. +X along numeric grids, +Y towards grid F
 * (down on AR-08). Z = absolute level (±0.00 project datum).
 *
 * Geometry is data only - produced by scripts/build_geometry.py from the PDF.
 * Rendering code (2D overlay now, Three.js in Phase 2) must never alter it.
 */

export type VerificationStatus = "verified" | "unverified" | "conflict";

export type SourceRef = {
  sheet: string; // e.g. "AR-08"
  pdfPage: number; // page inside House-Phrae_Core+Infra_20p.pdf
  note?: string;
};

export type Vec2 = [number, number];

export type Wall = {
  id: string;
  floorId: string;
  axis: "h" | "v";
  start: Vec2;
  end: Vec2;
  thickness: number;
  baseElevation: number;
  height: number;
  status: VerificationStatus;
  fieldStatus: { position: VerificationStatus; thickness: VerificationStatus; height: VerificationStatus };
  /** Hatched (brick-core) spans measured from the PDF along the wall axis. Empty = wall drawn without hatch. */
  hatchSpans: Vec2[];
  sources: SourceRef[];
  issues: string[];
  note: string;
};

export type Opening = {
  id: string;
  floorId: string;
  wallId: string;
  kind: "door" | "window";
  typeCode: string; // AR-26 / AR-27 type code
  offset: number; // from wall start to opening edge (m)
  center: number; // along-wall coordinate of the centre (m)
  width: number;
  height: number;
  sillHeight?: number;
  /** absolute level of the opening bottom (m) */
  sillZ: number;
  status: VerificationStatus;
  fieldStatus: { position: VerificationStatus; size: VerificationStatus; tag: VerificationStatus };
  measuredGap: number | null;
  sources: SourceRef[];
  issues: string[];
  note: string;
};

export type Room = {
  id: string;
  floorId: string;
  name: string;
  nameEn: string;
  polygon: Vec2[];
  floorElevation: number;
  ceilingHeight?: number | null; // relative to room floor (room-tag "C")
  ceilingLevel?: number | null; // absolute
  finish: { floor: string | null; ceiling: string | null; status: VerificationStatus; issues: string[] };
  area: number;
  bbox: { x: number; y: number };
  areaBasis: string;
  status: VerificationStatus;
  fieldStatus: { polygon: VerificationStatus; floor: VerificationStatus; ceiling: VerificationStatus };
  sources: SourceRef[];
  issues: string[];
  /** owner decisions applied to this room (e.g. DEC-02) */
  decisions: string[];
  note: string;
};

export type StairFlight = {
  id: string;
  risers: [number, number];
  x: Vec2;
  yStart: number;
  yEnd: number;
  dir: "+y" | "-y";
  startZ: number;
};

export type Stair = {
  id: string;
  name: string;
  fromLevel: number;
  toLevel: number;
  bbox: [number, number, number, number];
  risers: number;
  riser: number;
  tread: number;
  flights: StairFlight[];
  landing: { rect: [number, number, number, number]; z: number; labelValue: string; status: VerificationStatus; issues: string[] };
  status: VerificationStatus;
  sources: SourceRef[];
};

export type Area2D = {
  id: string;
  name: string;
  rect?: [number, number, number, number];
  polygon?: Vec2[];
  z?: number;
  status: VerificationStatus;
  sources: SourceRef[];
  note?: string;
};

export type Floor = {
  floorId: string;
  name: string;
  level: number;
  sheet: string;
  pdfPage: number;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  stairs: Stair[];
  voids: Area2D[];
  slabs: Area2D[];
  unassigned: { rect: [number, number, number, number]; note: string }[];
};

export type GridLine = {
  name: string;
  pos: number;
  aliases?: string[];
  issues?: string[];
  detectedOn: Record<string, boolean>;
  status: VerificationStatus;
  sources: SourceRef[];
};

export type Column = {
  id: string;
  x: number;
  y: number;
  size: Vec2;
  grid: string | null;
  shownOn: Record<string, boolean>;
  status: VerificationStatus;
  sources: SourceRef[];
  issues: string[];
};

export type Level = {
  id: string;
  name: string;
  z: number | null;
  status: VerificationStatus;
  values?: { z: number; sheet: string; pdfPage: number }[];
  sources: SourceRef[];
  issues?: string[];
};

export type OpeningType = {
  code: string;
  kind: "door" | "window";
  description: string;
  location: string;
  qty: number | null;
  tableSize: string | null;
  width: number;
  height: number;
  sill: number;
  sillDatum?: string;
  leafWidth?: number;
  status: VerificationStatus;
  issues?: string[];
  note?: string;
  sources: SourceRef[];
};

export type Issue = {
  id: string;
  type: "conflict" | "unverified" | "info";
  title: string;
  detail?: string;
  values?: { value: string; sheet: string; pdfPage: number }[];
  sources?: SourceRef[];
  resolution?: { decision: string; date: string; by: string; text: string };
};

export type Decision = { id: string; date: string; by: string; resolves: string[]; decision: string; effect: string };

export type SheetInfo = {
  sheet: string;
  pdfPage: number;
  title: string;
  scale: string | null;
  phase: number;
  note?: string;
  calibration?: { originPt: Vec2; ptPerMetre: number; method: string };
};

export type Building = {
  project: string;
  units: string;
  coordinateSystem: Record<string, string>;
  north: {
    status: VerificationStatus;
    note: string;
    planVector: Vec2;
    northClockwiseFromSheetUpDeg: number;
    planPlusYBearingDeg: number;
    sources: SourceRef[];
  };
  levels: Level[];
  grids: { x: GridLine[]; y: GridLine[] };
  columns: Column[];
  doorTypes: OpeningType[];
  windowTypes: OpeningType[];
  issues: Issue[];
  decisions: Decision[];
  sheets: { pdfFile: string; note: string; pageSizePt: Vec2; ptPerMetre1to125: number; sheets: SheetInfo[] };
};

/** Selection target used by the UI. */
export type Selection =
  | { kind: "room"; id: string }
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "column"; id: string }
  | { kind: "stair"; id: string }
  | { kind: "grid"; id: string }
  | { kind: "area"; id: string }
  | null;
