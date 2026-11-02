"use client";
/** Point-to-point measurement (3D). Points snap to verified geometry (wall ends/faces, opening jambs, columns, grid, room corners). */
import { Html, Line } from "@react-three/drei";
import { useViewerStore } from "@/lib/viewerStore";

export function MeasureTool() {
  const { tool, measure } = useViewerStore();
  if (tool !== "measure" || !measure.a) return null;
  const a = measure.a.p, b = measure.b?.p;
  const d = b ? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) : 0;
  const marker = (p: [number, number, number], snapped: boolean, k: string) => (
    <mesh key={k} position={p} renderOrder={10}>
      <sphereGeometry args={[snapped ? 0.09 : 0.06, 16, 16]} />
      <meshBasicMaterial color={snapped ? "#f59e0b" : "#ef4444"} depthTest={false} />
    </mesh>
  );
  return (
    <group>
      {marker(a, !!measure.a.label, "a")}
      {b && marker(b, !!measure.b!.label, "b")}
      {b && (
        <>
          <Line points={[a, b]} color="#ef4444" lineWidth={2.5} depthTest={false} renderOrder={10} />
          <Html position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.25, (a[2] + b[2]) / 2]} center style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
            <div className="whitespace-nowrap rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white shadow">{d.toFixed(3)} ม.</div>
          </Html>
        </>
      )}
    </group>
  );
}
