import { building, counts, floors } from "@/lib/data";
import { StatusBadge } from "@/components/ui/badge";
import { fmt, fmtLevel } from "@/lib/utils";
import type { Issue, SourceRef, VerificationStatus } from "@/types/geometry";

export const metadata = { title: "Verification Report · House Digital Twin" };

const refs = (s: SourceRef[]) => s.map((x) => `${x.sheet} p.${x.pdfPage}`).join(", ");
const issueStatus = (i: Issue): VerificationStatus | null => (i.type === "conflict" ? "conflict" : i.type === "unverified" ? "unverified" : null);

function T({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted text-left">
          <tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/60 align-top">
              {r.map((c, j) => <td key={j} className="tabular px-2 py-1">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-2 mt-8 text-base font-semibold">{children}</h2>;

export default function ReportPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <h1 className="text-xl font-semibold">Geometry Verification Report — Phase 1</h1>
      <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
        Every element lists its source sheet and PDF page. <b>Verified</b> = measured from the PDF vectors / confirmed with no contradiction.
        <b> Unverified</b> = drawn but not measurable, or interpreted. <b>Conflict</b> = sheets disagree; all values are listed and none was chosen.
        The same content is generated as <code>docs/VERIFICATION_REPORT.md</code>.
      </p>

      <H>1. Summary</H>
      <T head={["Floor", "Element", "Total", "Verified", "Unverified", "Conflict"]}
        rows={floors.flatMap((f) => (["rooms", "walls", "openings"] as const).map((k) => {
          const c = counts(f[k]);
          return [f.floorId, k, f[k].length, c.verified, c.unverified, c.conflict];
        })).concat([["all", "columns", building.columns.length, ...Object.values(counts(building.columns))]])} />

      <H>2. Issues — conflicts and unverified items</H>
      <div className="grid gap-2 md:grid-cols-2">
        {[...building.issues].sort((a, b) => ["conflict", "unverified", "info"].indexOf(a.type) - ["conflict", "unverified", "info"].indexOf(b.type)).map((i) => {
          const st = issueStatus(i);
          return (
            <div key={i.id} className="rounded-lg border border-border bg-card p-3 text-xs">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono">{i.id}</span>
                {st ? <StatusBadge status={st} /> : <span className="text-muted-foreground">info</span>}
                <span className="font-medium">{i.title}</span>
              </div>
              {i.values?.map((v, k) => <div key={k}><code>{v.value}</code> — {v.sheet} (PDF p.{v.pdfPage})</div>)}
              {i.detail && <p className="mt-1 text-muted-foreground">{i.detail}</p>}
            </div>
          );
        })}
      </div>

      <H>3. Source drawing mapping</H>
      <T head={["Sheet", "PDF page", "Title", "Scale", "Phase", "Note"]}
        rows={building.sheets.sheets.map((s) => [s.sheet, s.pdfPage, s.title, s.scale ?? "–", s.phase, s.note ?? ""])} />

      <H>4. Levels</H>
      <T head={["Level", "Value", "Status", "Sources"]}
        rows={building.levels.map((l) => [l.name, l.values ? l.values.map((v) => `${fmtLevel(v.z)} (${v.sheet})`).join(" / ") : fmtLevel(l.z), <StatusBadge key="s" status={l.status} />, refs(l.sources)])} />

      <H>5. Grids</H>
      <T head={["Axis", "Grid", "Position (m)", "Line detected on", "Status"]}
        rows={(["x", "y"] as const).flatMap((ax) => building.grids[ax].map((g) => [ax.toUpperCase(), g.name, fmt(g.pos), Object.entries(g.detectedOn).map(([s, v]) => `${s}${v ? "✓" : "–"}`).join(" "), <StatusBadge key="s" status={g.status} />]))} />

      <H>6. Columns cross-check</H>
      <T head={["ID", "Grid", "X", "Y", "AR-08", "AR-09", "ST-04", "Status"]}
        rows={building.columns.map((c) => [c.id, c.grid ?? "–", fmt(c.x), fmt(c.y), c.shownOn["AR-08"] ? "✓" : "–", c.shownOn["AR-09"] ? "✓" : "–", c.shownOn["ST-04"] ? "✓" : "–", <StatusBadge key="s" status={c.status} />])} />

      {floors.map((f, n) => (
        <div key={f.floorId}>
          <H>{7 + n}. {f.name} — {f.sheet} (PDF p.{f.pdfPage})</H>
          <h3 className="mb-1 text-sm font-medium">Rooms</h3>
          <T head={["ID", "Room", "Area m²", "X × Y (m)", "Floor", "Ceiling (rel)", "polygon / floor / ceiling", "Status", "Sources", "Issues"]}
            rows={f.rooms.map((r) => [r.id, `${r.name} (${r.nameEn})`, fmt(r.area), `${fmt(r.bbox.x)} × ${fmt(r.bbox.y)}`, fmtLevel(r.floorElevation), fmt(r.ceilingHeight ?? null),
              <span key="f" className="flex gap-1">{Object.values(r.fieldStatus).map((s, i) => <StatusBadge key={i} status={s} />)}</span>,
              <StatusBadge key="s" status={r.status} />, refs(r.sources), r.issues.join(", ")])} />
          <h3 className="mb-1 mt-4 text-sm font-medium">Openings</h3>
          <T head={["ID", "Type", "Wall", "Centre", "W × H", "Sill", "Plan gap", "Status", "Issues"]}
            rows={f.openings.map((o) => [o.id, o.typeCode, o.wallId, fmt(o.center), `${fmt(o.width)} × ${fmt(o.height)}`, fmt(o.sillHeight ?? 0), fmt(o.measuredGap), <StatusBadge key="s" status={o.status} />, o.issues.join(", ")])} />
          <h3 className="mb-1 mt-4 text-sm font-medium">Walls</h3>
          <T head={["ID", "Start", "End", "Thk", "Base / H", "Hatch", "Status", "Note"]}
            rows={f.walls.map((w) => [w.id, `${fmt(w.start[0])}, ${fmt(w.start[1])}`, `${fmt(w.end[0])}, ${fmt(w.end[1])}`, fmt(w.thickness), `${fmtLevel(w.baseElevation)} / ${fmt(w.height)}`, w.hatchSpans.length ? "yes" : "no", <StatusBadge key="s" status={w.status} />, <span key="n" className="text-muted-foreground">{w.note}</span>])} />
        </div>
      ))}
    </div>
  );
}
