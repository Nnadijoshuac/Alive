import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export function Scene1Hook() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Smooth entrance spring for scale & translation
  const entranceSpring = spring({
    frame,
    fps,
    config: {
      damping: 18,
      mass: 0.8,
      stiffness: 90,
    },
  });

  // Blur-to-focus interpolation
  const blurAmount = interpolate(frame, [0, 22], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Opacity entrance & exit
  const opacityIn = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacityOut = interpolate(frame, [60, 74], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = opacityIn * opacityOut;

  // Upward translation
  const translateY = interpolate(entranceSpring, [0, 1], [36, 0]);
  const scale = interpolate(entranceSpring, [0, 1], [0.94, 1.0]);

  // Subtle subtitle pill entrance
  const pillOpacity = interpolate(frame, [18, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const contentStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "0 60px",
    opacity,
    transform: `translateY(${translateY}px) scale(${scale})`,
    filter: `blur(${blurAmount}px)`,
  };

  const pillStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 16px",
    background: "rgba(16, 185, 129, 0.12)",
    border: "1px solid rgba(16, 185, 129, 0.35)",
    borderRadius: "20px",
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: "15px",
    fontWeight: 600,
    letterSpacing: "0.1em",
    color: "#10b981",
    textTransform: "uppercase",
    marginBottom: "28px",
    opacity: pillOpacity,
  };

  const dotStyle: CSSProperties = {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    backgroundColor: "#10b981",
    boxShadow: "0 0 8px #10b981",
  };

  const headingStyle: CSSProperties = {
    fontSize: "68px",
    fontWeight: 800,
    lineHeight: 1.08,
    letterSpacing: "-0.04em",
    color: "#ffffff",
    margin: 0,
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    textShadow: "0 4px 30px rgba(0, 0, 0, 0.7)",
    maxWidth: "850px",
  };

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={contentStyle}>
        <div style={pillStyle}>
          <span style={dotStyle} />
          <span>MARKET SHIFT</span>
        </div>
        <h1 style={headingStyle}>
          RWAs are moving onchain.
        </h1>
      </div>
    </AbsoluteFill>
  );
}
