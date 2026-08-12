"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh, Points } from "three";
import * as THREE from "three";

function Laptop({ reduceMotion }: { reduceMotion: boolean }) {
  const group = useRef<Group>(null);
  const scan = useRef<Mesh>(null);
  const pointCloud = useRef<Points>(null);
  const positions = useMemo(() => {
    const data = new Float32Array(114 * 3);
    let state = 912_783;
    const next = () => {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      return state / 4_294_967_296;
    };
    for (let index = 0; index < 114; index += 1) {
      data[index * 3] = (next() - 0.5) * 3.55;
      data[index * 3 + 1] = (next() - 0.5) * 2.15 + 0.1;
      data[index * 3 + 2] = (next() - 0.5) * 2.1;
    }
    return data;
  }, []);

  useFrame(({ clock }, delta) => {
    if (reduceMotion) return;
    const elapsed = clock.getElapsedTime();
    if (group.current) {
      group.current.position.y = Math.sin(elapsed * 0.72) * 0.08;
      group.current.rotation.y = -0.55 + Math.sin(elapsed * 0.24) * 0.08;
    }
    if (scan.current) scan.current.position.y = Math.sin(elapsed * 1.15) * 1.25;
    if (pointCloud.current) pointCloud.current.rotation.y -= delta * 0.025;
  });

  return (
    <group ref={group} rotation={[-0.12, -0.55, 0.02]}>
      <mesh position={[0, -0.83, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.45, 0.16, 2.15]} />
        <meshStandardMaterial
          color="#262e29"
          metalness={0.8}
          roughness={0.32}
        />
      </mesh>
      <mesh position={[0, -0.71, -0.08]} rotation={[-0.02, 0, 0]}>
        <boxGeometry args={[3.05, 0.018, 1.55]} />
        <meshStandardMaterial
          color="#0b0f0c"
          metalness={0.35}
          roughness={0.7}
        />
      </mesh>
      <mesh position={[0, 0.15, -0.95]} rotation={[0.1, 0, 0]} castShadow>
        <boxGeometry args={[3.45, 2.25, 0.12]} />
        <meshStandardMaterial
          color="#222a25"
          metalness={0.84}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 0.15, -0.875]} rotation={[0.1, 0, 0]}>
        <planeGeometry args={[3.12, 1.91]} />
        <meshStandardMaterial
          color="#07110b"
          emissive="#163823"
          emissiveIntensity={0.55}
          roughness={0.24}
        />
      </mesh>
      <mesh ref={scan} position={[0, 0, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.35, 3.1]} />
        <meshBasicMaterial
          color="#68df91"
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <points ref={pointCloud}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#68df91"
          size={0.035}
          sizeAttenuation
          transparent
          opacity={0.74}
        />
      </points>
    </group>
  );
}

export default function DeviceScene({
  reduceMotion = false,
}: {
  reduceMotion?: boolean;
}) {
  return (
    <Canvas
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0.2, 0.5, 5.7], fov: 40 }}
      shadows
    >
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[3, 4, 5]}
        intensity={2.1}
        color="#dce8df"
        castShadow
      />
      <pointLight position={[-4, 0, 2]} intensity={4} color="#68df91" />
      <Laptop reduceMotion={reduceMotion} />
    </Canvas>
  );
}
