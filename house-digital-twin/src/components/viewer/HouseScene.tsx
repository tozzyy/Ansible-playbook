"use client";
/**
 * House model generated from src/data (Geometry JSON from the construction drawings).
 * World: x = plan x, z = plan y (towards grid F), y = absolute level.
 */
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Environment as DreiEnvironment, Html, Line } from "@react-three/drei";
import { building, floors } from "@/lib/data";
import { centroid, isArched, openingCenter, roomBounds, stairSteps, wallLength, wallPlacement, wallProfile } from "@/lib/model";
import { useViewerStore } from "@/lib/viewerStore";
import type { Floor, Opening, Room, Selection, Wall } from "@/types/geometry";

// ------------------------------------------------------------------ materials
const SEL = "#93c5fd";
export const MAT = {
  wall: "#f4f3ef",
  floorDry: "#e7ddcb",
  floorWet: "#d5dde1",
  floorGarage: "#c9c4b8",
  slab: "#e9e9e6",
  stair: "#e2ddd3",
  door: "#2b2f36",
  frame: "#22252b",
  glass: "#9fb8c8",
  column: "#f4f3ef",
};
const cache = new Map<string, THREE.MeshStandardMaterial>();
let doubleSided = false;
export function mat(color: string, opacity = 1, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = `${color}|${opacity.toFixed(2)}|${JSON.stringify(extra)}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, ...extra });
    m.side = doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    cache.set(key, m);
  }
  return m;
}
/** While the dollhouse cut is on, show back faces so cut walls/slabs read as solid. */
export function setDoubleSided(on: boolean) {
  doubleSided = on;
  cache.forEach((m) => { m.side = on ? THREE.DoubleSide : THREE.FrontSide; m.needsUpdate = true; });
}

/** Click on the model: select a room, or add a measurement point when the measure tool is on. */
export function pick(e: ThreeEvent<MouseEvent>, sel: Selection) {
  if (e.delta > 4) return; // it was a drag (orbit), not a click
  e.stopPropagation();
  const st = useViewerStore.getState();
  if (st.tool === "measure") {
    const r = e.ray;
    st.addMeasurePoint([e.point.x, e.point.y, e.point.z],
      { origin: [r.origin.x, r.origin.y, r.origin.z], dir: [r.direction.x, r.direction.y, r.direction.z] });
  } else if (sel) st.select(sel);
}
const measureOnly = (e: ThreeEvent<MouseEvent>) => pick(e, null);

// ------------------------------------------------------------------ walls & openings
function WallMesh({ w, openings, ghost }: { w: Wall; openings: Opening[]; ghost: boolean }) {
  const geom = useMemo(() => {
    const p = wallProfile(w, openings);
    const shape = new THREE.Shape(p.outline.map(([u, v]) => new THREE.Vector2(u, v)));
    for (const [u0, v0, u1, v1, r] of p.holes) {
      const path = new THREE.Path();
      path.moveTo(u0, v0); path.lineTo(u1, v0);
      if (r > 0) { path.lineTo(u1, v1 - r); path.absarc((u0 + u1) / 2, v1 - r, r, 0, Math.PI, false); }
      else { path.lineTo(u1, v1); path.lineTo(u0, v1); }
      path.closePath();
      shape.holes.push(path);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: w.thickness, bevelEnabled: false });
  }, [w, openings]);
  const { position, rotationY } = wallPlacement(w);
  const opacity = ghost ? 0.12 : 1;
  return <mesh geometry={geom} position={position} rotation={[0, rotationY, 0]} material={mat(MAT.wall, opacity)} castShadow={!ghost} receiveShadow onClick={measureOnly} />;
}

function OpeningMesh({ o, w, ghost }: { o: Opening; w: Wall; ghost: boolean }) {
  const [x, y, z] = openingCenter(o, w);
  const rotY = w.axis === "h" ? 0 : Math.PI / 2;
  const f = 0.05;
  const W = o.width, H = o.height;
  const op = ghost ? 0.15 : 1;
  const glass = o.kind === "window" || o.typeCode === "GL1";
  if (isArched(o)) return <ArchedWindow o={o} w={w} ghost={ghost} />;
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]} onClick={measureOnly}>
      <mesh material={glass ? mat(MAT.glass, ghost ? 0.1 : 0.35, { roughness: 0.05, metalness: 0.4 }) : mat(MAT.door, op, { roughness: 0.5 })}>
        <boxGeometry args={[W - 2 * f, H - (o.kind === "window" ? 2 * f : f), glass ? 0.02 : 0.04]} />
      </mesh>
      <mesh position={[0, H / 2 - f / 2, 0]} material={mat(MAT.frame, op, { roughness: 0.4 })}><boxGeometry args={[W, f, w.thickness + 0.02]} /></mesh>
      {o.kind === "window" && <mesh position={[0, -H / 2 + f / 2, 0]} material={mat(MAT.frame, op, { roughness: 0.4 })}><boxGeometry args={[W, f, w.thickness + 0.02]} /></mesh>}
      <mesh position={[-W / 2 + f / 2, 0, 0]} material={mat(MAT.frame, op, { roughness: 0.4 })}><boxGeometry args={[f, H, w.thickness + 0.02]} /></mesh>
      <mesh position={[W / 2 - f / 2, 0, 0]} material={mat(MAT.frame, op, { roughness: 0.4 })}><boxGeometry args={[f, H, w.thickness + 0.02]} /></mesh>
    </group>
  );
}

/** Arched fixed window (W4): arched glass, black frame and the 4 x 3 mullion grid of AR-27. */
function ArchedWindow({ o, w, ghost }: { o: Opening; w: Wall; ghost: boolean }) {
  const [x, y, z] = openingCenter(o, w);
  const W = o.width, H = o.height, r = W / 2, f = 0.05;
  const glassGeom = useMemo(() => {
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2, -H / 2); sh.lineTo(W / 2, -H / 2); sh.lineTo(W / 2, H / 2 - r);
    sh.absarc(0, H / 2 - r, r, 0, Math.PI, false); sh.closePath();
    return new THREE.ShapeGeometry(sh, 32);
  }, [W, H, r]);
  const frameM = mat(MAT.frame, ghost ? 0.15 : 1, { roughness: 0.4 });
  const bars: React.ReactNode[] = [];
  for (const u of [-W / 4, 0, W / 4]) {
    const top = Math.sqrt(Math.max(r * r - u * u, 0)) + H / 2 - r;
    bars.push(<mesh key={"v" + u} position={[u, (-H / 2 + top) / 2, 0]} material={frameM}><boxGeometry args={[0.04, top + H / 2, 0.06]} /></mesh>);
  }
  for (const v of [-H / 2 + (H - r) / 3, -H / 2 + (2 * (H - r)) / 3, H / 2 - r]) {
    bars.push(<mesh key={"h" + v} position={[0, v, 0]} material={frameM}><boxGeometry args={[W, 0.04, 0.06]} /></mesh>);
  }
  return (
    <group position={[x, y, z]} rotation={[0, w.axis === "h" ? 0 : Math.PI / 2, 0]} onClick={measureOnly}>
      <mesh geometry={glassGeom} material={mat(MAT.glass, ghost ? 0.1 : 0.35, { roughness: 0.05, metalness: 0.4, side: THREE.DoubleSide })} />
      {bars}
      <mesh position={[0, -H / 2 + f / 2, 0]} material={frameM}><boxGeometry args={[W, f, w.thickness + 0.02]} /></mesh>
    </group>
  );
}

// ------------------------------------------------------------------ floors (room slabs)
export function slabGeometry(poly: [number, number][], thickness = 0.12) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, -y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // (x,-y,0) -> (x,0,y), extrusion goes up
  return g;
}

function RoomSlab({ r }: { r: Room }) {
  const { selection, setFocusRoom } = useViewerStore();
  const geom = useMemo(() => slabGeometry(r.polygon), [r]);
  const base = r.finish.floor === "F2" ? MAT.floorWet : r.finish.floor === "FA1" || r.floorElevation === 0 ? MAT.floorGarage : MAT.floorDry;
  const sel = !!selection && selection.kind === "room" && selection.id === r.id;
  return (
    <mesh geometry={geom} position={[0, r.floorElevation - 0.12, 0]} material={mat(sel ? SEL : base)} receiveShadow
      onClick={(e) => pick(e, { kind: "room", id: r.id })}
      onDoubleClick={(e) => { e.stopPropagation(); setFocusRoom(r.id); }} />
  );
}

function RoomLabel({ r, show }: { r: Room; show: boolean }) {
  const [cx, cy] = centroid(r.polygon);
  return (
    <Html position={[cx, r.floorElevation + 1.3, cy]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none", display: show ? "block" : "none" }}>
      <div className="whitespace-nowrap rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-medium text-white shadow backdrop-blur-sm">{r.name}</div>
    </Html>
  );
}

function FloorGroup({ floor, visible, labels }: { floor: Floor; visible: boolean; labels: boolean }) {
  const { show, focusRoomId, viewMode } = useViewerStore();
  const focusRoom = floors.flatMap((f) => f.rooms).find((r) => r.id === focusRoomId);
  const b = focusRoom ? roomBounds(focusRoom) : null;
  const labelMode = viewMode === "interior" || !!focusRoom; // names only inside, never on the facade
  const near = (x: number, y: number) => !b || (x >= b.x0 - 0.2 && x <= b.x1 + 0.2 && y >= b.y0 - 0.2 && y <= b.y1 + 0.2);
  const ghost = (w: Wall) => !!b && !(near(w.start[0], w.start[1]) && near(w.end[0], w.end[1]));
  const byWall = useMemo(() => {
    const m = new Map<string, Opening[]>();
    floor.openings.forEach((o) => m.set(o.wallId, [...(m.get(o.wallId) ?? []), o]));
    return m;
  }, [floor]);
  const wallById = useMemo(() => new Map(floor.walls.map((w) => [w.id, w])), [floor]);
  return (
    <group visible={visible}>
      {floor.rooms.map((r) => <RoomSlab key={r.id} r={r} />)}
      {floor.unassigned.map((u, i) => (
        <mesh key={i} geometry={slabGeometry([[u.rect[0], u.rect[1]], [u.rect[2], u.rect[1]], [u.rect[2], u.rect[3]], [u.rect[0], u.rect[3]]])}
          position={[0, floor.level - 0.12, 0]} material={mat(MAT.floorDry)} receiveShadow onClick={measureOnly} />
      ))}
      {floor.walls.filter((w) => wallLength(w) > 0.05).map((w) => <WallMesh key={w.id} w={w} openings={byWall.get(w.id) ?? []} ghost={ghost(w)} />)}
      {floor.openings.map((o) => {
        const w = wallById.get(o.wallId)!;
        return <OpeningMesh key={o.id} o={o} w={w} ghost={ghost(w)} />;
      })}
      {floor.rooms.map((r) => (
        <RoomLabel key={r.id} r={r} show={show.labels && labelMode && visible && labels && (!focusRoom || r.id === focusRoom.id)} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ stairs, columns, carport slab
function Stairs() {
  const steps = useMemo(() => stairSteps(), []);
  const stair = floors.flatMap((f) => f.stairs)[0];
  if (!stair) return null;
  const L = stair.landing.rect;
  return (
    <group onClick={measureOnly}>
      {steps.map((s) => {
        const h = s.zTop - s.zBottom;
        return (
          <mesh key={s.id} position={[(s.x0 + s.x1) / 2, s.zBottom + h / 2, (s.y0 + s.y1) / 2]} material={mat(MAT.stair)} castShadow receiveShadow>
            <boxGeometry args={[s.x1 - s.x0, h, s.y1 - s.y0]} />
          </mesh>
        );
      })}
      <mesh position={[(L[0] + L[2]) / 2, stair.landing.z - 0.075, (L[1] + L[3]) / 2]} material={mat(MAT.stair)} castShadow receiveShadow>
        <boxGeometry args={[L[2] - L[0], 0.15, L[3] - L[1]]} />
      </mesh>
    </group>
  );
}

function Columns({ show1, show2 }: { show1: boolean; show2: boolean }) {
  const items: { x: number; y: number; z0: number; z1: number }[] = [];
  for (const c of building.columns) {
    if (show1 && (c.shownOn["AR-08"] || c.shownOn["ST-04"])) items.push({ x: c.x, y: c.y, z0: 0, z1: c.y > 16.05 ? 3.7 : 4.25 });
    if (show2 && (c.shownOn["AR-09"] || c.shownOn["ST-04"]) && c.y < 13.6) items.push({ x: c.x, y: c.y, z0: 4.25, z1: 7.35 });
  }
  return (
    <group onClick={measureOnly}>
      {items.map((c, i) => (
        <mesh key={i} position={[c.x, (c.z0 + c.z1) / 2, c.y]} material={mat(MAT.column)} castShadow>
          <boxGeometry args={[0.2, c.z1 - c.z0, 0.2]} />
        </mesh>
      ))}
    </group>
  );
}

function CarportSlab() {
  const slabs = floors.flatMap((f) => f.slabs);
  return (
    <group>
      {slabs.map((s) => (
        <mesh key={s.id} geometry={slabGeometry(s.polygon as [number, number][], 0.2)} position={[0, (s.z ?? 0) - 0.2, 0]}
          material={mat(MAT.slab)} castShadow receiveShadow onClick={measureOnly} />
      ))}
    </group>
  );
}

/** Width / length lines for the focused room. */
function DimLine({ a, b, label }: { a: [number, number]; b: [number, number]; label: string }) {
  const y = 0.05;
  const horiz = Math.abs(b[1] - a[1]) < 1e-6;
  const tick = (p: [number, number]): [number, number, number][] =>
    horiz ? [[p[0], y, p[1] - 0.2], [p[0], y, p[1] + 0.2]] : [[p[0] - 0.2, y, p[1]], [p[0] + 0.2, y, p[1]]];
  return (
    <group>
      <Line points={[[a[0], y, a[1]], [b[0], y, b[1]]]} color="#ef4444" lineWidth={1.5} />
      <Line points={tick(a)} color="#ef4444" lineWidth={1.5} />
      <Line points={tick(b)} color="#ef4444" lineWidth={1.5} />
      <Html position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} center style={{ pointerEvents: "none" }} zIndexRange={[15, 0]}>
        <div className="whitespace-nowrap rounded-full bg-red-700/90 px-2 py-0.5 text-[10px] font-semibold text-white">{label}</div>
      </Html>
    </group>
  );
}

function RoomDims({ r }: { r: Room }) {
  const b = roomBounds(r);
  return (
    <group position={[0, r.floorElevation, 0]}>
      <DimLine a={[b.x0, b.y1 + 0.6]} b={[b.x1, b.y1 + 0.6]} label={`กว้าง ${(b.x1 - b.x0).toFixed(2)} ม.`} />
      <DimLine a={[b.x0 - 0.6, b.y0]} b={[b.x0 - 0.6, b.y1]} label={`ยาว ${(b.y1 - b.y0).toFixed(2)} ม.`} />
    </group>
  );
}

// ------------------------------------------------------------------ scene
export function HouseScene() {
  const { floorMode, viewMode, focusRoomId } = useViewerStore();
  const focusRoom = floors.flatMap((f) => f.rooms).find((r) => r.id === focusRoomId);
  const interior = viewMode === "interior";
  const show1 = floorMode !== "F2";
  // interior view of floor 1 (or a focused floor-1 room) removes the upper floor
  const show2 = floorMode !== "F1" && !(interior && floorMode === "all") && !(focusRoom && focusRoom.floorId === "F1");
  return (
    <group>
      <FloorGroup floor={floors[0]} visible={show1} labels={!show2} />
      <FloorGroup floor={floors[1]} visible={show2} labels />
      {(show1 || show2) && <Stairs />}
      <Columns show1={show1} show2={show2} />
      {show1 && <CarportSlab />}
      {focusRoom && <RoomDims key={focusRoom.id} r={focusRoom} />}
    </group>
  );
}

/** Ground + sun. Sun from the south-east, derived from the confirmed north (DEC-04). */
export function Environment() {
  const [nx, ny] = building.north.planVector;
  const c = new THREE.Vector3(8.5, 0, 13);
  const sunDir = new THREE.Vector3(-nx * 0.6 + ny * 0.4, 1.1, -ny * 0.6 - nx * 0.4).normalize();
  const sunPos = c.clone().add(sunDir.multiplyScalar(40));
  const ref = useRef<THREE.DirectionalLight>(null);
  const [target] = useState(() => { const o = new THREE.Object3D(); o.position.copy(c); return o; });
  useFrame(() => { if (ref.current) ref.current.target = target; });
  return (
    <>
      <DreiEnvironment files="/hdri/sky_1k.hdr" background environmentIntensity={0.9} />
      <hemisphereLight args={["#ffffff", "#8a9a7a", 0.35]} />
      <directionalLight ref={ref} position={sunPos.toArray()} intensity={2.2} castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-far={120} shadow-bias={-0.0004} />
      <primitive object={target} />
    </>
  );
}
