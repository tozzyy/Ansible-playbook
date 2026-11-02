"use client";
/** Dollhouse view: one horizontal clipping plane DOLLHOUSE_CUT above the floor being viewed. */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { DOLLHOUSE_CUT, useViewerStore } from "@/lib/viewerStore";
import { floorLevel } from "@/lib/model";
import { setDoubleSided } from "./HouseScene";

export function SectionTool() {
  const gl = useThree((s) => s.gl);
  const { viewMode, floorMode, focusRoomId } = useViewerStore();
  const plane = useMemo(() => {
    const room = focusRoomId?.startsWith("F2") ? "F2" : focusRoomId ? "F1" : null;
    if (viewMode !== "interior" && !room) return null;
    const fl = room ?? (floorMode === "F2" ? "F2" : "F1");
    return new THREE.Plane(new THREE.Vector3(0, -1, 0), floorLevel(fl) + DOLLHOUSE_CUT); // keeps y <= cut
  }, [viewMode, floorMode, focusRoomId]);

  useEffect(() => {
    gl.clippingPlanes = plane ? [plane] : [];
    setDoubleSided(!!plane);
    return () => { gl.clippingPlanes = []; };
  }, [gl, plane]);
  return null;
}
