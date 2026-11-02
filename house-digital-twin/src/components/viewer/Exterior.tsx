"use client";
/**
 * Modern Classic exterior dressing (owner reference renders) on top of the drawing-based model.
 * Roof / frieze / portal heights come from AR-10, AR-14, AR-16; site items are approximate (data/inputs/exterior.json).
 * World: x = plan x, z = plan y, y = level.
 */
import { useMemo } from "react";
import * as THREE from "three";
import ext from "../../../data/inputs/exterior.json";
import { floors } from "@/lib/data";
import { hipRoof, type RoofFace } from "@/lib/model";
import { mat, pick } from "./HouseScene";
import { useViewerStore } from "@/lib/viewerStore";

const C = ext.colors;
type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

/** Axis-aligned box in plan coords. */
function B({ b, m, cast = true }: { b: Box; m: THREE.Material; cast?: boolean }) {
  return (
    <mesh position={[(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, (b.y0 + b.y1) / 2]} material={m} castShadow={cast} receiveShadow>
      <boxGeometry args={[Math.max(b.x1 - b.x0, 0.001), Math.max(b.z1 - b.z0, 0.001), Math.max(b.y1 - b.y0, 0.001)]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ procedural textures
const texCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d")!);
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return t;
}
const rnd = (i: number) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };

const roofTex = () => canvasTex("roof", 128, 128, (g) => {
  g.fillStyle = C.roof; g.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 4; k++) {
      const l = 0.9 + rnd(r * 7 + k) * 0.2;
      g.fillStyle = `rgba(${Math.round(74 * l)},${Math.round(79 * l)},${Math.round(87 * l)},1)`;
      g.fillRect(k * 32 + (r % 2) * 16, r * 32, 31, 26);
    }
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, r * 32 + 26, 128, 6);
  }
});
const marbleTex = () => canvasTex("marble", 256, 256, (g) => {
  g.fillStyle = "#e6e6e3"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(110,112,118,${0.08 + rnd(i) * 0.18})`; g.lineWidth = 0.5 + rnd(i + 3) * 1.8;
    g.beginPath(); let x = rnd(i + 1) * 256, y = rnd(i + 2) * 256; g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (rnd(i * 9 + s) - 0.3) * 60; y += (rnd(i * 5 + s) - 0.5) * 50; g.lineTo(x, y); }
    g.stroke();
  }
});
const paverTex = () => canvasTex("paver", 128, 128, (g) => {
  g.fillStyle = "#9da1a6"; g.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 8; r++) for (let k = 0; k < 4; k++) {
    const l = 0.92 + rnd(r * 11 + k) * 0.14;
    g.fillStyle = `rgb(${Math.round(185 * l)},${Math.round(188 * l)},${Math.round(192 * l)})`;
    g.fillRect(k * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14);
  }
});
const lawnTex = () => canvasTex("lawn", 128, 128, (g) => {
  g.fillStyle = C.lawn; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${40 + rnd(i) * 60},${90 + rnd(i + 1) * 70},${30 + rnd(i + 2) * 30},0.35)`; g.fillRect(rnd(i + 3) * 128, rnd(i + 4) * 128, 2, 3); }
});

