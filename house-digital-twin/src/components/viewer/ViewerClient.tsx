"use client";
import dynamic from "next/dynamic";

// WebGL needs the browser - never render the canvas on the server.
const Viewer3D = dynamic(() => import("./Viewer3D").then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">กำลังโหลดโมเดล 3D…</div>,
});

export function ViewerClient() {
  return <Viewer3D />;
}
