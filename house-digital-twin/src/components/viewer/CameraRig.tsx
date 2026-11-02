"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useViewerStore } from "@/lib/viewerStore";
import { HOME, northPlan } from "@/lib/model";

/** Critically damped spring (same family as Unity SmoothDamp). */
function damp(cur: number, goal: number, vel: { v: number }, smooth: number, dt: number) {
  const omega = 2 / smooth, x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - goal;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * exp;
  return goal + (change + temp) * exp;
}

type Props = { compassRef: React.RefObject<HTMLDivElement | null> };

export function CameraRig({ compassRef }: Props) {
  const { camera, size } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const camRequest = useViewerStore((s) => s.camRequest);

  const anim = useRef<null | { goal: number[]; cur: number[]; vel: { v: number }[] }>(null);
  const lastUser = useRef(performance.now());

  const startTo = (p: typeof HOME) => {
    const c = controls.current;
    if (!c) return;
    const off = camera.position.clone().sub(c.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    // shortest way round in azimuth
    let theta = p.theta;
    while (theta - sph.theta > Math.PI) theta -= 2 * Math.PI;
    while (theta - sph.theta < -Math.PI) theta += 2 * Math.PI;
    anim.current = {
      cur: [sph.theta, sph.phi, Math.log(sph.radius), c.target.x, c.target.y, c.target.z],
      goal: [theta, Math.max(p.phi, 0.001), Math.log(p.radius), ...p.target],
      vel: Array.from({ length: 6 }, () => ({ v: 0 })),
    };
  };

  // initial view
  useEffect(() => {
    const t = new THREE.Vector3(...HOME.target);
    camera.position.copy(t.clone().add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(HOME.radius * 1.4, 0.6, Math.PI / 3))));
    controls.current?.target.copy(t);
    controls.current?.update();
    startTo(HOME);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (camRequest) startTo(camRequest.preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camRequest]);

  const north = new THREE.Vector3(northPlan[0], 0, northPlan[1]);
  const a = new THREE.Vector3(), b = new THREE.Vector3();

  useFrame((_, rawDt) => {
    const c = controls.current;
    if (!c) return;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    const A = anim.current;
    if (A) {
      let done = true;
      A.cur = A.cur.map((v, i) => {
        const nv = damp(v, A.goal[i], A.vel[i], i < 3 ? 0.45 : 0.55, dt);
        if (Math.abs(nv - A.goal[i]) > 1e-3) done = false;
        return nv;
      });
      const [theta, phi, lr, tx, ty, tz] = A.cur;
      c.target.set(tx, ty, tz);
      camera.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(Math.exp(lr), phi, theta)));
      camera.lookAt(c.target);
      if (done) anim.current = null;
    }
    c.update();

    // compass: project the plan north vector to screen space
    if (compassRef.current) {
      a.copy(c.target).project(camera);
      b.copy(c.target).add(north).project(camera);
      const dx = (b.x - a.x) * size.width, dy = (b.y - a.y) * size.height;
      const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
      compassRef.current.style.transform = `rotate(${deg}deg)`;
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={3}
      maxDistance={90}
      maxPolarAngle={Math.PI / 2 - 0.02}
      autoRotateSpeed={0.6}
      onStart={() => { anim.current = null; lastUser.current = performance.now(); }}
      onEnd={() => { lastUser.current = performance.now(); }}
    />
  );
}
