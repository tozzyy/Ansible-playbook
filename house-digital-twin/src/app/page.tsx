import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { building, counts, floors } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";

const PHASES = [
  { n: 1, title: "Floor plan extraction", items: ["Vector extraction of AR-08 / AR-09 / ST-04", "Geometry JSON per floor", "2D verification overlay", "Verification report", "Owner decisions DEC-01…04"], state: "done" },
  { n: 2, title: "Basic 3D model", items: ["Floors, walls, doors, windows, stairs from Geometry JSON", "Spring camera presets, room focus, exploded floors"], state: "review" },
  { n: 3, title: "Interactive viewer", items: ["Camera controls, floor switching, room selection, layers"], state: "blocked" },
  { n: 4, title: "Architectural appearance", items: ["Materials (AR-02 / elevations), lighting, roof (AR-10)"], state: "blocked" },
  { n: 5, title: "Infrastructure planning", items: ["Network / CCTV / Wi-Fi layers, EE-02…EE-05 device import"], state: "blocked" },
];

export default function Home() {
  const rows = floors.map((f) => ({ f, walls: counts(f.walls), rooms: counts(f.rooms), openings: counts(f.openings) }));
  const ic = { conflict: 0, unverified: 0, info: 0, resolved: 0 };
  building.issues.forEach((i) => (i.resolution ? ic.resolved++ : ic[i.type]++));
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="text-xl font-semibold">Interactive 3D House Digital Twin</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        RC 2-storey residence, built from the construction drawings only. Phase 1 geometry is approved (owner decisions DEC-01…04);
        the Phase 2 3D model is generated from that geometry and is ready for review.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {rows.map(({ f, walls, rooms, openings }) => (
          <Card key={f.floorId}>
            <CardHeader><CardTitle>{f.name} · {f.sheet}</CardTitle></CardHeader>
            <CardContent className="text-xs">
              {([["Rooms", rooms, f.rooms.length], ["Walls", walls, f.walls.length], ["Openings", openings, f.openings.length]] as const).map(([k, c, n]) => (
                <div key={k} className="flex items-center justify-between border-b border-border/60 py-1 last:border-0">
                  <span>{k} <span className="text-muted-foreground">({n})</span></span>
                  <span className="tabular flex gap-2">
                    <span className="text-verified">{c.verified}✓</span>
                    <span className="text-unverified">{c.unverified}?</span>
                    <span className="text-conflict">{c.conflict}✗</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader><CardTitle>Issues register</CardTitle></CardHeader>
          <CardContent className="text-xs">
            <div className="flex justify-between py-1"><span>Open conflicts</span><StatusBadge status="conflict" /> <span className="tabular">{ic.conflict}</span></div>
            <div className="flex justify-between py-1"><span>Open unverified</span><StatusBadge status="unverified" /> <span className="tabular">{ic.unverified}</span></div>
            <div className="flex justify-between py-1"><span>Resolved by decision</span><StatusBadge status="verified" /> <span className="tabular">{ic.resolved}</span></div>
            <div className="flex justify-between py-1"><span>Info notes</span><span /> <span className="tabular">{ic.info}</span></div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/3d" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Open 3D viewer <ArrowRight className="size-4" /></Link>
        <Link href="/verify" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm">2D verification overlay</Link>
        <Link href="/report" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm">Geometry verification report</Link>
      </div>

      <h2 className="mt-8 text-sm font-semibold">Workflow</h2>
      <ol className="mt-2 grid gap-2 md:grid-cols-5">
        {PHASES.map((p) => (
          <li key={p.n} className={`rounded-lg border p-3 text-xs ${p.state === "review" ? "border-primary bg-primary/5" : p.state === "done" ? "border-verified/40 bg-card" : "border-border bg-card opacity-70"}`}>
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              {p.state === "done" ? <CheckCircle2 className="size-4 text-verified" /> : p.state === "review" ? <CheckCircle2 className="size-4 text-primary" /> : <Circle className="size-4" />}
              Phase {p.n}
            </div>
            <div className="mb-1 font-medium">{p.title}</div>
            <ul className="list-disc pl-4 text-muted-foreground">{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
            <div className="mt-2 text-[11px]">{p.state === "done" ? "Approved" : p.state === "review" ? "Awaiting your review" : "Starts after Phase 2 review"}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
