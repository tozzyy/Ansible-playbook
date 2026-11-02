"use client";
/**
 * Section View: one global clipping plane (applies to every mesh).
 *  - plan  : horizontal cut `pos` m above the active floor (architectural plan cut, default 1.20 m)
 *  - A-A/B-B: vertical planes at the cut lines measured on AR-08 (compare with AR-11 / AR-12)
 *  - x / y : free vertical planes
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { useViewerStore } from "@/lib/viewerStore";
import { floorLevel, sectionLine } from "@/lib/model";
import { setDoubleSided } from "./HouseScene";

/** Plane in world coords + a visual outline, or null when off. */
export function useSectionPlane() {
  const { section, floorMode } = useViewerStore();
  return useMemo(() => {
    const { mode, pos, flip } = section;
    if (mode === "off") return null;
    const s = flip ? -1 : 1;
    if (mode === "plan") {
      const h = floorLevel(floorMode === "F2" ? "F2" : "F1") + pos;
      // keep y <= h
      return { plane: new THREE.Plane(new THREE.Vector3(0, -1, 0), h), axis: "plan" as const, at: h };
    }
    const line = mode === "A-A" || mode === "B-B" ? sectionLine(mode) : null;
    const axis = line ? line.axis : mode; // "x" -> plane x = at, "y" -> plane (world z) = at
    const at = line ? line.pos : pos;
    const n = axis === "x" ? new THREE.Vector3(-s, 0, 0) : new THREE.Vector3(0, 0, -s);
    return { plane: new THREE.Plane(n, s * at), axis, at };
  }, [section, floorMode]);
}

export function SectionTool() {
  const gl = useThree((s) => s.gl);
  const sp = useSectionPlane();

  useEffect(() => {
    gl.clippingPlanes = sp ? [sp.plane] : [];
    setDoubleSided(!!sp);
    return () => { gl.clippingPlanes = []; };
  }, [gl, sp]);

  if (!sp) return null;
  // outline of the cut plane (drawn a hair inside the kept side so it is not clipped itself)
  const e = 0.01;
  let pts: [number, number, number][];
  if (sp.axis === "plan") {
    const y = sp.at - e;
    pts = [[-2, y, -2], [19, y, -2], [19, y, 28.5], [-2, y, 28.5], [-2, y, -2]];
  } else if (sp.axis === "x") {
    const x = sp.at - e * Math.sign(-sp.plane.normal.x || 1);
    pts = [[x, 0, -2], [x, 0, 28.5], [x, 9, 28.5], [x, 9, -2], [x, 0, -2]];
  } else {
    const z = sp.at - e * Math.sign(-sp.plane.normal.z || 1);
    pts = [[-2, 0, z], [19, 0, z], [19, 9, z], [-2, 9, z], [-2, 0, z]];
  }
  return <Line points={pts} color="#ef4444" lineWidth={2} dashed dashSize={0.5} gapSize={0.25} />;
}