// ------------------------------------------------------------------ roof
function roofGeometry(faces: RoofFace[], gable: boolean) {
  const pos: number[] = [], uv: number[] = [];
  for (const f of faces.filter((x) => x.gable === gable)) {
    const tris = f.pts.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
    // make faces point upwards / outwards
    const a = new THREE.Vector3(...f.pts[0]), b = new THREE.Vector3(...f.pts[1]), c = new THREE.Vector3(...f.pts[2]);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const flip = gable ? false : n.y < 0;
    for (const t of tris) {
      const idx = flip ? [t[0], t[2], t[1]] : t;
      for (const i of idx) {
        const p = f.pts[i];
        pos.push(...p);
        uv.push(p[0] * f.eaveAlong[0] + p[2] * f.eaveAlong[2], (p[1] - f.eave) * 2.37);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function Roof({ r }: { r: (typeof ext.roofs)[number] }) {
  const faces = useMemo(() => hipRoof(r.rect as [number, number, number, number], r.eave, r.ridge, r.ridgeAxis as "x" | "y", r.hip as [boolean, boolean]), [r]);
  const tiles = useMemo(() => roofGeometry(faces, false), [faces]);
  const gables = useMemo(() => roofGeometry(faces, true), [faces]);
  const tex = roofTex();
  tex.repeat.set(1 / 0.6, 1 / 0.33);
  const [x0, y0, x1, y1] = r.rect;
  const trim = mat(C.trim);
  const fz0 = r.eave - 0.22, fz1 = r.eave + 0.04, t = 0.04;
  return (
    <group>
      <mesh geometry={tiles} castShadow receiveShadow>
        <meshStandardMaterial map={tex} color="#ffffff" roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={gables} material={mat(C.wall, 1, { side: THREE.DoubleSide })} castShadow />
      {/* soffit + fascia */}
      <mesh position={[(x0 + x1) / 2, r.eave - 0.03, (y0 + y1) / 2]} rotation={[Math.PI / 2, 0, 0]} material={trim}>
        <planeGeometry args={[x1 - x0, y1 - y0]} />
      </mesh>
      <B b={{ x0, x1, y0: y0 - t, y1: y0, z0: fz0, z1: fz1 }} m={trim} />
      <B b={{ x0, x1, y0: y1, y1: y1 + t, z0: fz0, z1: fz1 }} m={trim} />
      <B b={{ x0: x0 - t, x1: x0, y0, y1, z0: fz0, z1: fz1 }} m={trim} />
      <B b={{ x0: x1, x1: x1 + t, y0, y1, z0: fz0, z1: fz1 }} m={trim} />
    </group>
  );
}

// ------------------------------------------------------------------ facade
function Ring({ rect, z0, z1, t, out = 0, m }: { rect: number[]; z0: number; z1: number; t: number; out?: number; m: THREE.Material }) {
  const [x0, y0, x1, y1] = [rect[0] - out, rect[1] - out, rect[2] + out, rect[3] + out];
  return (
    <group>
      <B b={{ x0, x1, y0, y1: y0 + t, z0, z1 }} m={m} />
      <B b={{ x0, x1, y0: y1 - t, y1, z0, z1 }} m={m} />
      <B b={{ x0, x1: x0 + t, y0, y1, z0, z1 }} m={m} />
      <B b={{ x0: x1 - t, x1, y0, y1, z0, z1 }} m={m} />
    </group>
  );
}

function Facade({ upper }: { upper: boolean }) {
  const wall = mat(C.wall), trim = mat(C.trim), plinth = mat(C.plinth, 1, { roughness: 0.9 });
  const fr = ext.frieze;
  const stone = useMemo(() => {
    const t = marbleTex(); t.repeat.set(1, 4);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 });
  }, []);
  return (
    <group>
      {/* frieze band between roof beam and wall plate, with a two-step cornice */}
      {upper && (
        <>
          <Ring rect={fr.rect} z0={fr.z0} z1={fr.z1} t={0.2} m={wall} />
          <Ring rect={fr.rect} z0={fr.z1 - 0.3} z1={fr.z1 - 0.15} t={0.25} out={0.1} m={trim} />
          <Ring rect={fr.rect} z0={fr.z1 - 0.15} z1={fr.z1 - 0.05} t={0.3} out={0.18} m={trim} />
        </>
      )}
      {/* grey plinth */}
      {ext.plinth.rects.map((r, i) => <Ring key={i} rect={r} z0={0} z1={ext.plinth.height} t={0.06} out={0.03} m={plinth} />)}
      {/* pilasters (stone-clad on the ground floor, white above) */}
      {ext.pilasters.filter((p) => upper || p.z0 < 4).map((p, i) => (
        <group key={i}>
          <B b={{ x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - 0.05, y1: p.y + p.d, z0: p.z0, z1: p.z1 }} m={p.stone ? stone : wall} />
          <B b={{ x0: p.x - p.w / 2 - 0.05, x1: p.x + p.w / 2 + 0.05, y0: p.y - 0.05, y1: p.y + p.d + 0.05, z0: p.z1 - 0.12, z1: p.z1 }} m={p.stone ? plinth : trim} />
          {p.stone && <B b={{ x0: p.x - p.w / 2 - 0.03, x1: p.x + p.w / 2 + 0.03, y0: p.y - 0.05, y1: p.y + p.d + 0.03, z0: 0, z1: 0.6 }} m={plinth} />}
        </group>
      ))}
      <Portal />
      <Steps />
      {ext.wallLights.map(([x, y, z], i) => (
        <group key={i} position={[x, z, y + 0.06]}>
          <mesh material={mat(C.frame)}><boxGeometry args={[0.1, 0.24, 0.1]} /></mesh>
          <mesh position={[0, 0.13, 0]} material={mat("#ffe6b3", 1, { emissive: new THREE.Color("#ffd27a"), emissiveIntensity: 2 })}><boxGeometry args={[0.08, 0.02, 0.08]} /></mesh>
          <mesh position={[0, -0.13, 0]} material={mat("#ffe6b3", 1, { emissive: new THREE.Color("#ffd27a"), emissiveIntensity: 2 })}><boxGeometry args={[0.08, 0.02, 0.08]} /></mesh>
        </group>
      ))}
    </group>
  );
}

/** Double-height entrance portal: front pilasters + lintel, arched side walls, cornice roof. */
function Portal() {
  const p = ext.portal;
  const wall = mat(C.wall), trim = mat(C.trim);
  const side = useMemo(() => {
    const { y0: a0, y1: a1, spring } = p.sideArch;
    const r = (a1 - a0) / 2;
    const s = new THREE.Shape();
    s.moveTo(p.y0, 0); s.lineTo(a0, 0); s.lineTo(a0, spring - p.z0);
    s.absarc((a0 + a1) / 2, spring - p.z0, r, Math.PI, 0, true);
    s.lineTo(a1, 0); s.lineTo(p.y1, 0); s.lineTo(p.y1, p.z1 - p.z0); s.lineTo(p.y0, p.z1 - p.z0); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false, curveSegments: 24 });
    g.rotateY(-Math.PI / 2); // shape x(=plan y) -> world z
    return g;
  }, [p]);
  return (
    <group>
      <mesh geometry={side} position={[p.x0 + 0.3, p.z0, 0]} material={wall} castShadow receiveShadow />
      <mesh geometry={side} position={[p.x1, p.z0, 0]} material={wall} castShadow receiveShadow />
      {/* front pilasters + lintel */}
      <B b={{ x0: p.x0, x1: p.x0 + 0.45, y0: p.y1 - 0.35, y1: p.y1, z0: p.z0, z1: p.z1 }} m={wall} />
      <B b={{ x0: p.x1 - 0.45, x1: p.x1, y0: p.y1 - 0.35, y1: p.y1, z0: p.z0, z1: p.z1 }} m={wall} />
      <B b={{ x0: p.x0, x1: p.x1, y0: p.y1 - 0.35, y1: p.y1, z0: p.frontLintel, z1: p.z1 }} m={wall} />
      {/* roof slab + cornice */}
      <B b={{ x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1, z0: p.z1, z1: p.z1 + 0.2 }} m={wall} />
      <B b={{ x0: p.x0 - 0.12, x1: p.x1 + 0.12, y0: p.y0, y1: p.y1 + 0.12, z0: p.z1 + 0.2, z1: p.z1 + 0.32 }} m={trim} />
      <B b={{ x0: p.x0 - 0.2, x1: p.x1 + 0.2, y0: p.y0, y1: p.y1 + 0.2, z0: p.z1 + 0.32, z1: p.z1 + 0.4 }} m={trim} />
      {/* pilaster bases */}
      <B b={{ x0: p.x0 - 0.03, x1: p.x0 + 0.48, y0: p.y1 - 0.38, y1: p.y1 + 0.03, z0: p.z0, z1: p.z0 + 0.45 }} m={mat(C.plinth)} />
      <B b={{ x0: p.x1 - 0.48, x1: p.x1 + 0.03, y0: p.y1 - 0.38, y1: p.y1 + 0.03, z0: p.z0, z1: p.z0 + 0.45 }} m={mat(C.plinth)} />
    </group>
  );
}

