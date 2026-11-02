"use client";
/**
 * Phase 2 - 3D model generated only from src/data (verified Geometry JSON).
 * World: x = plan x, z = plan y (towards grid F), y = absolute level.
 */
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { building, floors } from "@/lib/data";
import { centroid, openingCenter, roomBounds, stairSteps, wallLength, wallPlacement, wallProfile } from "@/lib/model";
import { useViewerStore } from "@/lib/viewerStore";
import type { Floor, Opening, Room, Selection, VerificationStatus, Wall } from "@/types/geometry";

// ------------------------------------------------------------------ materials
const STATUS_3D: Record<VerificationStatus, string> = { verified: "#4ade80", unverified: "#fbbf24", conflict: "#f87171" };
const SEL = "#3b82f6";
const MAT = {
  wall: "#f4f1ea",
  floorDry: "#e7ddcb",
  floorWet: "#cfdde3",
  floorGarage: "#c9c4b8",
  slab: "#b9bec6",
  stair: "#d6cfc2",
  door: "#8a6a4a",
  frame: "#2b2f36",
  glass: "#8fd3f0",
  column: "#d6d3d1",
  unassigned: "#d4d4d8",
};
const cache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, opacity = 1, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = `${color}|${opacity.toFixed(2)}|${JSON.stringify(extra)}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, ...extra });
    cache.set(key, m);
  }
  return m;
}
const isSel = (sel: Selection, kind: string, id: string) => !!sel && sel.kind === kind && sel.id === id;

function useClick(kind: string, id: string) {
  const select = useViewerStore((s) => s.select);
  return (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return; // it was a drag (orbit), not a click
    e.stopPropagation();
    select({ kind, id } as Selection);
  };
}

// ------------------------------------------------------------------ walls & openings
function WallMesh({ w, openings, ghost }: { w: Wall; openings: Opening[]; ghost: boolean }) {
  const { colorMode, wallOpacity, selection } = useViewerStore();
  const geom = useMemo(() => {
    const p = wallProfile(w, openings);
    const shape = new THREE.Shape(p.outline.map(([u, v]) => new THREE.Vector2(u, v)));
    for (const [u0, v0, u1, v1] of p.holes) {
      shape.holes.push(new THREE.Path([new THREE.Vector2(u0, v0), new THREE.Vector2(u1, v0), new THREE.Vector2(u1, v1), new THREE.Vector2(u0, v1)]));
    }
    return new THREE.ExtrudeGeometry(shape, { depth: w.thickness, bevelEnabled: false });
  }, [w, openings]);
  const { position, rotationY } = wallPlacement(w);
  const color = isSel(selection, "wall", w.id) ? SEL : colorMode === "status" ? STATUS_3D[w.status] : MAT.wall;
  const opacity = ghost ? Math.min(wallOpacity, 0.12) : wallOpacity;
  return (
    <mesh geometry={geom} position={position} rotation={[0, rotationY, 0]} material={mat(color, opacity)} castShadow={opacity > 0.5} receiveShadow onClick={useClick("wall", w.id)} />
  );
}

function OpeningMesh({ o, w, ghost }: { o: Opening; w: Wall; ghost: boolean }) {
  const { colorMode, selection } = useViewerStore();
  const onClick = useClick("opening", o.id);
  const [x, y, z] = openingCenter(o, w);
  const rotY = w.axis === "h" ? 0 : Math.PI / 2;
  const sel = isSel(selection, "opening", o.id);
  const status = colorMode === "status";
  const f = 0.05; // frame member
  const W = o.width, H = o.height;
  const frameColor = sel ? SEL : status ? STATUS_3D[o.status] : MAT.frame;
  const op = ghost ? 0.15 : 1;
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]} onClick={onClick}>
      {o.kind === "window" ? (
        <mesh material={mat(status ? STATUS_3D[o.status] : MAT.glass, ghost ? 0.1 : 0.4, { roughness: 0.1, metalness: 0.2 })}>
          <boxGeometry args={[W - 2 * f, H - 2 * f, 0.02]} />
        </mesh>
      ) : (
        <mesh material={mat(sel ? SEL : status ? STATUS_3D[o.status] : o.typeCode === "GL1" ? MAT.glass : MAT.door, o.typeCode === "GL1" ? 0.45 * op + 0.05 : op)}>
          <boxGeometry args={[W - 2 * f, H - f, 0.04]} />
        </mesh>
      )}
      {/* frame */}
      <mesh position={[0, H / 2 - f / 2, 0]} material={mat(frameColor, op)}><boxGeometry args={[W, f, w.thickness + 0.02]} /></mesh>
      {o.kind === "window" && <mesh position={[0, -H / 2 + f / 2, 0]} material={mat(frameColor, op)}><boxGeometry args={[W, f, w.thickness + 0.02]} /></mesh>}
      <mesh position={[-W / 2 + f / 2, 0, 0]} material={mat(frameColor, op)}><boxGeometry args={[f, H, w.thickness + 0.02]} /></mesh>
      <mesh position={[W / 2 - f / 2, 0, 0]} material={mat(frameColor, op)}><boxGeometry args={[f, H, w.thickness + 0.02]} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------------ floors (room slabs)
function slabGeometry(poly: [number, number][], thickness = 0.12) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, -y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // (x,-y,0) -> (x,0,y), extrusion goes up
  return g;
}

function RoomSlab({ r, dim }: { r: Room; dim: boolean }) {
  const { colorMode, selection, setFocusRoom } = useViewerStore();
  const onClick = useClick("room", r.id);
  const geom = useMemo(() => slabGeometry(r.polygon), [r]);
  const base = r.finish.floor === "F2" ? MAT.floorWet : r.finish.floor === "FA1" || r.floorElevation === 0 ? MAT.floorGarage : MAT.floorDry;
  const color = isSel(selection, "room", r.id) ? SEL : colorMode === "status" ? STATUS_3D[r.status] : base;
  return (
    <mesh geometry={geom} position={[0, r.floorElevation - 0.12, 0]} material={mat(color, dim ? 0.35 : 1)} receiveShadow onClick={onClick}
      onDoubleClick={(e) => { e.stopPropagation(); setFocusRoom(r.id); }} />
  );
}

function RoomLabel({ r, lift, show }: { r: Room; lift: number; show: boolean }) {
  const [cx, cy] = centroid(r.polygon);
  const dot = STATUS_3D[r.status];
  return (
    <Html position={[cx, r.floorElevation + 1.3 + lift, cy]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none", display: show ? "block" : "none" }}>
      <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-white shadow backdrop-blur-sm">
        <span className="inline-block size-2 rounded-full" style={{ background: dot }} />
        {r.name}
      </div>
    </Html>
  );
}

// ------------------------------------------------------------------ floor group
function FloorGroup({ floor, lift, visible, labels }: { floor: Floor; lift: number; visible: boolean; labels: boolean }) {
  const { layers, focusRoomId } = useViewerStore();
  const focusRoom = floors.flatMap((f) => f.rooms).find((r) => r.id === focusRoomId);
  const focusB = focusRoom ? roomBounds(focusRoom) : null;
  const inFocus = (x: number, y: number) =>
    !focusB || (x >= focusB.x0 - 0.2 && x <= focusB.x1 + 0.2 && y >= focusB.y0 - 0.2 && y <= focusB.y1 + 0.2);
  const ghostWall = (w: Wall) => !!focusB && !(inFocus(w.start[0], w.start[1]) && inFocus(w.end[0], w.end[1]));
  const byWall = useMemo(() => {
    const m = new Map<string, Opening[]>();
    floor.openings.forEach((o) => m.set(o.wallId, [...(m.get(o.wallId) ?? []), o]));
    return m;
  }, [floor]);
  const wallById = useMemo(() => new Map(floor.walls.map((w) => [w.id, w])), [floor]);

  return (
    <group position={[0, lift, 0]} visible={visible}>
      {layers.floors && floor.rooms.map((r) => <RoomSlab key={r.id} r={r} dim={!!focusRoom && focusRoom.id !== r.id} />)}
      {layers.floors && floor.unassigned.map((u, i) => (
        <mesh key={i} geometry={slabGeometry([[u.rect[0], u.rect[1]], [u.rect[2], u.rect[1]], [u.rect[2], u.rect[3]], [u.rect[0], u.rect[3]]])}
          position={[0, floor.level - 0.12, 0]} material={mat(MAT.unassigned, 0.8)} receiveShadow />
      ))}
      {layers.walls && floor.walls.filter((w) => wallLength(w) > 0.05).map((w) => (
        <WallMesh key={w.id} w={w} openings={layers.openings ? byWall.get(w.id) ?? [] : []} ghost={ghostWall(w)} />
      ))}
      {layers.openings && layers.walls && floor.openings.map((o) => {
        const w = wallById.get(o.wallId)!;
        return <OpeningMesh key={o.id} o={o} w={w} ghost={ghostWall(w)} />;
      })}
      {floor.rooms.map((r) => (
        <RoomLabel key={r.id} r={r} lift={0} show={layers.labels && visible && labels && (!focusRoom || r.id === focusRoom.id)} />
      ))}
      {layers.slabs && floor.voids.map((v) => {
        const [a, b, c, d] = v.rect!;
        return (
          <Line key={v.id} points={[[a, floor.level + 0.02, b], [c, floor.level + 0.02, b], [c, floor.level + 0.02, d], [a, floor.level + 0.02, d], [a, floor.level + 0.02, b]]}
            color="#0ea5e9" lineWidth={1.5} dashed dashSize={0.3} gapSize={0.2} />
        );
      })}
    </group>
  );
}

// ------------------------------------------------------------------ stairs, columns, slabs
function Stairs({ lift }: { lift: number }) {
  const { colorMode, selection } = useViewerStore();
  const stair = floors.flatMap((f) => f.stairs)[0];
  const onClick = useClick("stair", stair?.id ?? "");
  const steps = useMemo(() => stairSteps(), []);
  if (!stair) return null;
  const sel = isSel(selection, "stair", stair.id);
  const color = sel ? SEL : colorMode === "status" ? STATUS_3D[stair.status] : MAT.stair;
  const L = stair.landing.rect;
  // upper flight (risers 11-20) belongs to the storey above, lift it with the exploded upper floor
  return (
    <group onClick={onClick}>
      {steps.map((s) => {
        const up = s.id.includes("-F2-");
        const h = s.zTop - s.zBottom;
        return (
          <mesh key={s.id} position={[(s.x0 + s.x1) / 2, s.zBottom + h / 2 + (up ? lift : 0), (s.y0 + s.y1) / 2]} material={mat(color)} castShadow receiveShadow>
            <boxGeometry args={[s.x1 - s.x0, h, s.y1 - s.y0]} />
          </mesh>
        );
      })}
      <mesh position={[(L[0] + L[2]) / 2, stair.landing.z - 0.075, (L[1] + L[3]) / 2]}
        material={mat(sel ? SEL : colorMode === "status" ? STATUS_3D[stair.landing.status] : MAT.stair)} castShadow receiveShadow>
        <boxGeometry args={[L[2] - L[0], 0.15, L[3] - L[1]]} />
      </mesh>
    </group>
  );
}

function Columns({ lift, show1, show2 }: { lift: number; show1: boolean; show2: boolean }) {
  const { colorMode, selection } = useViewerStore();
  const select = useViewerStore((s) => s.select);
  const items: { id: string; x: number; y: number; z0: number; z1: number; status: VerificationStatus }[] = [];
  for (const c of building.columns) {
    if (show1 && c.shownOn["AR-08"]) items.push({ id: c.id, x: c.x, y: c.y, z0: 0, z1: c.y > 16.05 ? 3.7 : 4.25, status: c.status });
    if (show2 && (c.shownOn["AR-09"] || c.shownOn["ST-04"]) && c.y < 13.6) items.push({ id: c.id, x: c.x, y: c.y, z0: 4.25 + lift, z1: 7.35 + lift, status: c.status });
  }
  return (
    <group>
      {items.map((c, i) => {
        const color = isSel(selection, "column", c.id) ? SEL : colorMode === "status" ? STATUS_3D[c.status] : MAT.column;
        return (
          <mesh key={i} position={[c.x, (c.z0 + c.z1) / 2, c.y]} material={mat(color)} castShadow
            onClick={(e) => { if (e.delta > 4) return; e.stopPropagation(); select({ kind: "column", id: c.id }); }}>
            <boxGeometry args={[0.2, c.z1 - c.z0, 0.2]} />
          </mesh>
        );
      })}
    </group>
  );
}

function StructureSlabs() {
  const { colorMode } = useViewerStore();
  const slabs = floors.flatMap((f) => f.slabs);
  return (
    <group>
      {slabs.map((s) => (
        <mesh key={s.id} geometry={slabGeometry(s.polygon as [number, number][])} position={[0, (s.z ?? 0) - 0.12, 0]}
          material={mat(colorMode === "status" ? STATUS_3D[s.status] : MAT.slab, 0.9)} castShadow receiveShadow
          onClick={(e) => { if (e.delta > 4) return; e.stopPropagation(); useViewerStore.getState().select({ kind: "area", id: s.id }); }} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ grid & dimensions
function Grid({ show }: { show: boolean }) {
  const X0 = -2.5, X1 = 19, Y0 = -2.5, Y1 = 28.5;
  const lbl = (txt: string, status: VerificationStatus) => (
    <div className="flex size-6 items-center justify-center rounded-full border-2 bg-white text-[10px] font-semibold text-slate-800" style={{ borderColor: STATUS_3D[status] }}>{txt}</div>
  );
  return (
    <group position={[0, 0.005, 0]} visible={show}>
      {building.grids.x.map((g) => (
        <group key={"x" + g.name}>
          <Line points={[[g.pos, 0, Y0], [g.pos, 0, Y1]]} color="#64748b" lineWidth={1} dashed dashSize={0.6} gapSize={0.25} transparent opacity={0.7} />
          <Html position={[g.pos, 0, Y0 - 0.6]} center style={{ pointerEvents: "none", display: show ? "block" : "none" }} zIndexRange={[10, 0]}>{lbl(g.name, g.status)}</Html>
        </group>
      ))}
      {building.grids.y.map((g) => (
        <group key={"y" + g.name}>
          <Line points={[[X0, 0, g.pos], [X1, 0, g.pos]]} color="#64748b" lineWidth={1} dashed dashSize={0.6} gapSize={0.25} transparent opacity={0.7} />
          <Html position={[X0 - 0.6, 0, g.pos]} center style={{ pointerEvents: "none", display: show ? "block" : "none" }} zIndexRange={[10, 0]}>{lbl(g.name, g.status)}</Html>
        </group>
      ))}
    </group>
  );
}

function DimLine({ a, b, label, show = true }: { a: [number, number]; b: [number, number]; label: string; show?: boolean }) {
  const y = 0.05;
  const horiz = Math.abs(b[1] - a[1]) < 1e-6;
  const tick = (p: [number, number]): [number, number, number][] =>
    horiz ? [[p[0], y, p[1] - 0.2], [p[0], y, p[1] + 0.2]] : [[p[0] - 0.2, y, p[1]], [p[0] + 0.2, y, p[1]]];
  return (
    <group>
      <Line points={[[a[0], y, a[1]], [b[0], y, b[1]]]} color="#ef4444" lineWidth={1.5} />
      <Line points={tick(a)} color="#ef4444" lineWidth={1.5} />
      <Line points={tick(b)} color="#ef4444" lineWidth={1.5} />
      <Html position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} center style={{ pointerEvents: "none", display: show ? "block" : "none" }} zIndexRange={[15, 0]}>
        <div className="whitespace-nowrap rounded-full bg-red-700/90 px-2 py-0.5 text-[10px] font-semibold text-white">{label}</div>
      </Html>
    </group>
  );
}

/** Dimension chains from the verified grid (AR-08 / ST-04), shown only when looking from above. */
function GridDimensions({ visible }: { visible: boolean }) {
  const gx = (n: string) => building.grids.x.find((g) => g.name === n)!.pos;
  const gy = (n: string) => building.grids.y.find((g) => g.name === n)!.pos;
  const xChain = ["1", '2"', "3", "4", "5"];
  const yChain = ["A'", "A", "B", "C", "D", "E", "F"];
  return (
    <group visible={visible}>
      {xChain.slice(1).map((n, i) => <DimLine key={n} show={visible} a={[gx(xChain[i]), -1.6]} b={[gx(n), -1.6]} label={(gx(n) - gx(xChain[i])).toFixed(2)} />)}
      <DimLine show={visible} a={[gx("1"), -3.0]} b={[gx("5"), -3.0]} label={`${(gx("5") - gx("1")).toFixed(2)} ม.`} />
      {yChain.slice(1).map((n, i) => <DimLine key={n} show={visible} a={[18.6, gy(yChain[i])]} b={[18.6, gy(n)]} label={(gy(n) - gy(yChain[i])).toFixed(2)} />)}
      <DimLine show={visible} a={[20.0, gy("A")]} b={[20.0, gy("F")]} label={`${(gy("F") - gy("A")).toFixed(2)} ม.`} />
    </group>
  );
}

/** Width / length lines for the focused room (from its verified polygon). */
function RoomDims({ r, lift }: { r: Room; lift: number }) {
  const b = roomBounds(r);
  return (
    <group position={[0, r.floorElevation + lift, 0]}>
      <DimLine a={[b.x0, b.y1 + 0.6]} b={[b.x1, b.y1 + 0.6]} label={`กว้าง ${(b.x1 - b.x0).toFixed(2)} ม.`} />
      <DimLine a={[b.x0 - 0.6, b.y0]} b={[b.x0 - 0.6, b.y1]} label={`ยาว ${(b.y1 - b.y0).toFixed(2)} ม.`} />
    </group>
  );
}

// ------------------------------------------------------------------ scene
export function HouseScene({ topView }: { topView: boolean }) {
  const { floorMode, layers, explode, focusRoomId } = useViewerStore();
  const focusRoom = floors.flatMap((f) => f.rooms).find((r) => r.id === focusRoomId);
  const show1 = floorMode !== "F2";
  const show2 = floorMode !== "F1" && !(focusRoom && focusRoom.floorId === "F1");
  const lift = explode;
  return (
    <group>
      <FloorGroup floor={floors[0]} lift={0} visible={show1} labels={!show2 || lift >= 2.5} />
      <FloorGroup floor={floors[1]} lift={lift} visible={show2} labels />
      {layers.stairs && (show1 || show2) && <Stairs lift={show2 ? lift : 0} />}
      {layers.columns && <Columns lift={lift} show1={show1} show2={show2} />}
      {layers.slabs && show1 && <StructureSlabs />}
      <Grid show={layers.grid} />
      <GridDimensions visible={layers.dims && topView && !focusRoom} />
      {focusRoom && <RoomDims key={focusRoom.id} r={focusRoom} lift={focusRoom.floorId === "F2" ? lift : 0} />}
    </group>
  );
}

/** Ground + sun. Sun comes from the south-east, derived from the verified north (DEC-04). */
export function Environment() {
  const [nx, ny] = building.north.planVector;
  const c = new THREE.Vector3(8.5, 0, 13);
  const sunDir = new THREE.Vector3(-nx * 0.6 + ny * 0.4, 1.1, -ny * 0.6 - nx * 0.4).normalize(); // roughly SE, high (latitude ~18 N)
  const sunPos = c.clone().add(sunDir.multiplyScalar(40));
  const ref = useRef<THREE.DirectionalLight>(null);
  const [target] = useState(() => { const o = new THREE.Object3D(); o.position.copy(c); return o; });
  useFrame(() => { if (ref.current) ref.current.target = target; });
  return (
    <>
      <hemisphereLight args={["#ffffff", "#8a9a7a", 0.9]} />
      <directionalLight ref={ref} position={sunPos.toArray()} intensity={1.6} castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-25} shadow-camera-right={25} shadow-camera-top={25} shadow-camera-bottom={-25} shadow-camera-far={120} shadow-bias={-0.0004} />
      <primitive object={target} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[8.5, -0.03, 13]} receiveShadow>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial color="#cfd8c6" roughness={1} />
      </mesh>
    </>
  );
}
