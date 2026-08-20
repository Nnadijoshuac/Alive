"use client";

import React, { useMemo, type ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

interface ConvexClientProviderProps {
  children: ReactNode;
}

export function ConvexClientProvider({ children }: ConvexClientProviderProps) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  const convex = useMemo(() => {
    if (!convexUrl) return null;
    try {
      return new ConvexReactClient(convexUrl);
    } catch (err) {
      console.warn("Failed to initialize Convex client:", err);
      return null;
    }
  }, [convexUrl]);

  if (!convex) {
    // If Convex URL is not configured (e.g., pure local offline dev), render children without error
    return <>{children}</>;
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
