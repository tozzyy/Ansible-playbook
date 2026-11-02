"use client";
import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { floors } from "@/lib/data";
import { PRESETS, HOME, roomBounds, roomPreset } from "@/lib/model";
import { TOGGLE_LABELS, useViewerStore, type FloorMode, type ViewToggle } from "@/lib/viewerStore";
import { HouseScene, Environment } from "./HouseScene";
import { CameraRig } from "./CameraRig";
import { SectionTool } from "./SectionTool";
import { MeasureTool } from "./MeasureTool";
import { Exterior } from "./Exterior";
import { Checkbox } from "@/components/ui/checkbox";
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

const seg = (on: boolean) => cn("rounded-md border px-2 py-1.5 text-xs", on ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted");

function SidebarContent() {
  const s = useViewerStore();
  const list = floors.filter((f) => s.floorMode === "all" || f.floorId === s.floorMode);
  return (
    <>
      <Section title="มุมมอง">
        <div className="grid grid-cols-2 gap-1">
          <button className={seg(s.viewMode === "exterior")} onClick={() => { s.setViewMode("exterior"); s.requestCamera(HOME); }}>ภายนอก</button>
          <button className={seg(s.viewMode === "interior")} onClick={() => { s.setViewMode("interior"); s.requestCamera(PRESETS.dollhouse.preset); }}>ภายใน</button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {FLOOR_MODES.map((m) => <button key={m.id} className={seg(s.floorMode === m.id)} onClick={() => s.setFloorMode(m.id)}>{m.label}</button>)}
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          {(Object.keys(TOGGLE_LABELS) as ViewToggle[]).map((k) => (
            <Checkbox key={k} checked={s.show[k]} onChange={() => s.toggle(k)} label={TOGGLE_LABELS[k]} />
          ))}
        </div>
      </Section>
      <Section title="ห้อง">
        {list.map((f) => (
          <div key={f.floorId} className="mb-2">
            <div className="mb-1 text-[11px] text-muted-foreground">{f.name}</div>
            <ul>
              {f.rooms.map((r) => (
                <li key={r.id}>
                  <button onClick={() => { s.select({ kind: "room", id: r.id }); s.setFocusRoom(r.id); }}
                    className={cn("w-full truncate rounded px-1.5 py-1 text-left text-xs hover:bg-muted", s.focusRoomId === r.id && "bg-muted font-medium")}>
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>
      <p className="px-3 py-3 text-[11px] text-muted-foreground">ลากเพื่อหมุน · คลิกขวา/2 นิ้วเพื่อเลื่อน · ล้อ/ถ่างนิ้วเพื่อซูม · ดับเบิลคลิกพื้นห้องเพื่อเข้าไปดู</p>
      <a href="/about" className="px-3 pb-3 text-[11px] text-muted-foreground underline">ข้อมูลแบบก่อสร้าง (สำหรับช่าง)</a>
    </>
  );
}

function RoomCard() {
  const { focusRoomId, selection, setFocusRoom, requestCamera, select } = useViewerStore();
  const id = focusRoomId ?? (selection?.kind === "room" ? selection.id : null);
  const r = floors.flatMap((f) => f.rooms).find((x) => x.id === id);
  if (!r) return null;
  const b = roomBounds(r);
  return (
    <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-6rem)] rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-xs text-white shadow backdrop-blur">
      <div className="text-sm font-semibold">{r.name}</div>
      <div className="tabular">
        {fmt(b.x1 - b.x0)} × {fmt(b.y1 - b.y0)} ม. · {fmt(r.area)} ตร.ม. · พื้น {fmtLevel(r.floorElevation)}
        {r.ceilingHeight != null && <> · ฝ้าสูง {fmt(r.ceilingHeight)} ม.</>}
      </div>
      <div className="mt-1 flex gap-3">
        {!focusRoomId && <button className="text-sky-300 underline" onClick={() => setFocusRoom(r.id)}>เข้าไปดูห้องนี้</button>}
        <button className="text-sky-300 underline" onClick={() => { setFocusRoom(null); select(null); requestCamera(HOME); }}>ดูทั้งบ้าน</button>
      </div>
    </div>
  );
}

function MeasureCard() {
  const { tool, measure, clearMeasure, setTool } = useViewerStore();
  if (tool !== "measure") return null;
  const a = measure.a, b = measure.b;
  const d = a && b ? Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]) : null;
  return (
    <div className="absolute left-3 top-3 z-10 w-64 max-w-[calc(100%-6rem)] rounded-xl border border-white/20 bg-slate-900/85 px-3 py-2 text-xs text-white shadow backdrop-blur">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold">วัดระยะ</span>
        <button className="text-sky-300 underline" onClick={() => setTool("orbit")}>ปิด</button>
      </div>
      {!a && <div className="text-slate-300">คลิกจุดแรก (จับมุมผนัง ขอบประตู หน้าต่าง อัตโนมัติ)</div>}
      {a && !b && <div className="text-slate-300">คลิกจุดที่สอง</div>}
      {d != null && (
        <>
          <div className="tabular text-base font-semibold">{d.toFixed(2)} ม.</div>
          <button className="mt-1 text-sky-300 underline" onClick={clearMeasure}>วัดใหม่</button>
        </>
      )}
    </div>
  );
}

function BottomSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[70%] flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl md:hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">มุมมอง · ห้อง</span>
        <button className="rounded-md px-2 py-1 text-sm hover:bg-muted" onClick={onClose}>ปิด ✕</button>
      </div>
      <div className="min-h-0 overflow-y-auto text-sm">{children}</div>
    </div>
  );
}

export function Viewer3D() {
  const s = useViewerStore();
  const compassRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState(false);

  // camera follows room focus
  useEffect(() => {
    const r = floors.flatMap((f) => f.rooms).find((x) => x.id === s.focusRoomId);
    if (r) s.requestCamera(roomPreset(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.focusRoomId]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) || e.metaKey || e.ctrlKey || e.altKey) return;
      const st = useViewerStore.getState();
      const k = e.key.toLowerCase();
      if (k === "r") st.resetView();
      else if (k === "t") st.requestCamera(PRESETS.top.preset);
      else if (k === "f") st.requestCamera(PRESETS.front.preset);
      else if (k === "m") st.setTool(st.tool === "measure" ? "orbit" : "measure");
      else if (k === "i") st.setViewMode(st.viewMode === "interior" ? "exterior" : "interior");
      else if (k === "1") st.setFloorMode("F1");
      else if (k === "2") st.setFloorMode("F2");
      else if (k === "0") st.setFloorMode("all");
      else if (k === "escape") {
        if (st.tool === "measure") st.setTool("orbit");
        else if (st.focusRoomId) { st.setFocusRoom(null); st.requestCamera(HOME); }
        else st.select(null);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pill = "shrink-0 whitespace-nowrap rounded-full border border-white/25 bg-slate-900/70 px-3.5 py-2 text-[13px] text-white shadow backdrop-blur hover:bg-slate-900/90";

  return (
    <div className="flex min-h-0 flex-1" style={{ height: "calc(100dvh - 3rem)" }}>
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-card text-sm md:flex"><SidebarContent /></aside>
      <div className="relative min-w-0 flex-1" style={{ background: "var(--canvas)" }}>
        <Canvas shadows="percentage" dpr={[1, 1.5]} camera={{ fov: 40, near: 0.1, far: 600, position: [40, 30, 50] }} gl={{ antialias: true, preserveDrawingBuffer: true }}
          onPointerMissed={(e) => { if (e.type === "click" && s.tool !== "measure") s.select(null); }}>
          <Environment />
          <HouseScene />
          <Exterior />
          <SectionTool />
          <MeasureTool />
          <CameraRig compassRef={compassRef} />
        </Canvas>

        {s.tool === "measure" ? <MeasureCard /> : <RoomCard />}
        {!s.focusRoomId && s.tool !== "measure" && s.selection?.kind !== "room" && (
          <button className="absolute left-3 top-3 z-10 rounded-full border border-white/25 bg-slate-900/75 px-3 py-1.5 text-xs text-white shadow md:hidden" onClick={() => setSheet(true)}>☰ มุมมอง / ห้อง</button>
        )}
        <BottomSheet open={sheet} onClose={() => setSheet(false)}><SidebarContent /></BottomSheet>

        <div className="absolute right-3 top-3 flex flex-col items-center rounded-lg border border-border bg-card/90 px-2 py-1.5 text-[10px] shadow-sm" title="ทิศเหนือ (AR-07)">
          <div ref={compassRef} className="size-9">
            <svg viewBox="-20 -20 40 40" className="size-9"><circle r="18" fill="none" stroke="currentColor" strokeOpacity={0.3} /><path d="M0,-16 L5,6 L0,2 L-5,6 Z" fill="#dc2626" /></svg>
          </div>
          <span className="font-semibold">N</span>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex gap-2 overflow-x-auto p-3 md:flex-wrap md:justify-center" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))", scrollbarWidth: "none" }}>
          {Object.entries(PRESETS).map(([k, p]) => (
            <button key={k} className={pill} onClick={() => {
              s.setFocusRoom(null);
              s.setViewMode(k === "dollhouse" ? "interior" : "exterior");
              s.requestCamera(p.preset);
            }}>{p.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
