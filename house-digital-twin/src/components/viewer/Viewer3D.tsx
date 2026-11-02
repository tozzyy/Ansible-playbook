"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { building, counts, floors } from "@/lib/data";
import { PRESETS, HOME, roomBounds, roomPreset } from "@/lib/model";
import { useViewerStore, VIEW_LAYER_LABELS, type FloorMode, type ViewLayer } from "@/lib/viewerStore";
import { useVerifyStore } from "@/lib/store";
import { HouseScene, Environment } from "./HouseScene";
import { CameraRig } from "./CameraRig";
import { DetailsPanel } from "@/components/verify/DetailsPanel";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { StatusBadge } from "@/components/ui/badge";
import { cn, fmt, fmtLevel } from "@/lib/utils";

const FLOOR_MODES: { id: FloorMode; label: string }[] = [
  { id: "all", label: "ทุกชั้น" },
  { id: "F1", label: "ชั้น 1" },
  { id: "F2", label: "ชั้น 2" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-3 py-3">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function Sidebar() {
  const s = useViewerStore();
  const list = floors.filter((f) => s.floorMode === "all" || f.floorId === s.floorMode);
  return (
    <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-r border-border bg-card text-sm md:flex">
      <Section title="Floor selector">
        <div className="grid grid-cols-3 gap-1">
          {FLOOR_MODES.map((m) => (
            <button key={m.id} onClick={() => s.setFloorMode(m.id)}
              className={cn("rounded-md border px-2 py-1.5 text-xs", s.floorMode === m.id ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted")}>
              {m.label}
            </button>
          ))}
        </div>
        <label className="mb-1 mt-3 flex justify-between text-xs"><span>Exploded floors</span><span className="tabular">{fmt(s.explode, 1)} m</span></label>
        <Slider value={s.explode} onChange={s.setExplode} min={0} max={5} step={0.1} label="Exploded floors" />
      </Section>

      <Section title="Room explorer">
        {list.map((f) => (
          <div key={f.floorId} className="mb-2">
            <div className="mb-1 text-[11px] text-muted-foreground">{f.name}</div>
            <ul>
              {f.rooms.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => { s.select({ kind: "room", id: r.id }); s.setFocusRoom(r.id); }}
                    className={cn("flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted", s.focusRoomId === r.id && "bg-muted font-medium")}>
                    <span className="truncate">{r.name}</span>
                    <StatusBadge status={r.status} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section title="Layer controls">
        <div className="flex flex-col gap-1.5">
          {(Object.keys(VIEW_LAYER_LABELS) as ViewLayer[]).map((k) => (
            <Checkbox key={k} checked={s.layers[k]} onChange={() => s.toggleLayer(k)} label={VIEW_LAYER_LABELS[k]} />
          ))}
        </div>
        <label className="mb-1 mt-3 flex justify-between text-xs"><span>Wall transparency</span><span className="tabular">{Math.round((1 - s.wallOpacity) * 100)}%</span></label>
        <Slider value={1 - s.wallOpacity} onChange={(v) => s.setWallOpacity(1 - v)} min={0} max={0.9} step={0.05} label="Wall transparency" />
        <div className="mt-3 grid grid-cols-2 gap-1">
          {(["materials", "status"] as const).map((m) => (
            <button key={m} onClick={() => s.setColorMode(m)}
              className={cn("rounded-md border px-2 py-1.5 text-xs", s.colorMode === m ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted")}>
              {m === "materials" ? "สีวัสดุ" : "สีสถานะตรวจสอบ"}
            </button>
          ))}
        </div>
        <Checkbox className="mt-3" checked={s.autoOrbit} onChange={() => s.setAutoOrbit(!s.autoOrbit)} label="หมุนรอบอัตโนมัติเมื่อไม่ได้ใช้งาน 8 วินาที" />
      </Section>

      <Section title="Notes">
        <ul className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <li>Model = Geometry JSON from Phase 1 only. Nothing is modelled that is not in the drawings.</li>
          <li>Roof and finish materials come in Phase 4 (AR-10, ridge +11.07 per DEC-03).</li>
          <li>Column height = floor-to-floor (visual); not dimensioned on the sheets.</li>
          <li>Double-click a floor to focus that room.</li>
        </ul>
      </Section>
    </aside>
  );
}

function RoomCard() {
  const { focusRoomId, setFocusRoom, requestCamera } = useViewerStore();
  const r = floors.flatMap((f) => f.rooms).find((x) => x.id === focusRoomId);
  if (!r) return null;
  const b = roomBounds(r);
  return (
    <div className="absolute left-3 top-14 max-w-[calc(100%-7rem)] rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-xs text-white shadow backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{r.name}</span>
        <StatusBadge status={r.status} className="bg-white/90" />
      </div>
      <div className="mt-0.5 tabular">
        กว้าง {fmt(b.x1 - b.x0)} × ยาว {fmt(b.y1 - b.y0)} ม. · พื้นที่ {fmt(r.area)} ตร.ม. · พื้น {fmtLevel(r.floorElevation)}
        {r.ceilingHeight != null && <> · ฝ้าสูง {fmt(r.ceilingHeight)} ม.</>}
      </div>
      <button className="mt-1 text-sky-300 underline" onClick={() => { setFocusRoom(null); requestCamera(HOME); }}>กลับไปมุมมองทั้งบ้าน</button>
    </div>
  );
}

export function Viewer3D() {
  const s = useViewerStore();
  const router = useRouter();
  const setSheet = useVerifyStore((x) => x.setSheet);
  const compassRef = useRef<HTMLDivElement>(null);
  const [topView, setTopView] = useState(false);
  const [roomBar, setRoomBar] = useState(false);

  // camera follows room focus
  useEffect(() => {
    const r = floors.flatMap((f) => f.rooms).find((x) => x.id === s.focusRoomId);
    if (r) s.requestCamera(roomPreset(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.focusRoomId]);

  const all = floors.flatMap((f) => [...f.walls, ...f.rooms, ...f.openings]);
  const c = counts(all);
  const pill = "whitespace-nowrap rounded-full border border-white/25 bg-slate-900/70 px-3.5 py-2 text-[13px] text-white shadow backdrop-blur hover:bg-slate-900/90";
  const roomsInMode = floors.filter((f) => s.floorMode === "all" || f.floorId === s.floorMode).flatMap((f) => f.rooms);

  return (
    <div className="flex min-h-0 flex-1" style={{ height: "calc(100vh - 3rem)" }}>
      <Sidebar />
      <div className="relative min-w-0 flex-1" style={{ background: "var(--canvas)" }}>
        <Canvas shadows="percentage" dpr={[1, 2]} camera={{ fov: 40, near: 0.1, far: 400, position: [40, 30, 50] }} gl={{ antialias: true, preserveDrawingBuffer: true }}
          onPointerMissed={(e) => { if (e.type === "click") s.select(null); }}>
          <Environment />
          <HouseScene topView={topView} />
          <CameraRig onTopView={setTopView} compassRef={compassRef} />
        </Canvas>

        {/* header */}
        <div className="pointer-events-none absolute left-3 top-3">
          <div className="text-sm font-semibold text-slate-900 drop-shadow-sm dark:text-white">บ้านพักอาศัย คสล. 2 ชั้น · {building.grids.x.find((g) => g.name === "5")!.pos.toFixed(2)} × {(building.grids.y.find((g) => g.name === "F")!.pos - building.grids.y.find((g) => g.name === "A")!.pos).toFixed(2)} ม. (grid)</div>
          <div className="text-[11px] text-slate-700 dark:text-slate-300">ลากเพื่อหมุน · คลิกขวา/2 นิ้วเพื่อเลื่อน · ล้อ/ถ่างนิ้วเพื่อซูม · ดับเบิลคลิกพื้นเพื่อดูห้อง</div>
        </div>
        <RoomCard />

        {/* compass */}
        <div className="absolute right-3 top-3 flex flex-col items-center rounded-lg border border-border bg-card/90 px-2 py-1.5 text-[10px] shadow-sm" title="North from AR-07 (confirmed DEC-04)">
          <div ref={compassRef} className="size-10">
            <svg viewBox="-20 -20 40 40" className="size-10">
              <circle r="18" fill="none" stroke="currentColor" strokeOpacity={0.3} />
              <path d="M0,-16 L5,6 L0,2 L-5,6 Z" fill="#dc2626" />
            </svg>
          </div>
          <span className="font-semibold">N</span>
        </div>

        {/* status legend */}
        {s.colorMode === "status" && (
          <div className="absolute right-3 top-24 rounded-lg border border-border bg-card/90 p-2 text-[11px] shadow-sm">
            {(["verified", "unverified", "conflict"] as const).map((k) => (
              <div key={k} className="flex items-center justify-between gap-3"><StatusBadge status={k} /><span className="tabular">{c[k]}</span></div>
            ))}
          </div>
        )}

        {/* bottom bar: camera presets or room bar */}
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-2 p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          {!roomBar ? (
            <>
              <button className={cn(pill, "bg-sky-500/90 text-slate-950")} onClick={() => setRoomBar(true)}>ชื่อห้อง</button>
              {Object.entries(PRESETS).map(([k, p]) => (
                <button key={k} className={pill} onClick={() => { s.setFocusRoom(null); s.requestCamera(p.preset); }}>{p.label}</button>
              ))}
              <button className={pill} onClick={() => { s.setFocusRoom(null); s.select(null); s.requestCamera(HOME); }}>รีเซ็ต</button>
            </>
          ) : (
            <>
              <button className={cn(pill, "bg-sky-500/90 text-slate-950")} onClick={() => { setRoomBar(false); s.setFocusRoom(null); s.requestCamera(HOME); }}>ทั้งหลัง</button>
              {roomsInMode.map((r) => (
                <button key={r.id} className={cn(pill, s.focusRoomId === r.id && "bg-sky-400 text-slate-950")}
                  onClick={() => { s.select({ kind: "room", id: r.id }); s.setFocusRoom(s.focusRoomId === r.id ? null : r.id); }}>
                  {r.name}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
      <DetailsPanel
        className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card p-3 lg:flex"
        selection={s.selection}
        onClear={() => s.select(null)}
        onOpenSheet={(sheet) => { setSheet(sheet); router.push("/verify"); }}
      />
    </div>
  );
}
