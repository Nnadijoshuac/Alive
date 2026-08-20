"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
} from "three";
import * as THREE from "three";

const ACCENT = "#72e99a";
const ACCENT_BRIGHT = "#d5ffe1";
const SURFACE = "#101b15";
const POLICY_SIZE: readonly [number, number, number] = [6.8, 4.65, 3.7];

const ASSET_NODES = [
  { key: "treasuries", position: [2.35, 1.28, -0.28], scale: 0.86 },
  { key: "gold", position: [2.42, -1.25, 0.24], scale: 0.72 },
  { key: "equities", position: [-2.28, 1.25, 0.16], scale: 0.79 },
  { key: "cash", position: [-2.34, -1.2, -0.2], scale: 0.66 },
] as const;

type FlowSeed = {
  pathIndex: number;
  phase: number;
  speed: number;
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function damp(current: number, target: number, speed: number, delta: number) {
  return THREE.MathUtils.lerp(
    current,
    target,
    1 - Math.exp(-speed * Math.min(delta, 0.05)),
  );
}

function buildBoxSegments(width: number, height: number, depth: number) {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const corners: Array<readonly [number, number, number]> = [
    [-x, -y, -z],
    [x, -y, -z],
    [x, y, -z],
    [-x, y, -z],
    [-x, -y, z],
    [x, -y, z],
    [x, y, z],
    [-x, y, z],
  ];
  const edges: Array<readonly [number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const values: number[] = [];

  edges.forEach(([startIndex, endIndex]) => {
    const start = corners[startIndex];
    const end = corners[endIndex];
    if (start && end) values.push(...start, ...end);
  });

  return new Float32Array(values);
}

function buildCurveSegments(curves: THREE.CatmullRomCurve3[]) {
  const values: number[] = [];

  curves.forEach((curve) => {
    const points = curve.getPoints(28);
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (start && end) values.push(...start.toArray(), ...end.toArray());
    }
  });

  return new Float32Array(values);
}

function createFlowCurves() {
  const vault = new THREE.Vector3(0, 0, 0);
  const curves = [
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.45, -0.05, 0.45),
      new THREE.Vector3(-3.25, 0.22, 0.12),
      new THREE.Vector3(-1.55, -0.12, 0.35),
      vault,
    ]),
  ];

  ASSET_NODES.forEach((node, index) => {
    const target = new THREE.Vector3(...node.position);
    curves.push(
      new THREE.CatmullRomCurve3([
        vault,
        new THREE.Vector3(
          target.x * 0.42,
          target.y * 0.2 + (index % 2 === 0 ? 0.16 : -0.16),
          target.z * -0.6,
        ),
        target,
      ]),
    );
  });

  return curves;
}

