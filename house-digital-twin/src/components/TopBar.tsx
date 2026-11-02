"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Maximize, RotateCcw, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { useViewerStore } from "@/lib/viewerStore";

const btn = "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-muted [&_svg]:size-4";

export function TopBar() {
  const path = usePathname();
  const router = useRouter();
  const { tool, setTool, resetView } = useViewerStore();
  const goHome = () => { if (path !== "/") router.push("/"); };
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-card px-2 sm:px-3">
      <Link href="/" className={cn(btn, "font-semibold")} title="หน้าแรก"><Home /><span>บ้านพักอาศัย คสล. 2 ชั้น</span></Link>
      <div className="ml-auto flex items-center gap-0.5">
        <button title="วัดระยะ (M)" className={cn(btn, tool === "measure" && path === "/" && "bg-red-500/15 text-red-600")}
          onClick={() => { setTool(tool === "measure" ? "orbit" : "measure"); goHome(); }}>
          <Ruler /><span className="hidden sm:inline">วัดระยะ</span>
        </button>
        <button title="รีเซ็ตมุมมอง (R)" className={btn} onClick={() => { resetView(); goHome(); }}>
          <RotateCcw /><span className="hidden sm:inline">รีเซ็ต</span>
        </button>
        <button title="เต็มจอ"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted [&_svg]:size-4">
          <Maximize />
        </button>
      </div>
    </header>
  );
}
