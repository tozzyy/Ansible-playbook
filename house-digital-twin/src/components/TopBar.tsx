"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, FileCheck2, Home, Layers, Maximize, Ruler, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/verify", label: "2D Verify", icon: Layers },
  { href: "/report", label: "Report", icon: FileCheck2 },
];
// Phase 2-3 tools: shown but disabled until geometry is approved.
const LATER = [
  { label: "3D", icon: Box },
  { label: "Section", icon: Scissors },
  { label: "Measure", icon: Ruler },
];

export function TopBar() {
  const path = usePathname();
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-card px-3">
      <span className="mr-3 text-sm font-semibold">House Digital Twin</span>
      <span className="mr-2 hidden rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline">Phase 1 · Geometry verification</span>
      <nav className="flex items-center gap-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm hover:bg-muted [&_svg]:size-4",
              path === href && "bg-muted font-medium",
            )}
          >
            <Icon />
            <span className="hidden md:inline">{label}</span>
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        {LATER.map(({ label, icon: Icon }) => (
          <button key={label} disabled title={`${label} – Phase 2/3 (after geometry approval)`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground opacity-50 [&_svg]:size-4">
            <Icon /><span className="hidden lg:inline">{label}</span>
          </button>
        ))}
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
