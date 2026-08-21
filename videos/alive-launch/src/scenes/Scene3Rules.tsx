import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export function Scene3Rules() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Part 1: "You set the rules." (frames 0 - 45)
  const part1Entrance = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.75, stiffness: 100 },
  });
  const part1OpacityIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const part1OpacityOut = interpolate(frame, [36, 46], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const part1Opacity = part1OpacityIn * part1OpacityOut;
  const part1TranslateY = interpolate(part1Entrance, [0, 1], [30, 0]);

  // Part 2: "ALIVE handles the intelligence, monitoring, and execution." (frames 44 - 120)
  const part2Frame = Math.max(0, frame - 44);
  const part2Entrance = spring({
    frame: part2Frame,
    fps,
    config: { damping: 18, mass: 0.8, stiffness: 95 },
  });

  const part2OpacityIn = interpolate(part2Frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const part2OpacityOut = interpolate(frame, [108, 120], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const part2Opacity = (frame >= 44 ? part2OpacityIn : 0) * part2OpacityOut;
  const part2TranslateY = interpolate(part2Entrance, [0, 1], [32, 0]);

  // Highlight badge animations
  const highlight1Progress = interpolate(part2Frame, [16, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const highlight2Progress = interpolate(part2Frame, [30, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const highlight3Progress = interpolate(part2Frame, [44, 56], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const highlightStyle = (progress: number): CSSProperties => {
    const bgOpacity = interpolate(progress, [0, 1], [0, 0.16]);
    const borderOpacity = interpolate(progress, [0, 1], [0, 0.5]);
    const glow = interpolate(progress, [0, 1], [0, 14]);

    return {
      display: "inline-block",
      color: progress > 0.4 ? "#10b981" : "#ffffff",
      backgroundColor: `rgba(16, 185, 129, ${bgOpacity})`,
      border: `1px solid rgba(16, 185, 129, ${borderOpacity})`,
      padding: "2px 10px",
      borderRadius: "6px",
      boxShadow: `0 0 ${glow}px rgba(16, 185, 129, 0.3)`,
      transition: "color 0.15s ease",
    };
  };

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* Part 1: You set the rules. */}
      {frame < 48 && (
        <div
          style={{
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "0 60px",
            opacity: part1Opacity,
            transform: `translateY(${part1TranslateY}px)`,
          }}
        >
          <div
            style={{
              fontFamily: '"SFMono-Regular", Consolas, monospace',
              fontSize: "15px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: "#10b981",
              textTransform: "uppercase",
              marginBottom: "24px",
            }}
          >
            [ USER MANDATE ]
          </div>
          <h1
            style={{
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: "72px",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.04em",
              color: "#ffffff",
              margin: 0,
              textShadow: "0 4px 30px rgba(0, 0, 0, 0.8)",
            }}
          >
            You set the rules.
          </h1>
        </div>
      )}

      {/* Part 2: ALIVE handles the intelligence, monitoring, and execution. */}
      {frame >= 40 && (
        <div
          style={{
            position: "absolute",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "0 70px",
            maxWidth: "920px",
            opacity: part2Opacity,
            transform: `translateY(${part2TranslateY}px)`,
          }}
        >
          <div
            style={{
              fontFamily: '"SFMono-Regular", Consolas, monospace',
              fontSize: "15px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: "#10b981",
              textTransform: "uppercase",
              marginBottom: "24px",
            }}
          >
            [ AUTONOMOUS POLICY ENGINE ]
          </div>

          <h2
            style={{
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: "52px",
              fontWeight: 800,
              lineHeight: 1.35,
              letterSpacing: "-0.03em",
              color: "#ffffff",
              margin: 0,
              textShadow: "0 4px 30px rgba(0, 0, 0, 0.8)",
            }}
          >
            ALIVE handles the{" "}
            <span style={highlightStyle(highlight1Progress)}>intelligence</span>,{" "}
            <span style={highlightStyle(highlight2Progress)}>monitoring</span>, and{" "}
            <span style={highlightStyle(highlight3Progress)}>execution</span>.
          </h2>
        </div>
      )}
    </AbsoluteFill>
  );
}