function Steps() {
  const s = ext.steps;
  const m = mat("#d9d7d2");
  return (
    <group>
      {Array.from({ length: s.n }, (_, i) => (
        <B key={i} b={{ x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y0 + (s.n - i) * s.tread, z0: 0, z1: s.top - i * s.rise }} m={m} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ carport
function Carport() {
  const slab = floors.flatMap((f) => f.slabs)[0];
  const c = ext.carport;
  const wall = mat(C.wall), trim = mat(C.trim), base = mat(C.plinth);
  const led = mat("#ffffff", 1, { emissive: new THREE.Color("#fff6e0"), emissiveIntensity: 3 });
  const poly = (slab?.polygon ?? []) as [number, number][];
  return (
    <group>
      {poly.map((a, i) => {
        const b = poly[(i + 1) % poly.length];
        const [x0, x1] = [Math.min(a[0], b[0]) - 0.12, Math.max(a[0], b[0]) + 0.12];
        const [y0, y1] = [Math.min(a[1], b[1]) - 0.12, Math.max(a[1], b[1]) + 0.12];
        if (Math.min(a[1], b[1]) < 13.6 && Math.abs(a[1] - b[1]) < 0.01) return null; // edge against the house
        return (
          <group key={i}>
            <B b={{ x0, x1, y0, y1, z0: c.fascia[0], z1: c.fascia[1] }} m={wall} />
            <B b={{ x0: x0 - 0.06, x1: x1 + 0.06, y0: y0 - 0.06, y1: y1 + 0.06, z0: c.fascia[1] - 0.12, z1: c.fascia[1] }} m={trim} />
          </group>
        );
      })}
      {c.pillars.map(([x, y], i) => {
        const h = c.pillarSize / 2;
        const outX = x > 14 ? 1 : -1;
        return (
          <group key={i}>
            <B b={{ x0: x - h, x1: x + h, y0: y - h, y1: y + h, z0: 0, z1: c.fascia[0] }} m={wall} />
            <B b={{ x0: x - h - 0.03, x1: x + h + 0.03, y0: y - h - 0.03, y1: y + h + 0.03, z0: 0, z1: 0.55 }} m={base} />
            <B b={{ x0: x + outX * h - 0.01, x1: x + outX * h + 0.01, y0: y - 0.03, y1: y + 0.03, z0: 1.0, z1: 2.8 }} m={led} cast={false} />
          </group>
        );
      })}
      {[12.5, 14.0, 15.5].flatMap((x) => [19.5, 22.5, 25.5].map((y) => (
        <mesh key={`${x}-${y}`} position={[x, 3.49, y]} rotation={[Math.PI / 2, 0, 0]} material={led}><circleGeometry args={[0.06, 16]} /></mesh>
      )))}
    </group>
  );
}

// ------------------------------------------------------------------ site
function Site() {
  const paver = useMemo(() => {
    const t = paverTex(); t.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  }, []);
  const lawn = useMemo(() => {
    const t = lawnTex(); t.repeat.set(60, 60);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  }, []);
  const hedge = mat("#3f6b34", 1, { roughness: 1 });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[8.5, -0.02, 13]} material={lawn} receiveShadow
        onClick={(e) => { if (useViewerStore.getState().tool === "measure") pick(e, null); }}><planeGeometry args={[140, 140]} /></mesh>
      {ext.driveway.map(([x0, y0, x1, y1], i) => {
        const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (x1 - x0) / 1.2, uv.getY(k) * (y1 - y0) / 0.6);
        return <mesh key={i} geometry={g} rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, 0.005 + i * 0.002, (y0 + y1) / 2]} material={paver} receiveShadow />;
      })}
      {ext.hedges.map(([x0, y0, x1, y1], i) => <B key={i} b={{ x0, x1, y0, y1, z0: 0, z1: 0.55 }} m={hedge} />)}
      <Fence />
      {ext.cars.map((c, i) => <Car key={i} x={c.x} y={c.y} />)}
      {ext.palms.map(([x, y], i) => <Palm key={i} x={x} y={y} seed={i} />)}
      {ext.topiary.map(([x, y], i) => <Topiary key={i} x={x} y={y} />)}
    </group>
  );
}

