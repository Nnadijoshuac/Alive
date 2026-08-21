import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export function Scene4Brand() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring for the logo and brand typography
  const brandSpring = spring({
    frame,
    fps,
    config: {
      damping: 17,
      mass: 0.85,
      stiffness: 95,
    },
  });

  const logoScale = interpolate(brandSpring, [0, 1], [0.84, 1.0]);
  const logoTranslateY = interpolate(brandSpring, [0, 1], [30, 0]);
  const opacityIn = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Secondary elements fade in smoothly
  const tagOpacity = interpolate(frame, [18, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const badgeOpacity = interpolate(frame, [32, 46], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "0 60px",
    opacity: opacityIn,
    transform: `translateY(${logoTranslateY}px) scale(${logoScale})`,
  };

  const logoWrapperStyle: CSSProperties = {
    width: "120px",
    height: "120px",
    borderRadius: "24px",
    overflow: "hidden",
    boxShadow: "0 12px 40px rgba(16, 185, 129, 0.25), 0 4px 16px rgba(0, 0, 0, 0.6)",
    marginBottom: "28px",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    backgroundColor: "#000000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const wordmarkStyle: CSSProperties = {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: "64px",
    fontWeight: 900,
    letterSpacing: "0.12em",
    color: "#ffffff",
    margin: "0 0 10px 0",
    textTransform: "uppercase",
  };

  const taglineStyle: CSSProperties = {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: "30px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: "rgba(255, 255, 255, 0.88)",
    margin: "0 0 36px 0",
    opacity: tagOpacity,
  };

  const ecosystemPillStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 22px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: "24px",
    fontFamily: '"SFMono-Regular", Consolas, monospace',
    fontSize: "16px",
    fontWeight: 600,
    color: "#ffffff",
    letterSpacing: "0.04em",
    opacity: badgeOpacity,
  };

  const networkDotStyle: CSSProperties = {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#10b981",
    boxShadow: "0 0 10px #10b981",
  };

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={containerStyle}>
        {/* ALIVE Logo */}
        <div style={logoWrapperStyle}>
          <Img
            src={staticFile("asset/logo.png")}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            alt="ALIVE Logo"
          />
        </div>

        {/* Brand Name */}
        <h1 style={wordmarkStyle}>ALIVE</h1>

        {/* Tagline */}
        <p style={taglineStyle}>Intelligence For What’s Real.</p>

        {/* Chain Attribution */}
        <div style={ecosystemPillStyle}>
          <span style={networkDotStyle} />
          <span>Built on @XLayerOfficial</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
