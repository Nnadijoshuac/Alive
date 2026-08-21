"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia)
    return () => undefined;

  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

export function getReducedMotionSnapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.(REDUCED_MOTION_QUERY).matches)
  );
}

export function getReducedMotionServerSnapshot(): boolean {
  return false;
}

export function useHydrationSafeReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}