function Fence() {
  const f = ext.fence;
  const [x0, y0, x1, y1] = f.rect;
  const wall = mat(C.wall), panel = mat(C.gate, 1, { roughness: 0.6 }), cap = mat(C.trim);
  const H = f.height, t = 0.2;
  const runs: Box[] = [
    { x0, x1, y0, y1: y0 + t, z0: 0, z1: H },
    { x0, x1: x0 + t, y0, y1, z0: 0, z1: H },
    { x0: x1 - t, x1, y0, y1, z0: 0, z1: H },
    // front (road) wall split by the gates
    { x0, x1: f.gate[0], y0: y1 - t, y1, z0: 0, z1: H },
    { x0: f.gate[1], x1: f.pedestrianGate[0], y0: y1 - t, y1, z0: 0, z1: H },
    { x0: f.pedestrianGate[1], x1, y0: y1 - t, y1, z0: 0, z1: H },
  ];
  const posts: [number, number][] = [];
  for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 6) { posts.push([x, y0]); }
  for (let y = y0; y <= y1 + 0.01; y += (y1 - y0) / 8) { posts.push([x0, y], [x1, y]); }
  posts.push([f.gate[0], y1], [f.gate[1], y1], [f.pedestrianGate[1], y1], [x0 + 3, y1], [x1 - 2.5, y1]);
  const slats: React.ReactNode[] = [];
  for (const [g0, g1, k] of [[f.gate[0], f.gate[1], "g"], [f.pedestrianGate[0], f.pedestrianGate[1], "p"]] as [number, number, string][]) {
    for (let x = g0 + 0.08; x < g1 - 0.05; x += 0.12) {
      slats.push(<B key={k + x} b={{ x0: x, x1: x + 0.06, y0: y1 - 0.12, y1: y1 - 0.06, z0: 0.05, z1: H - 0.05 }} m={panel} cast={false} />);
    }
    slats.push(<B key={k + "top"} b={{ x0: g0, x1: g1, y0: y1 - 0.13, y1: y1 - 0.05, z0: H - 0.1, z1: H - 0.02 }} m={panel} />);
  }
  return (
    <group>
      {runs.map((b, i) => <B key={i} b={b} m={wall} />)}
      {posts.map(([x, y], i) => (
        <group key={i}>
          <B b={{ x0: x - 0.25, x1: x + 0.25, y0: y - 0.25, y1: y + 0.25, z0: 0, z1: H + 0.25 }} m={wall} />
          <B b={{ x0: x - 0.32, x1: x + 0.32, y0: y - 0.32, y1: y + 0.32, z0: H + 0.25, z1: H + 0.35 }} m={cap} />
        </group>
      ))}
      {slats}
    </group>
  );
}

