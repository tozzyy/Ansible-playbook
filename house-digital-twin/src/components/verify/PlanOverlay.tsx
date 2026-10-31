"use client";
/**
 * 2D Verification Overlay
 * The SVG viewBox is in PDF points of the selected sheet, so the rendered sheet image
 * sits at (0,0)-(pageW,pageH) and geometry (metres) is drawn through the sheet calibration
 * transform translate(origin) scale(ptPerMetre). Both therefore share exactly one scale.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { building, floorById, OVERLAY_SHEETS, sheetByCode, STATUS_COLOR } from "@/lib/data";
import { useVerifyStore } from "@/lib/store";
import type { Opening, Room, Selection, Vec2, VerificationStatus, Wall } from "@/types/geometry";

const [PAGE_W, PAGE_H] = building.sheets.pageSizePt;
const EXTENT = { x0: -2, y0: -2, x1: 19, y1: 28.5 }; // metres - drawing area of interest

type VB = { x: number; y: number; w: number; h: number };

function wallRect(w: Wall, from?: number, to?: number, extra = 0): Vec2[] {
  const t = w.thickness / 2 + extra;
  if (w.axis === "h") {
    const a = from ?? w.start[0], b = to ?? w.end[0], y = w.start[1];
    return [[a, y - t], [b, y - t], [b, y + t], [a, y + t]];
  }
  const a = from ?? w.start[1], b = to ?? w.end[1], x = w.start[0];
  return [[x - t, a], [x + t, a], [x + t, b], [x - t, b]];
}
const pts = (p: Vec2[]) => p.map(([x, y]) => `${x},${y}`).join(" ");
const centroid = (p: Vec2[]): Vec2 => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
};
const sameSel = (a: Selection, b: Selection) => !!a && !!b && a.kind === b.kind && a.id === b.id;

export function PlanOverlay() {
  const { sheet, layers, pdfOpacity, geomOpacity, statusFilter, selection, select, setHover, focus } = useVerifyStore();
  const cal = sheetByCode(sheet)!.calibration!;
  const floor = floorById(OVERLAY_SHEETS.find((s) => s.sheet === sheet)!.floorId);
  const S = cal.ptPerMetre;
  const [ox, oy] = cal.originPt;
  const toPt = useCallback((x: number, y: number): Vec2 => [ox + x * S, oy + y * S], [ox, oy, S]);

  const svgRef = useRef<SVGSVGElement>(null);
  const fitVB = useCallback((): VB => {
    const [x0, y0] = toPt(EXTENT.x0, EXTENT.y0);
    const [x1, y1] = toPt(EXTENT.x1, EXTENT.y1);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }, [toPt]);
  const [vb, setVb] = useState<VB>(fitVB);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => { setVb(fitVB()); setImgOk(true); }, [sheet, fitVB]);

  // focus requests from room list / details panel
  useEffect(() => {
    if (!focus) return;
    const [a, b, c, d] = focus.rect;
    const [x0, y0] = toPt(a - 1.5, b - 1.5);
    const [x1, y1] = toPt(c + 1.5, d + 1.5);
    setVb({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }, [focus, toPt]);

  const clientToPt = (cx: number, cy: number): Vec2 => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    // preserveAspectRatio xMidYMid meet
    const scale = Math.min(r.width / vb.w, r.height / vb.h);
    const offX = (r.width - vb.w * scale) / 2, offY = (r.height - vb.h * scale) / 2;
    return [vb.x + (cx - r.left - offX) / scale, vb.y + (cy - r.top - offY) / scale];
  };

  const onWheel = (e: React.WheelEvent) => {
    const [px, py] = clientToPt(e.clientX, e.clientY);
    const k = Math.exp(e.deltaY * 0.0015);
    const w = Math.min(Math.max(vb.w * k, 20), PAGE_W * 1.5);
    const h = w * (vb.h / vb.w);
    setVb({ x: px - ((px - vb.x) * w) / vb.w, y: py - ((py - vb.y) * h) / vb.h, w, h });
  };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  const drag = useRef<{ x: number; y: number; vb: VB; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, vb, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const [px, py] = clientToPt(e.clientX, e.clientY);
    setHover([(px - ox) / S, (py - oy) / S]);
    const d = drag.current;
    if (!d) return;
    const r = svgRef.current!.getBoundingClientRect();
    const scale = Math.min(r.width / d.vb.w, r.height / d.vb.h);
    const dx = (e.clientX - d.x) / scale, dy = (e.clientY - d.y) / scale;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) {
      d.moved = true;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    if (d.moved) setVb({ ...d.vb, x: d.vb.x - dx, y: d.vb.y - dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const target = (e.target as Element).closest("[data-sel]") as HTMLElement | null;
      if (target) {
        const raw = target.dataset.sel!;
        const i = raw.indexOf(":");
        select({ kind: raw.slice(0, i), id: raw.slice(i + 1) } as Selection);
      } else select(null);
    }
  };

  const show = (s: VerificationStatus) => statusFilter[s];
  const col = (s: VerificationStatus) => STATUS_COLOR[s];
  const selStroke = "#2563eb";
  const isSel = (kind: string, id: string) => sameSel(selection, { kind, id } as Selection);

  // ------------------------------------------------------------------ layers
  const grid = useMemo(() => {
    const out: React.ReactNode[] = [];
    const { x0, y0, x1, y1 } = EXTENT;
    for (const g of building.grids.x) {
      if (!show(g.status)) continue;
      const c = col(g.status);
      out.push(
        <g key={"gx" + g.name} data-sel={`grid:x:${g.name}`} className="cursor-pointer">
          <line x1={g.pos} y1={y0 + 0.6} x2={g.pos} y2={y1} stroke={c} strokeWidth={isSel("grid", `x:${g.name}`) ? 2.5 : 0.8} strokeDasharray="6 3 1 3" vectorEffect="non-scaling-stroke" />
          <circle cx={g.pos} cy={y0 + 0.3} r={0.32} fill="var(--card)" stroke={c} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={g.pos} y={y0 + 0.4} fontSize={0.3} textAnchor="middle" fill={c} fontWeight={600}>{g.name}</text>
        </g>,
      );
    }
    for (const g of building.grids.y) {
      if (!show(g.status)) continue;
      const c = col(g.status);
      out.push(
        <g key={"gy" + g.name} data-sel={`grid:y:${g.name}`} className="cursor-pointer">
          <line x1={x0 + 0.6} y1={g.pos} x2={x1} y2={g.pos} stroke={c} strokeWidth={isSel("grid", `y:${g.name}`) ? 2.5 : 0.8} strokeDasharray="6 3 1 3" vectorEffect="non-scaling-stroke" />
          <circle cx={x0 + 0.3} cy={g.pos} r={0.32} fill="var(--card)" stroke={c} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={x0 + 0.3} y={g.pos + 0.1} fontSize={0.3} textAnchor="middle" fill={c} fontWeight={600}>{g.name}</text>
        </g>,
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, selection]);

  const roomEl = (r: Room) => {
    const [cx, cy] = centroid(r.polygon);
    const sel = isSel("room", r.id);
    return (
      <g key={r.id} data-sel={`room:${r.id}`} className="cursor-pointer">
        <polygon points={pts(r.polygon)} fill={col(r.fieldStatus.polygon)} fillOpacity={sel ? 0.35 : 0.12}
          stroke={sel ? selStroke : col(r.fieldStatus.polygon)} strokeWidth={sel ? 2.5 : 1} strokeDasharray={r.fieldStatus.polygon === "verified" ? undefined : "4 3"} vectorEffect="non-scaling-stroke" />
        {layers.labels && (
          <text x={cx} y={cy} fontSize={0.26} textAnchor="middle" fill="var(--foreground)" style={{ paintOrder: "stroke" }} stroke="var(--card)" strokeWidth={0.06}>
            <tspan x={cx} dy={-0.05}>{r.name}</tspan>
            <tspan x={cx} dy={0.32} fontSize={0.2}>{r.area.toFixed(1)} m²</tspan>
          </text>
        )}
      </g>
    );
  };

  const wallEl = (w: Wall) => {
    const sel = isSel("wall", w.id);
    return (
      <g key={w.id} data-sel={`wall:${w.id}`} className="cursor-pointer">
        <polygon points={pts(wallRect(w, undefined, undefined, 0.01))} fill={col(w.fieldStatus.position)} fillOpacity={0.55}
          stroke={sel ? selStroke : col(w.status)} strokeWidth={sel ? 2.5 : 0.6} vectorEffect="non-scaling-stroke" />
        <line x1={w.start[0]} y1={w.start[1]} x2={w.end[0]} y2={w.end[1]} stroke={sel ? selStroke : "#111827"} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        {layers.hatch && w.hatchSpans.map(([a, b], i) => (
          <polygon key={i} points={pts(wallRect({ ...w, thickness: w.thickness - 0.03 }, a, b))} fill="none" stroke="#7c3aed" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    );
  };

  const openingEl = (o: Opening) => {
    const w = floor.walls.find((x) => x.id === o.wallId)!;
    const s0 = w.axis === "h" ? w.start[0] : w.start[1];
    const a = s0 + o.offset, b = a + o.width;
    const sel = isSel("opening", o.id);
    const p = wallRect(w, a, b, 0.05);
    const [cx, cy] = centroid(p);
    const labelOff = 0.42;
    const [lx, ly] = w.axis === "h" ? [cx, cy - labelOff] : [cx + labelOff, cy];
    return (
      <g key={o.id} data-sel={`opening:${o.id}`} className="cursor-pointer">
        <polygon points={pts(p)} fill={o.kind === "door" ? "#ffffff" : "#dbeafe"} fillOpacity={0.9}
          stroke={sel ? selStroke : col(o.status)} strokeWidth={sel ? 3 : 1.6} vectorEffect="non-scaling-stroke" />
        {layers.labels && (
          <text x={lx} y={ly + 0.08} fontSize={0.22} textAnchor="middle" fill={col(o.status)} fontWeight={600}
            style={{ paintOrder: "stroke" }} stroke="var(--card)" strokeWidth={0.05}>{o.typeCode}</text>
        )}
      </g>
    );
  };

  const stairEls = floor.stairs.length ? floor.stairs : sheet === "AR-09" || sheet === "ST-04" ? floorById("F1").stairs : [];

  // ------------------------------------------------------------------ render
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "var(--canvas)" }}>
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { drag.current = null; setHover(null); }}
      >
        <rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill="#ffffff" />
        {layers.pdf && imgOk && (
          <image href={`/sheets/${sheet}.png`} x={0} y={0} width={PAGE_W} height={PAGE_H} opacity={pdfOpacity}
            preserveAspectRatio="none" onError={() => setImgOk(false)} style={{ imageRendering: "auto" }} />
        )}
        <g transform={`translate(${ox} ${oy}) scale(${S})`} opacity={geomOpacity}>
          {layers.areas && (
            <g>
              {floor.unassigned.map((u, i) => {
                const [a, b, c, d] = u.rect;
                return <rect key={i} x={a} y={b} width={c - a} height={d - b} fill="#64748b" fillOpacity={0.12} stroke="#64748b" strokeDasharray="2 2" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
              })}
              {[...floor.voids, ...floor.slabs].filter((v) => show(v.status)).map((v) => {
                const poly: Vec2[] = v.polygon ?? [[v.rect![0], v.rect![1]], [v.rect![2], v.rect![1]], [v.rect![2], v.rect![3]], [v.rect![0], v.rect![3]]];
                const sel = isSel("area", v.id);
                const isVoid = v.id.includes("-V");
                return (
                  <g key={v.id} data-sel={`area:${v.id}`} className="cursor-pointer">
                    <polygon points={pts(poly)} fill={isVoid ? "#0ea5e9" : "#94a3b8"} fillOpacity={0.1} stroke={sel ? selStroke : col(v.status)} strokeDasharray="6 4" strokeWidth={sel ? 2.5 : 1.2} vectorEffect="non-scaling-stroke" />
                    {isVoid && v.rect && (
                      <path d={`M${v.rect[0]},${v.rect[1]}L${v.rect[2]},${v.rect[3]}M${v.rect[2]},${v.rect[1]}L${v.rect[0]},${v.rect[3]}`} stroke="#0ea5e9" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                    )}
                  </g>
                );
              })}
            </g>
          )}
          {layers.rooms && floor.rooms.filter((r) => show(r.status)).map(roomEl)}
          {layers.grid && grid}
          {layers.stairs && stairEls.filter((s) => show(s.status)).map((s) => {
            const sel = isSel("stair", s.id);
            const L = s.landing.rect;
            return (
              <g key={s.id} data-sel={`stair:${s.id}`} className="cursor-pointer">
                {s.flights.map((f) => {
                  const n = f.risers[1] - f.risers[0];
                  const y0 = Math.min(f.yStart, f.yEnd), y1 = Math.max(f.yStart, f.yEnd);
                  return (
                    <g key={f.id}>
                      <rect x={f.x[0]} y={y0} width={f.x[1] - f.x[0]} height={y1 - y0} fill="#ffffff" fillOpacity={0.7} stroke={sel ? selStroke : col(s.status)} strokeWidth={sel ? 2.5 : 1.2} vectorEffect="non-scaling-stroke" />
                      {Array.from({ length: n }, (_, i) => y0 + i * s.tread).map((y, i) => (
                        <line key={i} x1={f.x[0]} x2={f.x[1]} y1={y} y2={y} stroke={col(s.status)} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                      ))}
                      <line x1={(f.x[0] + f.x[1]) / 2} x2={(f.x[0] + f.x[1]) / 2} y1={f.yStart} y2={f.yEnd} stroke="#334155" strokeWidth={1} markerEnd="url(#arrow)" vectorEffect="non-scaling-stroke" />
                    </g>
                  );
                })}
                <rect x={L[0]} y={L[1]} width={L[2] - L[0]} height={L[3] - L[1]} fill={col(s.landing.status)} fillOpacity={0.15} stroke={col(s.landing.status)} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          {layers.walls && floor.walls.filter((w) => show(w.status)).map(wallEl)}
          {layers.openings && floor.openings.filter((o) => show(o.status)).map(openingEl)}
          {layers.columns && building.columns.filter((c) => show(c.status)).map((c) => {
            const sel = isSel("column", c.id);
            return (
              <rect key={c.id} data-sel={`column:${c.id}`} className="cursor-pointer" x={c.x - 0.1} y={c.y - 0.1} width={0.2} height={0.2}
                fill={col(c.status)} fillOpacity={0.85} stroke={sel ? selStroke : "#111827"} strokeWidth={sel ? 3 : 0.8} vectorEffect="non-scaling-stroke" />
            );
          })}
        </g>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0L10,5L0,10z" fill="#334155" />
          </marker>
        </defs>
      </svg>

      {!imgOk && layers.pdf && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-unverified/50 bg-card px-3 py-2 text-xs shadow">
          Sheet image <code>/sheets/{sheet}.png</code> not found — run <code>npm run sheets -- /path/to/House-Phrae_Core+Infra_20p.pdf</code>
        </div>
      )}
      <NorthIndicator />
      <CanvasControls onFit={() => setVb(fitVB())} onZoom={(k) => setVb((v) => {
        const w = v.w * k, h = v.h * k;
        return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
      })} />
      <HoverReadout />
    </div>
  );
}

function NorthIndicator() {
  const deg = building.north.northClockwiseFromSheetUpDeg;
  return (
    <div className="absolute right-3 top-3 flex flex-col items-center rounded-md border border-border bg-card/90 px-2 py-1.5 text-[10px] shadow-sm" title={`North from AR-07 (${building.north.status}) – ${building.north.note}`}>
      <svg width="40" height="40" viewBox="-20 -20 40 40" style={{ transform: `rotate(${deg}deg)` }}>
        <circle r="18" fill="none" stroke="currentColor" strokeOpacity={0.3} />
        <path d="M0,-16 L5,6 L0,2 L-5,6 Z" fill="#dc2626" />
        <text y="-7" fontSize="7" textAnchor="middle" fill="#fff" fontWeight={700}>N</text>
      </svg>
      <span className="text-unverified">N {deg}° · derived</span>
    </div>
  );
}

function CanvasControls({ onFit, onZoom }: { onFit: () => void; onZoom: (k: number) => void }) {
  const b = "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-sm shadow-sm hover:bg-muted";
  return (
    <div className="absolute bottom-3 right-3 flex flex-col gap-1">
      <button className={b} onClick={() => onZoom(0.8)} title="Zoom in">+</button>
      <button className={b} onClick={() => onZoom(1.25)} title="Zoom out">−</button>
      <button className={b + " text-[10px]"} onClick={onFit} title="Fit building">Fit</button>
    </div>
  );
}

function HoverReadout() {
  const hover = useVerifyStore((s) => s.hover);
  if (!hover) return null;
  const [x, y] = hover;
  const near = (list: { name: string; pos: number }[], v: number) => {
    const g = list.reduce((a, b) => (Math.abs(b.pos - v) < Math.abs(a.pos - v) ? b : a));
    const d = v - g.pos;
    return `${g.name}${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`;
  };
  return (
    <div className="tabular pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-card/90 px-2 py-1 font-mono text-[11px] shadow-sm">
      X {x.toFixed(3)} m ({near(building.grids.x, x)}) · Y {y.toFixed(3)} m ({near(building.grids.y, y)})
    </div>
  );
}
