"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type {
  BufferAttribute,
  Group,
  LineSegments,
  MeshBasicMaterial,
  Points,
} from "three";
import * as THREE from "three";

const ACCENT = "#68df91";
const ACCENT_BRIGHT = "#b8ffcf";
const METAL = "#242b27";

type EvidenceCloud = {
  colors: Float32Array;
  positions: Float32Array;
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function buildEvidenceCloud(): EvidenceCloud {
  const screenPoints = 112;
  const basePoints = 72;
  const count = screenPoints + basePoints;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const random = seededRandom(912_783);
  const restingColor = new THREE.Color("#174528");
  const activeColor = new THREE.Color(ACCENT_BRIGHT);

  for (let index = 0; index < count; index += 1) {
    let x: number;
    let y: number;
    let z: number;

    if (index < screenPoints) {
      const localX = (random() - 0.5) * 3.22;
      const localY = (random() - 0.5) * 1.84;
      const localZ = 0.088 + (random() - 0.5) * 0.025;
      const tilt = 0.11;
      x = localX;
      y = 0.22 + localY * Math.cos(tilt) - localZ * Math.sin(tilt);
      z = -1.02 + localY * Math.sin(tilt) + localZ * Math.cos(tilt);
    } else {
      x = (random() - 0.5) * 3.54;
      y = -0.69 + (random() - 0.5) * 0.045;
      z = (random() - 0.5) * 2.04;
    }

    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;

    const initialSignal = Math.max(0, 1 - Math.abs(x) * 1.6);
    const color = restingColor.clone().lerp(activeColor, initialSignal * 0.72);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  return { colors, positions };
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

  for (const [startIndex, endIndex] of edges) {
    const start = corners[startIndex];
    const end = corners[endIndex];
    if (!start || !end) continue;
    values.push(...start, ...end);
  }

  return new Float32Array(values);
}

function buildKeyboardSegments() {
  const values: number[] = [];
  const minX = -1.47;
  const maxX = 1.47;
  const minZ = -0.78;
  const maxZ = 0.38;

  for (let row = 0; row <= 4; row += 1) {
    const z = minZ + ((maxZ - minZ) * row) / 4;
    values.push(minX, -0.585, z, maxX, -0.585, z);
  }
  for (let column = 0; column <= 10; column += 1) {
    const x = minX + ((maxX - minX) * column) / 10;
    values.push(x, -0.585, minZ, x, -0.585, maxZ);
  }

  return new Float32Array(values);
}

function buildScreenGrid() {
  const values: number[] = [];
  for (let column = 1; column < 6; column += 1) {
    const x = -1.55 + (3.1 * column) / 6;
    values.push(x, -0.88, 0.082, x, 0.88, 0.082);
  }
  for (let row = 1; row < 4; row += 1) {
    const y = -0.88 + (1.76 * row) / 4;
    values.push(-1.55, y, 0.082, 1.55, y, 0.082);
  }
  return new Float32Array(values);
}

function damp(current: number, target: number, speed: number, delta: number) {
  return THREE.MathUtils.lerp(
    current,
    target,
    1 - Math.exp(-speed * Math.min(delta, 0.05)),
  );
}

function EvidenceRig({
  active,
  reduceMotion,
  scrollProgress,
}: {
  active: boolean;
  reduceMotion: boolean;
  scrollProgress: RefObject<number>;
}) {
  const rig = useRef<Group>(null);
  const asset = useRef<Group>(null);
  const scan = useRef<Group>(null);
  const scanGlow = useRef<MeshBasicMaterial>(null);
  const pointCloud = useRef<Points>(null);
  const captureOrbit = useRef<Group>(null);
  const inspectionFrame = useRef<LineSegments>(null);
  const evidenceCloud = useMemo(buildEvidenceCloud, []);
  const frameSegments = useMemo(() => buildBoxSegments(4.75, 3.45, 3.25), []);
  const keyboardSegments = useMemo(buildKeyboardSegments, []);
  const screenGrid = useMemo(buildScreenGrid, []);
  const restingColor = useMemo(() => new THREE.Color("#174528"), []);
  const activeColor = useMemo(() => new THREE.Color(ACCENT_BRIGHT), []);

  useFrame(({ clock, pointer, viewport }, delta) => {
    if (!active || reduceMotion) return;

    const elapsed = clock.getElapsedTime();
    const scroll = scrollProgress.current;
    const phase = elapsed * 0.68 + scroll * 2.1;
    const scanX = Math.sin(phase) * 1.95;
    const responsiveScale = THREE.MathUtils.clamp(
      viewport.width / 6.4,
      0.68,
      1,
    );

    if (rig.current) {
      const targetX = pointer.y * -0.035 - scroll * 0.035;
      const targetY = pointer.x * 0.1 + scroll * 0.16;
      rig.current.rotation.x = damp(
        rig.current.rotation.x,
        targetX,
        3.6,
        delta,
      );
      rig.current.rotation.y = damp(
        rig.current.rotation.y,
        targetY,
        3.6,
        delta,
      );
      rig.current.position.y = damp(
        rig.current.position.y,
        -0.02 - scroll * 0.16,
        3.4,
        delta,
      );
      rig.current.scale.setScalar(
        damp(rig.current.scale.x, responsiveScale, 4.2, delta),
      );
    }

    if (asset.current) {
      asset.current.position.y = Math.sin(elapsed * 0.55) * 0.035;
      asset.current.rotation.y = -0.5 + Math.sin(elapsed * 0.22) * 0.035;
    }

    if (scan.current) scan.current.position.x = scanX;
    if (scanGlow.current) {
      scanGlow.current.opacity = 0.085 + Math.sin(phase * 2) * 0.018;
    }
    if (captureOrbit.current) {
      captureOrbit.current.rotation.y = elapsed * 0.07 + scroll * 0.45;
      captureOrbit.current.rotation.z = Math.sin(elapsed * 0.16) * 0.08;
    }
    if (inspectionFrame.current) {
      inspectionFrame.current.rotation.y = Math.sin(elapsed * 0.2) * 0.025;
    }

    if (pointCloud.current) {
      const colorAttribute = pointCloud.current.geometry.getAttribute(
        "color",
      ) as BufferAttribute;
      const positionAttribute = pointCloud.current.geometry.getAttribute(
        "position",
      ) as BufferAttribute;

      for (let index = 0; index < positionAttribute.count; index += 1) {
        const distance = Math.abs(positionAttribute.getX(index) - scanX);
        const signal = Math.exp(-distance * 5.8);
        colorAttribute.setXYZ(
          index,
          THREE.MathUtils.lerp(restingColor.r, activeColor.r, signal),
          THREE.MathUtils.lerp(restingColor.g, activeColor.g, signal),
          THREE.MathUtils.lerp(restingColor.b, activeColor.b, signal),
        );
      }
      colorAttribute.needsUpdate = true;
    }
  });

  return (
    <group ref={rig} scale={0.96}>
      <mesh position={[0, -1.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.15, 64]} />
        <meshBasicMaterial
          color="#080b09"
          transparent
          opacity={0.88}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, -1.028, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.1, 2.115, 80]} />
        <meshBasicMaterial
          color={ACCENT}
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>

      <lineSegments ref={inspectionFrame} position={[0, 0.12, -0.05]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[frameSegments, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={ACCENT} transparent opacity={0.14} />
      </lineSegments>

      <group ref={captureOrbit} position={[0, 0.02, -0.04]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.34, 0.008, 4, 96]} />
          <meshBasicMaterial
            color={ACCENT}
            transparent
            opacity={0.24}
            depthWrite={false}
          />
        </mesh>
        {[
          [2.34, 0, 0],
          [-2.34, 0, 0],
          [0, 0, 2.34],
          [0, 0, -2.34],
        ].map((position, index) => (
          <mesh
            key={index}
            position={position as [number, number, number]}
            rotation={[0, Math.PI / 4, 0]}
          >
            <octahedronGeometry args={[0.075, 0]} />
            <meshBasicMaterial color={ACCENT_BRIGHT} toneMapped={false} />
          </mesh>
        ))}
      </group>

      <group ref={asset} rotation={[-0.055, -0.5, 0.015]}>
        <mesh position={[0, -0.76, 0]}>
          <boxGeometry args={[3.72, 0.2, 2.24]} />
          <meshStandardMaterial
            color={METAL}
            metalness={0.88}
            roughness={0.28}
          />
        </mesh>
        <mesh position={[0, -0.642, 0.03]}>
          <boxGeometry args={[3.4, 0.025, 1.87]} />
          <meshStandardMaterial
            color="#090d0a"
            metalness={0.34}
            roughness={0.72}
          />
        </mesh>
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[keyboardSegments, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#718077" transparent opacity={0.24} />
        </lineSegments>
        <mesh position={[0, -0.575, 0.7]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.08, 0.58]} />
          <meshBasicMaterial color="#101611" transparent opacity={0.92} />
        </mesh>
        <mesh position={[0, -0.64, -1.02]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.075, 0.075, 3.24, 24]} />
          <meshStandardMaterial
            color="#313934"
            metalness={0.9}
            roughness={0.25}
          />
        </mesh>

        <group position={[0, 0.22, -1.02]} rotation={[0.11, 0, 0]}>
          <mesh>
            <boxGeometry args={[3.72, 2.36, 0.13]} />
            <meshStandardMaterial
              color="#202722"
              metalness={0.9}
              roughness={0.27}
            />
          </mesh>
          <mesh position={[0, 0, 0.071]}>
            <planeGeometry args={[3.38, 2.03]} />
            <meshStandardMaterial
              color="#061009"
              emissive="#102e1b"
              emissiveIntensity={0.58}
              metalness={0.18}
              roughness={0.42}
            />
          </mesh>
          <lineSegments>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[screenGrid, 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color={ACCENT} transparent opacity={0.1} />
          </lineSegments>
          {[0.29, 0.5, 0.71].map((radius, index) => (
            <mesh
              key={radius}
              position={[0.12, -0.02, 0.088 + index * 0.001]}
              rotation={[0, 0, -0.28]}
              scale={[0.73, 1, 1]}
            >
              <torusGeometry
                args={[radius, 0.011, 5, 44, Math.PI * (1.35 + index * 0.08)]}
              />
              <meshBasicMaterial
                color={index === 2 ? ACCENT_BRIGHT : ACCENT}
                transparent
                opacity={0.38 - index * 0.06}
                toneMapped={false}
              />
            </mesh>
          ))}
          <mesh position={[0, 1.09, 0.071]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.012, 20]} />
            <meshBasicMaterial color="#030504" />
          </mesh>
        </group>

        <points ref={pointCloud} renderOrder={5}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[evidenceCloud.positions, 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[evidenceCloud.colors, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            vertexColors
            color="#ffffff"
            size={0.032}
            sizeAttenuation
            transparent
            opacity={0.92}
            depthWrite={false}
            toneMapped={false}
          />
        </points>

        <group ref={scan} position={[0, 0.08, 0]} renderOrder={6}>
          <mesh>
            <boxGeometry args={[0.34, 3.35, 3.08]} />
            <meshBasicMaterial
              ref={scanGlow}
              color={ACCENT}
              transparent
              opacity={0.1}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <mesh>
            <boxGeometry args={[0.014, 3.48, 3.14]} />
            <meshBasicMaterial
              color={ACCENT_BRIGHT}
              transparent
              opacity={0.62}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function useSceneActivity() {
  const host = useRef<HTMLDivElement>(null);
  const scrollProgress = useRef(0);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    let intersecting = true;
    let frameId = 0;

    const updateActivity = () => {
      setActive(intersecting && document.visibilityState === "visible");
    };
    const updateScroll = () => {
      frameId = 0;
      scrollProgress.current = THREE.MathUtils.clamp(
        window.scrollY / Math.max(window.innerHeight * 0.92, 1),
        0,
        1,
      );
    };
    const handleScroll = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateScroll);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry?.isIntersecting ?? true;
        updateActivity();
      },
      { rootMargin: "120px 0px", threshold: 0.01 },
    );

    updateScroll();
    observer.observe(element);
    document.addEventListener("visibilitychange", updateActivity);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateActivity);
      window.removeEventListener("scroll", handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  return { active, host, scrollProgress };
}

export default function DeviceScene({
  reduceMotion = false,
}: {
  reduceMotion?: boolean;
}) {
  const { active, host, scrollProgress } = useSceneActivity();

  return (
    <div ref={host} style={{ width: "100%", height: "100%" }}>
      <Canvas
        dpr={reduceMotion ? 1 : [1, 1.45]}
        frameloop={active && !reduceMotion ? "always" : "demand"}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          stencil: false,
        }}
        camera={{ position: [0.18, 0.42, 6.35], fov: 38 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <fog attach="fog" args={["#121316", 6.2, 10.5]} />
        <ambientLight intensity={0.58} />
        <hemisphereLight args={["#dce7df", "#060806", 1.2]} />
        <directionalLight
          position={[3.4, 4.8, 4.6]}
          intensity={2.15}
          color="#e8f1eb"
        />
        <pointLight
          position={[-3.6, 0.4, 2.5]}
          intensity={5.5}
          distance={8}
          color={ACCENT}
        />
        <EvidenceRig
          active={active}
          reduceMotion={reduceMotion}
          scrollProgress={scrollProgress}
        />
      </Canvas>
    </div>
  );
}