// ------------------------------------------------------------------ props (procedural, no external assets)
function Car({ x, y }: { x: number; y: number }) {
  const body = useMemo(() => {
    const s = new THREE.Shape();
    // side profile of a sedan, length 4.6 along local x, height from 0.18
    s.moveTo(-2.3, 0.3); s.lineTo(2.3, 0.3); s.quadraticCurveTo(2.35, 0.75, 2.05, 0.8); s.lineTo(1.0, 0.88);
    s.quadraticCurveTo(0.55, 1.4, 0.1, 1.42); s.lineTo(-0.9, 1.4); s.quadraticCurveTo(-1.5, 1.3, -1.85, 0.95);
    s.lineTo(-2.3, 0.85); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 12 });
    g.translate(0, 0, -0.81);
    return g;
  }, []);
  const paint = mat("#f3f4f6", 1, { roughness: 0.25, metalness: 0.5 });
  const glass = mat("#1f2937", 1, { roughness: 0.1, metalness: 0.6 });
  const tyre = mat("#111111", 1, { roughness: 0.9 });
  return (
    <group position={[x, 0, y]} rotation={[0, Math.PI / 2, 0]}>
      <mesh geometry={body} material={paint} castShadow receiveShadow />
      <mesh position={[-0.35, 1.12, 0]} material={glass}><boxGeometry args={[2.0, 0.34, 1.78]} /></mesh>
      <mesh position={[0.62, 1.1, 0]} rotation={[0, 0, 0.75]} material={glass}><boxGeometry args={[0.05, 0.55, 1.5]} /></mesh>
      {[[-1.45, 0.83], [-1.45, -0.83], [1.4, 0.83], [1.4, -0.83]].map(([u, v], i) => (
        <mesh key={i} position={[u, 0.33, v]} rotation={[Math.PI / 2, 0, 0]} material={tyre} castShadow>
          <cylinderGeometry args={[0.33, 0.33, 0.24, 20]} />
        </mesh>
      ))}
    </group>
  );
}

