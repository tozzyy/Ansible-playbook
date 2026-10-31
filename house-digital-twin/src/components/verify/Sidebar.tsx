"use client";
import { building, counts, floorById, OVERLAY_SHEETS, STATUS_COLOR } from "@/lib/data";
import { LAYER_LABELS, useVerifyStore, type LayerKey } from "@/lib/store";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { StatusBadge } from "@/components/ui/badge";
import type { Room, VerificationStatus } from "@/types/geometry";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-3 py-3">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

const roomBBox = (r: Room): [number, number, number, number] => {
  const xs = r.polygon.map((p) => p[0]), ys = r.polygon.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

export function Sidebar() {
  const s = useVerifyStore();
  const floorId = OVERLAY_SHEETS.find((o) => o.sheet === s.sheet)!.floorId;
  const floor = floorById(floorId);
  const all = [...floor.walls, ...floor.rooms, ...floor.openings];
  const c = counts(all);

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border bg-card text-sm">
      <Section title="Drawing sheet / floor">
        <div className="flex flex-col gap-1">
          {OVERLAY_SHEETS.map((o) => (
            <button
              key={o.sheet}
              onClick={() => s.setSheet(o.sheet)}
              className={`rounded-md border px-2 py-1.5 text-left text-xs ${s.sheet === o.sheet ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted"}`}
            >
              {o.label}
              <span className="block text-[10px] text-muted-foreground">overlay: {floorById(o.floorId).name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Opacity">
        <label className="mb-1 flex justify-between text-xs"><span>PDF sheet</span><span className="tabular">{Math.round(s.pdfOpacity * 100)}%</span></label>
        <Slider value={s.pdfOpacity} onChange={s.setPdfOpacity} label="PDF opacity" />
        <label className="mb-1 mt-3 flex justify-between text-xs"><span>Geometry</span><span className="tabular">{Math.round(s.geomOpacity * 100)}%</span></label>
        <Slider value={s.geomOpacity} onChange={s.setGeomOpacity} label="Geometry opacity" />
      </Section>

      <Section title="Layers">
        <div className="flex flex-col gap-1.5">
          {(Object.keys(LAYER_LABELS) as LayerKey[]).map((k) => (
            <Checkbox key={k} checked={s.layers[k]} onChange={() => s.toggleLayer(k)} label={LAYER_LABELS[k]} />
          ))}
        </div>
      </Section>

      <Section title="Verification status">
        <div className="flex flex-col gap-1.5">
          {(["verified", "unverified", "conflict"] as VerificationStatus[]).map((st) => (
            <Checkbox
              key={st}
              checked={s.statusFilter[st]}
              onChange={() => s.toggleStatus(st)}
              label={
                <span className="flex items-center gap-2">
                  <span className="inline-block size-2.5 rounded-sm" style={{ background: STATUS_COLOR[st] }} />
                  <span className="capitalize">{st}</span>
                  <span className="tabular text-xs text-muted-foreground">({c[st]})</span>
                </span>
              }
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">Counts = walls + rooms + openings on {floor.name}. Dashed room outline = boundary not drawn as a wall.</p>
      </Section>

      <Section title={`Room explorer · ${floor.name}`}>
        <ul className="flex flex-col">
          {floor.rooms.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => { s.select({ kind: "room", id: r.id }); s.focusOn(roomBBox(r)); }}
                className={`flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted ${s.selection?.kind === "room" && s.selection.id === r.id ? "bg-muted font-medium" : ""}`}
              >
                <span className="truncate">{r.name}</span>
                <StatusBadge status={r.status} />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Legend">
        <ul className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <li>Room fill = polygon status (levels → details panel)</li>
          <li>Wall fill = position status, outline = overall status</li>
          <li>White box = door · blue box = window (label = AR-26/27 type)</li>
          <li>Purple outline = hatch span measured from the PDF</li>
          <li>Blue X = void (โล่ง) · grey dashed = slab / unassigned space</li>
          <li>Mouse: wheel = zoom, drag = pan, click = inspect</li>
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">{building.columns.length} columns cross-checked on AR-08 / AR-09 / ST-04.</p>
      </Section>
    </aside>
  );
}
