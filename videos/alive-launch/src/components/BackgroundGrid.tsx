import type { CSSProperties } from "react";
import { interpolate, useCurrentFrame } from "remotion";

export function BackgroundGrid() {
  const frame = useCurrentFrame();

  // Subtle ambient pulse for the soft green radial glow
  const glowOpacity = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [0.12, 0.22]
  );

  const containerStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "#050806",
    overflow: "hidden",
    pointerEvents: "none",
  };

  const gridStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px)
    `,
    backgroundSize: "60px 60px",
  };

  const ambientGlowStyle: CSSProperties = {
    position: "absolute",
    top: "35%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "650px",
    height: "650px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(16, 185, 129, 0.28) 0%, rgba(5, 8, 6, 0) 70%)",
    opacity: glowOpacity,
    filter: "blur(60px)",
  };

  const vignetteStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(circle at center, transparent 40%, rgba(0, 0, 0, 0.8) 100%)",
  };

  const crosshairStyle = (top?: string, bottom?: string, left?: string, right?: string): CSSProperties => ({
    position: "absolute",
    top,
    bottom,
    left,
    right,
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    fontSize: "14px",
    color: "rgba(255, 255, 255, 0.25)",
    lineHeight: 1,
    userSelect: "none",
  });

  return (
    <div style={containerStyle}>
      <div style={ambientGlowStyle} />
      <div style={gridStyle} />
      <div style={vignetteStyle} />

      {/* Frame boundary markers */}
      <span style={crosshairStyle("40px", undefined, "40px", undefined)}>+</span>
      <span style={crosshairStyle("40px", undefined, undefined, "40px")}>+</span>
      <span style={crosshairStyle(undefined, "40px", "40px", undefined)}>+</span>
      <span style={crosshairStyle(undefined, "40px", undefined, "40px")}>+</span>
    </div>
  );
}
