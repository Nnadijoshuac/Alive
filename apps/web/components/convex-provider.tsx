"use client";

import React, { useMemo, type ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

interface ConvexClientProviderProps {
  children: ReactNode;
}

export function ConvexClientProvider({ children }: ConvexClientProviderProps) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const isHosted =
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  const convex = useMemo(() => {
    if (!convexUrl) {
      if (isHosted || process.env.NODE_ENV === "production") {
        console.error(
          "[ALIVE CRITICAL CONFIG ERROR] NEXT_PUBLIC_CONVEX_URL is missing in hosted production! State persistence and real-time agent execution require a valid Convex deployment URL.",
        );
      }
      return null;
    }
    try {
      return new ConvexReactClient(convexUrl);
    } catch (err) {
      console.error("[ALIVE CRITICAL ERROR] Failed to initialize Convex client:", err);
      return null;
    }
  }, [convexUrl, isHosted]);

  if (!convex) {
    if (isHosted && !convexUrl) {
      return (
        <div style={{ padding: "2rem", background: "#0a0a0c", color: "#ff4444", fontFamily: "monospace" }}>
          <h2>ALIVE Runtime Configuration Error</h2>
          <p>NEXT_PUBLIC_CONVEX_URL is not configured in this hosted deployment.</p>
          <p>Please ensure NEXT_PUBLIC_CONVEX_URL is provided in the build/runtime environment.</p>
        </div>
      );
    }
    // If Convex URL is not configured (pure local offline dev / unit test), render children without error
    return <>{children}</>;
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
