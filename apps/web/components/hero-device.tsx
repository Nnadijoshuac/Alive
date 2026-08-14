"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { Component, useEffect, useState, type ReactNode } from "react";
import { ScanIcon } from "@phosphor-icons/react";
import { useHydrationSafeReducedMotion } from "@/lib/reduced-motion";

const DeviceScene = dynamic(() => import("./device-scene"), {
  ssr: false,
  loading: () => <ForensicFallback loading />,
});

class WebGLErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {}
  render() {
    return this.state.failed ? <ForensicFallback /> : this.props.children;
  }
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function scheduleWhenIdle(callback: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(callback, { timeout: 2_000 });
    return () => window.cancelIdleCallback(idleId);
  }
  const timeoutId = globalThis.setTimeout(callback, 800);
  return () => globalThis.clearTimeout(timeoutId);
}

export function ForensicFallback({ loading = false }: { loading?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="forensic-fallback">
      <div className="fallback-device" aria-hidden="true">
        <span />
        <i />
      </div>
      {!imageFailed ? (
        <Image
          src="/media/forensic-laptop.png"
          alt="A physical laptop under a forensic ALIVE scan"
          fill
          sizes="(max-width: 1120px) calc(100vw - 40px), 50vw"
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <div className="fallback-scan" aria-hidden="true" />
      <span className="fallback-label">
        <ScanIcon size={14} weight="bold" />
        {loading ? "Initializing optical model" : "Static forensic view"}
      </span>
    </div>
  );
}

export function HeroDevice() {
  const reduceMotion = useHydrationSafeReducedMotion();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => setWebgl(supportsWebGL()), []);
  useEffect(() => {
    if (!webgl || reduceMotion) return;
    return scheduleWhenIdle(() => setSceneReady(true));
  }, [reduceMotion, webgl]);

  return (
    <div
      className="hero-device"
      aria-label="Procedural three-dimensional physical asset scan"
    >
      {webgl === false || reduceMotion ? (
        <ForensicFallback />
      ) : webgl === null || !sceneReady ? (
        <ForensicFallback loading />
      ) : (
        <WebGLErrorBoundary>
          <DeviceScene reduceMotion={reduceMotion} />
        </WebGLErrorBoundary>
      )}
      <div className="hero-device-data">
        <span>FEATURE EXTRACTION</span>
        <span>OFFCHAIN EVIDENCE</span>
        <span>SIGNED OUTPUT</span>
      </div>
    </div>
  );
}