function Palm({ x, y, seed }: { x: number; y: number; seed: number }) {
  const h = 6 + rnd(seed) * 3;
  const lean = (rnd(seed + 1) - 0.5) * 0.15;
  const trunk = mat("#8b7b67", 1, { roughness: 1 }), leaf = mat("#2f6b2f", 1, { roughness: 0.9, side: THREE.DoubleSide });
  const frond = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.quadraticCurveTo(1.4, 0.45, 3.0, 0); s.quadraticCurveTo(1.4, -0.45, 0, 0);
    const g = new THREE.ShapeGeometry(s, 8);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i); p.setZ(i, -0.12 * u * u); } // droop
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <group position={[x, 0, y]} rotation={[lean, rnd(seed + 2) * 6.28, lean]}>
      <mesh position={[0, h / 2, 0]} material={trunk} castShadow><cylinderGeometry args={[0.16, 0.24, h, 8]} /></mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} geometry={frond} material={leaf} position={[0, h, 0]} rotation={[-Math.PI / 2 + 0.35 + rnd(seed * 13 + i) * 0.4, 0, (i / 12) * Math.PI * 2]} castShadow />
      ))}
    </group>
  );
}

function Topiary({ x, y }: { x: number; y: number }) {
  const m = mat("#2f5a2c", 1, { roughness: 1 });
  return (
    <group position={[x, 0, y]}>
      {[[0.75, 0.9, 0.45], [0.6, 0.8, 1.15], [0.45, 0.7, 1.8], [0.28, 0.55, 2.35]].map(([r, h, z], i) => (
        <mesh key={i} position={[0, z, 0]} material={m} castShadow><coneGeometry args={[r, h, 10]} /></mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ root
export function Exterior() {
  const { show, viewMode, floorMode, focusRoomId } = useViewerStore();
  const upper = floorMode !== "F1" && viewMode === "exterior" && !focusRoomId;
  const roof = show.roof && upper && floorMode === "all";
  return (
    <group>
      {roof && ext.roofs.map((r) => <Roof key={r.id} r={r} />)}
      <Facade upper={upper} />
      <Carport />
      <Site />
    </group>
  );
}
