import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

interface ActionItem {
  number: string;
  text: string;
  tag: string;
  startFrame: number;
}

const ACTIONS: ActionItem[] = [
  {
    number: "01",
    text: "Discover assets.",
    tag: "CANONICAL RWAs",
    startFrame: 0,
  },
  {
    number: "02",
    text: "Verify them.",
    tag: "CUSTODY & FRESHNESS",
    startFrame: 26,
  },
  {
    number: "03",
    text: "Set your mandate.",
    tag: "POLICY CONSTRAINTS",
    startFrame: 52,
  },
  {
    number: "04",
    text: "Manage your portfolio with AI.",
    tag: "AUTONOMOUS EXECUTION",
    startFrame: 78,
  },
];

export function Scene2Actions() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene exit fade
  const sceneOpacityOut = interpolate(frame, [122, 134], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 80px",
        opacity: sceneOpacityOut,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "880px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {ACTIONS.map((item, idx) => {
          const itemFrame = Math.max(0, frame - item.startFrame);

          const itemSpring = spring({
            frame: itemFrame,
            fps,
            config: {
              damping: 16,
              mass: 0.7,
              stiffness: 110,
            },
          });

          const isVisible = frame >= item.startFrame;
          const itemOpacity = isVisible
            ? interpolate(itemFrame, [0, 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 0;

          const translateY = interpolate(itemSpring, [0, 1], [30, 0]);
          const scale = interpolate(itemSpring, [0, 1], [0.96, 1.0]);

          const nextAction = ACTIONS[idx + 1];
          const isLatest =
            idx === ACTIONS.length - 1
              ? frame >= item.startFrame
              : frame >= item.startFrame && frame < (nextAction?.startFrame ?? 999) + 10;

          const cardStyle: CSSProperties = {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 28px",
            background: isLatest
              ? "rgba(16, 185, 129, 0.08)"
              : "rgba(255, 255, 255, 0.025)",
            border: isLatest
              ? "1px solid rgba(16, 185, 129, 0.45)"
              : "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            opacity: itemOpacity,
            transform: `translateY(${translateY}px) scale(${scale})`,
            boxShadow: isLatest
              ? "0 8px 30px rgba(16, 185, 129, 0.15)"
              : "0 4px 16px rgba(0, 0, 0, 0.3)",
            transition: "background 0.2s ease, border 0.2s ease",
          };

          const leftContentStyle: CSSProperties = {
            display: "flex",
            alignItems: "center",
            gap: "20px",
          };

          const numberStyle: CSSProperties = {
            fontFamily: '"SFMono-Regular", Consolas, monospace',
            fontSize: "16px",
            fontWeight: 700,
            color: isLatest ? "#10b981" : "rgba(255, 255, 255, 0.35)",
            letterSpacing: "0.08em",
          };

          const textStyle: CSSProperties = {
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: "34px",
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.025em",
            lineHeight: 1.2,
          };

          const tagStyle: CSSProperties = {
            fontFamily: '"SFMono-Regular", Consolas, monospace',
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: isLatest ? "#10b981" : "rgba(255, 255, 255, 0.4)",
            padding: "4px 10px",
            borderRadius: "4px",
            background: isLatest ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.04)",
          };

          return (
            <div key={item.number} style={cardStyle}>
              <div style={leftContentStyle}>
                <span style={numberStyle}>{item.number}</span>
                <span style={textStyle}>{item.text}</span>
              </div>
              <span style={tagStyle}>{item.tag}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
