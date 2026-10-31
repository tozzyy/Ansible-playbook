"use client";
import { building, floors, issueById, openingType, OVERLAY_SHEETS } from "@/lib/data";
import { useVerifyStore } from "@/lib/store";
import { StatusBadge } from "@/components/ui/badge";
import { fmt, fmtLevel } from "@/lib/utils";
import type { SourceRef, VerificationStatus } from "@/types/geometry";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1 text-xs last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular text-right">{v}</span>
    </div>
  );
}

function Sources({ sources }: { sources: SourceRef[] }) {
  const setSheet = useVerifyStore((s) => s.setSheet);
  return (
    <div className="mt-3">
      <h5 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Source drawing</h5>
      <ul className="flex flex-col gap-1">
        {sources.map((s, i) => {
          const overlay = OVERLAY_SHEETS.some((o) => o.sheet === s.sheet);
          return (
            <li key={i} className="rounded border border-border px-2 py-1 text-xs">
              <span className="font-medium">{s.sheet}</span> · PDF page {s.pdfPage}
              {overlay && (
                <button className="ml-2 text-[11px] text-primary underline" onClick={() => setSheet(s.sheet)}>open</button>
              )}
              {s.note && <div className="text-[11px] text-muted-foreground">{s.note}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Issues({ ids }: { ids: string[] }) {
  if (!ids?.length) return null;
  return (
    <div className="mt-3">
      <h5 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Issues</h5>
      <ul className="flex flex-col gap-1.5">
        {ids.map((id) => {
          const i = issueById(id);
          if (!i) return null;
          const st: VerificationStatus = i.type === "conflict" ? "conflict" : i.type === "unverified" ? "unverified" : "verified";
          return (
            <li key={id} className="rounded border border-border p-2 text-xs">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-[11px]">{id}</span>
                {i.type === "info" ? <span className="text-[11px] text-muted-foreground">info</span> : <StatusBadge status={st} />}
              </div>
              <div className="font-medium">{i.title}</div>
              {i.values?.map((v, k) => (
                <div key={k} className="mt-0.5 text-[11px]"><code>{v.value}</code> — {v.sheet} p.{v.pdfPage}</div>
              ))}
              {i.detail && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{i.detail}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FieldStatus({ fs }: { fs: Record<string, VerificationStatus> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {Object.entries(fs).map(([k, v]) => (
        <span key={k} className="flex items-center gap-1 text-[11px]"><span className="text-muted-foreground">{k}</span><StatusBadge status={v} /></span>
      ))}
    </div>
  );
}

export function DetailsPanel() {
  const sel = useVerifyStore((s) => s.selection);
  const select = useVerifyStore((s) => s.select);

  let body: React.ReactNode = (
    <div className="text-xs text-muted-foreground">
      <p className="mb-2">Click a room, wall, opening, column, stair or grid line on the drawing to inspect its data, verification status and source sheet.</p>
      <p>Geometry is in metres from grid 1 × A&apos;. Compare the coloured overlay with the PDF lines underneath; use the opacity sliders to fade either layer.</p>
    </div>
  );

  if (sel?.kind === "room") {
    const r = floors.flatMap((f) => f.rooms).find((x) => x.id === sel.id);
    if (r) body = (
      <>
        <Title name={r.name} sub={`${r.nameEn} · ${r.id}`} status={r.status} />
        <FieldStatus fs={r.fieldStatus} />
        <div className="mt-3">
          <Row k="Area (centre-lines)" v={`${fmt(r.area)} m²`} />
          <Row k="Extents X × Y" v={`${fmt(r.bbox.x)} × ${fmt(r.bbox.y)} m`} />
          <Row k="Floor level (F)" v={`${fmtLevel(r.floorElevation)} · ${r.finish.floor ?? "–"}`} />
          <Row k="Ceiling height (C)" v={r.ceilingHeight != null ? `${fmt(r.ceilingHeight)} m · ${r.finish.ceiling}` : "–"} />
          <Row k="Ceiling level (abs)" v={fmtLevel(r.ceilingLevel)} />
          <Row k="Finish codes" v={<span className="text-unverified">undefined in set (ISS-01)</span>} />
        </div>
        {r.note && <p className="mt-2 text-xs text-muted-foreground">{r.note}</p>}
        <Sources sources={r.sources} />
        <Issues ids={r.issues} />
      </>
    );
  } else if (sel?.kind === "wall") {
    const w = floors.flatMap((f) => f.walls).find((x) => x.id === sel.id);
    if (w) body = (
      <>
        <Title name={`Wall ${w.id}`} sub={w.axis === "h" ? "along X" : "along Y"} status={w.status} />
        <FieldStatus fs={w.fieldStatus} />
        <div className="mt-3">
          <Row k="Start (x, y)" v={`${fmt(w.start[0], 3)}, ${fmt(w.start[1], 3)}`} />
          <Row k="End (x, y)" v={`${fmt(w.end[0], 3)}, ${fmt(w.end[1], 3)}`} />
          <Row k="Length" v={`${fmt(Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]))} m`} />
          <Row k="Thickness" v={`${fmt(w.thickness)} m`} />
          <Row k="Base / height" v={`${fmtLevel(w.baseElevation)} / ${fmt(w.height)} m`} />
          <Row k="Hatch spans" v={w.hatchSpans.length ? w.hatchSpans.map(([a, b]) => `${a.toFixed(2)}–${b.toFixed(2)}`).join(", ") : "none (drawn line only)"} />
        </div>
        {w.note && <p className="mt-2 text-xs text-muted-foreground">{w.note}</p>}
        <Sources sources={w.sources} />
        <Issues ids={w.issues} />
      </>
    );
  } else if (sel?.kind === "opening") {
    const o = floors.flatMap((f) => f.openings).find((x) => x.id === sel.id);
    const t = o && openingType(o.typeCode);
    if (o && t) body = (
      <>
        <Title name={`${o.typeCode} · ${o.kind}`} sub={`${o.id} on ${o.wallId}`} status={o.status} />
        <FieldStatus fs={o.fieldStatus} />
        <div className="mt-3">
          <Row k="Description" v={t.description} />
          <Row k="Table size (H × W)" v={t.tableSize ?? "illegible"} />
          <Row k="Width (frame)" v={`${fmt(o.width)} m`} />
          <Row k="Height" v={`${fmt(o.height)} m`} />
          <Row k="Sill" v={`${fmt(o.sillHeight ?? 0)} m${t.sillDatum ? ` (${t.sillDatum})` : ""}`} />
          <Row k="Plan clear gap" v={o.measuredGap != null ? `${fmt(o.measuredGap)} m` : "–"} />
          <Row k="Centre along wall" v={`${fmt(o.center, 3)} m`} />
          <Row k="Schedule qty" v={t.qty ?? "–"} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{o.note}</p>
        <Sources sources={o.sources} />
        <Issues ids={o.issues} />
      </>
    );
  } else if (sel?.kind === "column") {
    const c = building.columns.find((x) => x.id === sel.id);
    if (c) body = (
      <>
        <Title name={`Column ${c.id}`} sub={c.grid ? `grid ${c.grid}` : "off-grid"} status={c.status} />
        <div className="mt-3">
          <Row k="Centre (x, y)" v={`${fmt(c.x, 3)}, ${fmt(c.y, 3)}`} />
          <Row k="Size" v="0.20 × 0.20 m" />
          {Object.entries(c.shownOn).map(([s, v]) => <Row key={s} k={`Shown on ${s}`} v={v ? "yes" : <span className="text-conflict">no</span>} />)}
        </div>
        <Sources sources={c.sources} />
        <Issues ids={c.issues} />
      </>
    );
  } else if (sel?.kind === "stair") {
    const s = floors.flatMap((f) => f.stairs).find((x) => x.id === sel.id);
    if (s) body = (
      <>
        <Title name={s.name} sub={s.id} status={s.status} />
        <div className="mt-3">
          <Row k="Levels" v={`${fmtLevel(s.fromLevel)} → ${fmtLevel(s.toLevel)}`} />
          <Row k="Risers" v={`${s.risers} × ${s.riser} = ${fmt(s.risers * s.riser)} m`} />
          <Row k="Tread" v={`${s.tread} m (9 per flight)`} />
          {s.flights.map((f) => <Row key={f.id} k={`Flight ${f.risers[0]}–${f.risers[1]}`} v={`x ${f.x[0]}–${f.x[1]}, y ${f.yStart}→${f.yEnd}`} />)}
          <Row k="Landing" v={<span>{fmtLevel(s.landing.z)} (label {s.landing.labelValue}) <StatusBadge status={s.landing.status} /></span>} />
        </div>
        <Sources sources={s.sources} />
        <Issues ids={s.landing.issues} />
      </>
    );
  } else if (sel?.kind === "grid") {
    const [ax, name] = [sel.id.slice(0, 1), sel.id.slice(2)];
    const g = (ax === "x" ? building.grids.x : building.grids.y).find((x) => x.name === name);
    if (g) body = (
      <>
        <Title name={`Grid ${g.name}`} sub={ax === "x" ? "numeric grid (X)" : "letter grid (Y)"} status={g.status} />
        <div className="mt-3">
          <Row k="Position" v={`${fmt(g.pos, 3)} m`} />
          {g.aliases && <Row k="Also labelled" v={g.aliases.join(", ")} />}
          {Object.entries(g.detectedOn).map(([s, v]) => <Row key={s} k={`Line on ${s}`} v={v ? "detected" : "bubble only / not drawn"} />)}
        </div>
        <Sources sources={g.sources} />
        <Issues ids={g.issues ?? []} />
      </>
    );
  } else if (sel?.kind === "area") {
    const a = floors.flatMap((f) => [...f.voids, ...f.slabs]).find((x) => x.id === sel.id);
    if (a) body = (
      <>
        <Title name={a.name} sub={a.id} status={a.status} />
        {a.z != null && <Row k="Level" v={fmtLevel(a.z)} />}
        {a.note && <p className="mt-2 text-xs text-muted-foreground">{a.note}</p>}
        <Sources sources={a.sources} />
      </>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Details</h4>
        {sel && <button className="text-[11px] text-primary underline" onClick={() => select(null)}>clear</button>}
      </div>
      {body}
    </aside>
  );
}

function Title({ name, sub, status }: { name: string; sub: string; status: VerificationStatus }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="text-base font-semibold leading-tight">{name}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}
