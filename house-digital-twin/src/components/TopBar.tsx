"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Box, FileCheck2, Home, Layers, Maximize, RotateCcw, Ruler, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { applySection, useViewerStore } from "@/lib/viewerStore";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/report", label: "Report", icon: FileCheck2 },
];

const btn = "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-muted [&_svg]:size-4";

export function TopBar() {
  const path = usePathname();
  const router = useRouter();
  const { tool, section, setTool, resetView } = useViewerStore();
  const go3d = () => { if (path !== "/3d") router.push("/3d"); };

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-card px-2 sm:px-3">
      <span className="mr-2 hidden text-sm font-semibold sm:inline">House Digital Twin</span>
      <span className="mr-1 hidden rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground lg:inline">Phase 3 · Interactive viewer</span>
      <nav className="flex items-center gap-1">
        <Link href="/" className={cn(btn, path === "/" && "bg-muted font-medium")} title="Home"><Home /><span className="hidden md:inline">Home</span></Link>
        {/* 2D / 3D toggle */}
        <div className="flex items-center rounded-md border border-border p-0.5">
          <Link href="/verify" className={cn("inline-flex h-7 items-center gap-1 rounded px-2 text-xs [&_svg]:size-3.5", path === "/verify" ? "bg-primary text-primary-foreground" : "hover:bg-muted")} title="2D verification overlay"><Layers />2D</Link>
          <Link href="/3d" className={cn("inline-flex h-7 items-center gap-1 rounded px-2 text-xs [&_svg]:size-3.5", path === "/3d" ? "bg-primary text-primary-foreground" : "hover:bg-muted")} title="3D viewer"><Box />3D</Link>
        </div>
        {NAV.slice(1).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn(btn, path === href && "bg-muted font-medium")} title={label}><Icon /><span className="hidden md:inline">{label}</span></Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-0.5">
        <button title="Section view (S)" className={cn(btn, section.mode !== "off" && path === "/3d" && "bg-red-500/15 text-red-600")}
          onClick={() => { applySection(section.mode === "off" ? "plan" : "off"); go3d(); }}>
          <Scissors /><span className="hidden lg:inline">Section</span>
        </button>
        <button title="Measurement tool (M)" className={cn(btn, tool === "measure" && path === "/3d" && "bg-red-500/15 text-red-600")}
          onClick={() => { setTool(tool === "measure" ? "orbit" : "measure"); go3d(); }}>
          <Ruler /><span className="hidden lg:inline">Measure</span>
        </button>
        <button title="Reset view (R)" className={btn} onClick={() => { resetView(); go3d(); }}>
          <RotateCcw /><span className="hidden lg:inline">Reset</span>
        </button>
        <button
          title="Full screen"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted [&_svg]:size-4"
        >
          <Maximize />
        </button>
      </div>
    </header>
  );
}