function PolicyBoundary() {
  const frameSegments = useMemo(() => buildBoxSegments(...POLICY_SIZE), []);

  return (
    <group rotation={[0.03, -0.08, -0.015]}>
      <mesh>
        <boxGeometry args={[...POLICY_SIZE]} />
        <meshBasicMaterial
          color={ACCENT}
          transparent
          opacity={0.018}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[frameSegments, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={ACCENT} transparent opacity={0.32} />
      </lineSegments>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.12, 3.135, 96]} />
        <meshBasicMaterial
          color={ACCENT}
          transparent
          opacity={0.11}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function VaultCore({ coreRef }: { coreRef: React.RefObject<Group | null> }) {
  return (
    <group ref={coreRef}>
      <mesh rotation={[0.36, 0.48, 0.1]}>
        <octahedronGeometry args={[0.77, 1]} />
        <meshStandardMaterial
          color={SURFACE}
          emissive="#0d3820"
          emissiveIntensity={0.8}
          metalness={0.72}
          roughness={0.28}
        />
      </mesh>
      <mesh rotation={[0.36, 0.48, 0.1]} scale={1.28}>
        <octahedronGeometry args={[0.77, 1]} />
        <meshBasicMaterial
          color={ACCENT}
          wireframe
          transparent
          opacity={0.26}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshBasicMaterial color={ACCENT_BRIGHT} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.05, 0.012, 5, 80]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function AssetNode({
  index,
  position,
  scale,
}: {
  index: number;
  position: readonly [number, number, number];
  scale: number;
}) {
  const rotation = index % 2 === 0 ? 0.32 : -0.32;

  return (
    <group position={[...position]} scale={scale} rotation={[0, 0, rotation]}>
      <mesh rotation={[0.25, 0.38, 0]}>
        <octahedronGeometry args={[0.54, 0]} />
        <meshStandardMaterial
          color={index === 0 ? "#17261c" : "#121a15"}
          emissive="#10301b"
          emissiveIntensity={0.32}
          metalness={0.58}
          roughness={0.38}
        />
      </mesh>
      <mesh rotation={[0.25, 0.38, 0]} scale={1.2}>
        <octahedronGeometry args={[0.54, 0]} />
        <meshBasicMaterial
          color={index === 0 ? ACCENT_BRIGHT : ACCENT}
          wireframe
          transparent
          opacity={index === 0 ? 0.46 : 0.28}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 0.735, 48]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

function CapitalSystem({ active }: { active: boolean }) {
  const rig = useRef<Group>(null);
  const vault = useRef<Group>(null);
  const particles = useRef<Points>(null);
  const rejected = useRef<Mesh>(null);
  const impact = useRef<Mesh>(null);
  const impactMaterial = useRef<MeshBasicMaterial>(null);
  const curves = useMemo(createFlowCurves, []);
  const pathSegments = useMemo(() => buildCurveSegments(curves), [curves]);
  const rejectionCurve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.2, 0.06, 0.1),
        new THREE.Vector3(1.5, 0.55, 0.06),
        new THREE.Vector3(2.6, 1.25, 0.02),
        new THREE.Vector3(4.35, 2.15, -0.05),
      ]),
    [],
  );
  const impactPosition = useMemo(
    () => rejectionCurve.getPoint(0.73),
    [rejectionCurve],
  );
  const { flowSeeds, positions } = useMemo(() => {
    const count = 76;
    const random = seededRandom(2_026_081_4);
    const generatedSeeds: FlowSeed[] = [];

    for (let index = 0; index < count; index += 1) {
      generatedSeeds.push({
        pathIndex: index % curves.length,
        phase: random(),
        speed: 0.045 + random() * 0.045,
      });
    }

    return {
      flowSeeds: generatedSeeds,
      positions: new Float32Array(count * 3),
    };
  }, [curves.length]);

  useFrame(({ clock, pointer }, delta) => {
    if (!active) return;

    const elapsed = clock.getElapsedTime();

    if (rig.current) {
      rig.current.rotation.x = damp(
        rig.current.rotation.x,
        pointer.y * -0.035,
        3.2,
        delta,
      );
      rig.current.rotation.y = damp(
        rig.current.rotation.y,
        pointer.x * 0.08,
        3.2,
        delta,
      );
    }

    if (vault.current) {
      vault.current.rotation.y = elapsed * 0.1;
      vault.current.rotation.z = Math.sin(elapsed * 0.32) * 0.035;
      const pulse = 1 + Math.sin(elapsed * 1.15) * 0.018;
      vault.current.scale.setScalar(pulse);
    }

    if (particles.current) {
      const positionAttribute = particles.current.geometry.getAttribute(
        "position",
      ) as BufferAttribute;

      flowSeeds.forEach((seed, index) => {
        const path = curves[seed.pathIndex];
        if (!path) return;
        const progress = (seed.phase + elapsed * seed.speed) % 1;
        const point = path.getPoint(progress);
        positionAttribute.setXYZ(index, point.x, point.y, point.z);
      });
      positionAttribute.needsUpdate = true;
    }

    const cycle = (elapsed * 0.22) % 2;
    const returningProgress = cycle <= 1 ? cycle : 2 - cycle;
    const rejectionProgress = Math.min(returningProgress, 0.73);
    const rejectionPosition = rejectionCurve.getPoint(rejectionProgress);

    if (rejected.current) {
      rejected.current.position.copy(rejectionPosition);
      rejected.current.rotation.x = elapsed * 1.2;
      rejected.current.rotation.y = elapsed * 0.9;
    }

    const collision = returningProgress >= 0.71;
    if (impact.current) {
      const scale = collision ? 1 + Math.sin(elapsed * 8) * 0.18 : 0.72;
      impact.current.scale.setScalar(scale);
    }
    if (impactMaterial.current) {
      impactMaterial.current.opacity = collision ? 0.42 : 0.08;
    }
  });

  return (
    <group ref={rig} rotation={[-0.03, -0.05, 0]} scale={0.92}>
      <PolicyBoundary />

      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[pathSegments, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={ACCENT} transparent opacity={0.13} />
      </lineSegments>

      <group position={[-4.15, -0.04, 0.42]} rotation={[0, 0.28, 0]}>
        <mesh>
          <boxGeometry args={[0.12, 1.15, 1.15]} />
          <meshStandardMaterial
            color="#152019"
            emissive="#10301b"
            emissiveIntensity={0.45}
            metalness={0.64}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[0.08, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <ringGeometry args={[0.35, 0.38, 40]} />
          <meshBasicMaterial color={ACCENT} transparent opacity={0.44} />
        </mesh>
      </group>

      <VaultCore coreRef={vault} />

      {ASSET_NODES.map((node, index) => (
        <AssetNode
          key={node.key}
          index={index}
          position={node.position}
          scale={node.scale}
        />
      ))}

      <points ref={particles} renderOrder={4}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={ACCENT_BRIGHT}
          size={0.045}
          sizeAttenuation
          transparent
          opacity={0.92}
          depthWrite={false}
          toneMapped={false}
        />
      </points>

      <mesh ref={rejected} renderOrder={6}>
        <octahedronGeometry args={[0.11, 0]} />
        <meshBasicMaterial
          color={ACCENT_BRIGHT}
          transparent
          opacity={0.88}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={impact} position={impactPosition} rotation={[0, 0.55, 0]}>
        <ringGeometry args={[0.22, 0.235, 48]} />
        <meshBasicMaterial
          ref={impactMaterial}
          color={ACCENT}
          transparent
          opacity={0.08}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function useSceneActivity() {
  const host = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    let intersecting = true;
    const updateActivity = () => {
      setActive(intersecting && document.visibilityState === "visible");
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry?.isIntersecting ?? true;
        updateActivity();
      },
      { rootMargin: "120px 0px", threshold: 0.01 },
    );

    observer.observe(element);
    document.addEventListener("visibilitychange", updateActivity);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateActivity);
    };
  }, []);

  return { active, host };
}

export default function DeviceScene() {
  const { active, host } = useSceneActivity();

  return (
    <div ref={host} className="capital-canvas-host">
      <Canvas
        dpr={[1, 1.35]}
        frameloop={active ? "always" : "demand"}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          stencil: false,
        }}
        camera={{ position: [0.15, 0.18, 8.35], fov: 39 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.04;
        }}
      >
        <fog attach="fog" args={["#050806", 8.2, 13]} />
        <ambientLight intensity={0.42} />
        <hemisphereLight args={["#dce9df", "#030504", 0.95]} />
        <directionalLight
          position={[3.8, 5.2, 5.5]}
          intensity={1.75}
          color="#eef6f0"
        />
        <pointLight
          position={[-3.5, 0.8, 2.8]}
          intensity={4.8}
          distance={9}
          color={ACCENT}
        />
        <CapitalSystem active={active} />
      </Canvas>
    </div>
  );
}
