"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { useHydrationSafeReducedMotion } from "@/lib/reduced-motion";

const DeviceScene = dynamic(() => import("./device-scene"), {
  ssr: false,
  loading: () => <CapitalFallback loading />,
});

class WebGLErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // The static diagram remains available when the GPU path fails.
  }

  render() {
    return this.state.failed ? <CapitalFallback /> : this.props.children;
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
    const idleId = window.requestIdleCallback(callback, { timeout: 1_800 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = globalThis.setTimeout(callback, 650);
  return () => globalThis.clearTimeout(timeoutId);
}

function CapitalOverlay() {
  return (
    <div className="capital-overlay" aria-hidden="true">
      <span className="capital-boundary-label">Your policy boundary</span>
      <span className="capital-vault-label">ALIVE vault</span>
      <span className="capital-scene-label" data-node="treasuries">
        <strong>Treasuries</strong>
        allocation / risk / yield / liquidity
      </span>
      <span className="capital-scene-label" data-node="gold">
        <strong>Gold</strong>
        allocation / risk / yield / liquidity
      </span>
      <span className="capital-scene-label" data-node="equities">
        <strong>Equities</strong>
        allocation / risk / yield / liquidity
      </span>
      <span className="capital-scene-label" data-node="cash">
        <strong>Cash</strong>
        allocation / risk / yield / liquidity
      </span>
      <span className="capital-rejection-label">
        Out-of-policy proposal meets the wall and returns
      </span>
    </div>
  );
}

export function CapitalFallback({ loading = false }: { loading?: boolean }) {
  return (
    <div className="capital-fallback" aria-hidden="true">
      <span className="capital-fallback-boundary" />
      <span className="capital-fallback-vault" />
      <span className="capital-fallback-node" />
      <span className="capital-fallback-node" />
      <span className="capital-fallback-node" />
      <span className="capital-fallback-node" />
      <span className="capital-fallback-flow" />
      <span className="capital-fallback-state">
        {loading ? "Preparing policy universe" : "Static policy universe"}
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

  const showStatic = webgl === false || reduceMotion;
  const showLoading = webgl === null || !sceneReady;

  return (
    <div
      className="hero-device"
      role="img"
      aria-label="An illustrative capital system with an ALIVE vault, four real-world asset classes, capital flows, and a policy boundary that rejects an invalid allocation"
    >
      {showStatic ? (
        <CapitalFallback />
      ) : showLoading ? (
        <CapitalFallback loading />
      ) : (
        <WebGLErrorBoundary>
          <DeviceScene />
        </WebGLErrorBoundary>
      )}
      <CapitalOverlay />
    </div>
  );
}
