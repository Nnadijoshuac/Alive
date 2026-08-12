"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { ScanIcon } from "@phosphor-icons/react";

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

export function ForensicFallback({ loading = false }: { loading?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="forensic-fallback">
      <div className="fallback-device" aria-hidden="true">
        <span />
        <i />
      </div>
      {!imageFailed ? (
        // The generated still is supplied by the repository build orchestrator.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/media/forensic-laptop.png"
          alt="A physical laptop under a forensic ALIVE scan"
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
  const reduceMotion = useReducedMotion() ?? false;
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => setWebgl(supportsWebGL()), []);

  return (
    <div
      className="hero-device"
      aria-label="Procedural three-dimensional physical asset scan"
    >
      {webgl === false || reduceMotion ? (
        <ForensicFallback />
      ) : webgl === null ? (
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
