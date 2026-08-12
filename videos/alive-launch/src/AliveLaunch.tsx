import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const geist = '"Geist", "Arial", "Helvetica Neue", sans-serif';
const mono =
  '"Geist Mono", "Cascadia Mono", "SFMono-Regular", Consolas, monospace';

const palette = {
  canvas: "#080a09",
  surface: "#101310",
  surfaceBright: "#171b17",
  ink: "#f1f3ed",
  muted: "#8d9589",
  line: "rgba(225, 235, 217, 0.14)",
  accent: "#b7ef62",
  danger: "#ff765f",
};

const full: CSSProperties = {
  background: palette.canvas,
  color: palette.ink,
  fontFamily: geist,
};

const enter = (frame: number, start = 0, duration = 22) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

const leave = (frame: number, start: number, duration = 18) =>
  interpolate(frame, [start, start + duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

const Reveal = ({
  children,
  progress,
  distance = 36,
  style,
}: {
  children: ReactNode;
  progress: number;
  distance?: number;
  style?: CSSProperties;
}) => (
  <div
    style={{
      opacity: progress,
      transform: `translate3d(0, ${(1 - progress) * distance}px, 0)`,
      ...style,
    }}
  >
    {children}
  </div>
);

const Grain = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      opacity: 0.045,
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.65'/%3E%3C/svg%3E\")",
      mixBlendMode: "soft-light",
    }}
  />
);

const AliveMark = ({ compact = false }: { compact?: boolean }) => {
  const frame = useCurrentFrame();
  const pulse = 0.86 + Math.sin(frame / 9) * 0.08;
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: compact ? 18 : 24 }}
    >
      <div
        style={{
          width: compact ? 46 : 62,
          height: compact ? 46 : 62,
          border: `1px solid ${palette.accent}`,
          display: "grid",
          placeItems: "center",
          transform: `scale(${pulse})`,
        }}
      >
        <svg width="72%" height="42%" viewBox="0 0 72 30" aria-hidden="true">
          <path
            d="M2 16h13l7-12 11 23 9-18 7 7h21"
            fill="none"
            stroke={palette.accent}
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span
        style={{
          fontSize: compact ? 27 : 39,
          fontWeight: 700,
          letterSpacing: "0.24em",
        }}
      >
        ALIVE
      </span>
    </div>
  );
};

const FrameChrome = ({ section }: { section: string }) => (
  <>
    <div
      style={{
        position: "absolute",
        top: 58,
        left: 72,
        right: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: mono,
        fontSize: 18,
        color: palette.muted,
        letterSpacing: "0.13em",
        zIndex: 10,
      }}
    >
      <AliveMark compact />
      <span>{section}</span>
    </div>
    <div
      style={{
        position: "absolute",
        left: 72,
        right: 72,
        bottom: 50,
        height: 1,
        background: palette.line,
        zIndex: 10,
      }}
    />
  </>
);

const Opening = () => {
  const frame = useCurrentFrame();
  const first = enter(frame, 5, 25) * leave(frame, 66, 18);
  const second = enter(frame, 82, 25);
  return (
    <AbsoluteFill style={full}>
      <FrameChrome section="PROOF OF PHYSICAL STATE" />
      <div
        style={{
          position: "absolute",
          left: 120,
          bottom: 172,
          width: 1460,
        }}
      >
        <Reveal progress={first}>
          <div
            style={{
              fontSize: 112,
              fontWeight: 520,
              letterSpacing: "-0.058em",
              lineHeight: 0.96,
            }}
          >
            Blockchains can see
            <br />
            transactions.
          </div>
        </Reveal>
        <Reveal progress={second} style={{ position: "absolute", bottom: 0 }}>
          <div
            style={{
              fontSize: 112,
              fontWeight: 520,
              letterSpacing: "-0.058em",
              lineHeight: 0.96,
            }}
          >
            They cannot see
            <br />
            <span style={{ color: palette.accent }}>the asset.</span>
          </div>
        </Reveal>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

const ScannerScene = () => {
  const frame = useCurrentFrame();
  const scanY = interpolate(frame, [12, 270], [210, 830], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const imageIn = enter(frame, -12, 28);
  const featureIn = enter(frame, 56, 34);
  const labelIn = enter(frame, 86, 24);
  const points = Array.from({ length: 34 }, (_, index) => ({
    x: 1020 + ((index * 97) % 560),
    y: 430 + ((index * 61) % 310),
    size: 3 + (index % 3),
  }));

  return (
    <AbsoluteFill style={full}>
      <FrameChrome section="ACTIVE INSPECTION" />
      <Img
        src={staticFile("forensic-laptop.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: imageIn * 0.82,
          transform: `scale(${1.045 - imageIn * 0.045})`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(90deg, rgba(8,10,9,.96) 0%, rgba(8,10,9,.72) 38%, rgba(8,10,9,.08) 73%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 338,
          width: 660,
          zIndex: 3,
        }}
      >
        <Reveal progress={enter(frame, 18, 24)}>
          <div
            style={{
              fontSize: 91,
              fontWeight: 560,
              letterSpacing: "-0.052em",
              lineHeight: 0.98,
            }}
          >
            So we gave
            <br />
            them eyes.
          </div>
        </Reveal>
        <Reveal progress={enter(frame, 62, 22)}>
          <div
            style={{
              marginTop: 42,
              fontSize: 25,
              color: palette.muted,
              lineHeight: 1.45,
              maxWidth: 490,
            }}
          >
            Active capture compares physical identity, live motion, and
            observable change.
          </div>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 900,
          right: 72,
          top: scanY,
          height: 2,
          background: palette.accent,
          boxShadow: `0 0 22px ${palette.accent}`,
          opacity: imageIn,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 900,
          right: 72,
          top: scanY - 70,
          height: 72,
          background:
            "linear-gradient(180deg, rgba(183,239,98,0), rgba(183,239,98,.10))",
          opacity: imageIn,
        }}
      />
      {points.map((point, index) => {
        const p = enter(frame, 48 + (index % 9) * 3, 18) * featureIn;
        return (
          <div
            key={`${point.x}-${point.y}`}
            style={{
              position: "absolute",
              left: point.x,
              top: point.y,
              width: point.size,
              height: point.size,
              background: palette.accent,
              opacity: p * 0.88,
              transform: `scale(${p})`,
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          right: 94,
          top: 278,
          border: `1px solid ${palette.line}`,
          background: "rgba(8,10,9,.78)",
          padding: "19px 24px",
          fontFamily: mono,
          fontSize: 18,
          color: palette.accent,
          opacity: labelIn,
        }}
      >
        47 DISTINCTIVE FEATURES
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

const Fingerprint = ({
  progress,
  mismatch = false,
}: {
  progress: number;
  mismatch?: boolean;
}) => {
  const nodes = Array.from({ length: 64 }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 32 + ((index * 47) % 245);
    return {
      x: 320 + Math.cos(angle) * radius * (0.76 + (index % 5) / 12),
      y: 310 + Math.sin(angle) * radius,
      active: mismatch ? index % 4 !== 0 : true,
    };
  });
  return (
    <div style={{ position: "relative", width: 640, height: 620 }}>
      <div
        style={{
          position: "absolute",
          inset: 28,
          border: `1px solid ${palette.line}`,
          borderRadius: "50%",
          transform: `scale(${0.82 + progress * 0.18})`,
          opacity: progress,
        }}
      />
      {nodes.map((node, index) => {
        const pointProgress = Math.max(
          0,
          Math.min(1, progress * 1.65 - index / 150),
        );
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y,
              width: node.active ? 5 : 8,
              height: node.active ? 5 : 8,
              background: node.active ? palette.accent : palette.danger,
              opacity: pointProgress,
              transform: `scale(${pointProgress})`,
              boxShadow: node.active ? `0 0 10px ${palette.accent}` : "none",
            }}
          />
        );
      })}
    </div>
  );
};

const Metric = ({
  label,
  value,
  delay,
}: {
  label: string;
  value: string;
  delay: number;
}) => {
  const frame = useCurrentFrame();
  const p = enter(frame, delay, 20);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "baseline",
        gap: 28,
        padding: "25px 0",
        borderBottom: `1px solid ${palette.line}`,
        opacity: p,
        transform: `translateX(${(1 - p) * 24}px)`,
      }}
    >
      <span style={{ fontSize: 21, color: palette.muted }}>{label}</span>
      <span style={{ fontFamily: mono, fontSize: 31, color: palette.accent }}>
        {value}
      </span>
    </div>
  );
};

const VerificationScene = () => {
  const frame = useCurrentFrame();
  const fingerprint = enter(frame, -10, 58);
  return (
    <AbsoluteFill style={full}>
      <FrameChrome section="VISUAL FINGERPRINT" />
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 190,
          bottom: 115,
          display: "grid",
          gridTemplateColumns: "0.95fr 1.05fr",
          gap: 90,
          alignItems: "center",
        }}
      >
        <Fingerprint progress={fingerprint} />
        <div>
          <Reveal progress={enter(frame, -8, 24)}>
            <div
              style={{
                fontSize: 76,
                fontWeight: 560,
                letterSpacing: "-0.048em",
                lineHeight: 1,
              }}
            >
              Same asset.
              <br />
              <span style={{ color: palette.accent }}>Live evidence.</span>
            </div>
          </Reveal>
          <div style={{ marginTop: 52 }}>
            <Metric label="PHYSICAL IDENTITY" value="POLICY PASS" delay={32} />
            <Metric label="ACTIVE LIVENESS" value="CHALLENGE PASS" delay={55} />
            <Metric label="IDENTIFIER" value="CONSISTENT" delay={78} />
            <Metric
              label="VISUAL INTEGRITY"
              value="NO MATERIAL DRIFT"
              delay={101}
            />
          </div>
        </div>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

const AttestationScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 82, mass: 0.8 },
  });
  const cardScale = 0.9 + card * 0.1;
  const collapse = interpolate(frame, [94, 150], [1, 0.68], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const shift = interpolate(frame, [94, 150], [0, -420], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <AbsoluteFill style={full}>
      <FrameChrome section="CRYPTOGRAPHIC ATTESTATION" />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "51%",
          width: 800,
          minHeight: 440,
          border: `1px solid ${palette.line}`,
          background: palette.surface,
          padding: 52,
          transform: `translate(-50%, -50%) translateX(${shift}px) scale(${cardScale * collapse})`,
          opacity: 0.45 + card * 0.55,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
          }}
        >
          <div>
            <div
              style={{ fontFamily: mono, color: palette.muted, fontSize: 17 }}
            >
              PROOF OF PHYSICAL STATE
            </div>
            <div style={{ fontSize: 47, fontWeight: 590, marginTop: 18 }}>
              VERIFIED
            </div>
          </div>
          <div
            style={{
              width: 78,
              height: 78,
              display: "grid",
              placeItems: "center",
              border: `1px solid ${palette.accent}`,
              color: palette.accent,
              fontSize: 43,
            }}
          >
            ✓
          </div>
        </div>
        <div
          style={{
            marginTop: 54,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "28px 42px",
            fontFamily: mono,
            fontSize: 18,
          }}
        >
          <div>
            <span style={{ color: palette.muted }}>ASSET</span>
            <br />
            BOUND TO SESSION
          </div>
          <div>
            <span style={{ color: palette.muted }}>IDENTITY</span>
            <br />
            POLICY SATISFIED
          </div>
          <div>
            <span style={{ color: palette.muted }}>SESSION</span>
            <br />
            SINGLE USE
          </div>
          <div>
            <span style={{ color: palette.muted }}>LIVENESS</span>
            <br />
            CHALLENGE PASSED
          </div>
        </div>
        <div
          style={{
            marginTop: 48,
            paddingTop: 26,
            borderTop: `1px solid ${palette.line}`,
            color: palette.accent,
            fontFamily: mono,
            fontSize: 18,
          }}
        >
          EIP-712 SIGNATURE VALID
        </div>
      </div>
      <Reveal
        progress={enter(frame, 116, 28)}
        style={{ position: "absolute", left: 1110, top: 425, width: 560 }}
      >
        <div
          style={{
            fontSize: 71,
            fontWeight: 560,
            letterSpacing: "-0.048em",
            lineHeight: 1,
          }}
        >
          Evidence becomes
          <br />
          <span style={{ color: palette.accent }}>verifiable.</span>
        </div>
      </Reveal>
      <Grain />
    </AbsoluteFill>
  );
};

const Node = ({
  label,
  sublabel,
  x,
  active,
}: {
  label: string;
  sublabel: string;
  x: number;
  active: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: 410,
      width: 300,
      height: 210,
      border: `1px solid ${active > 0.5 ? palette.accent : palette.line}`,
      background: palette.surface,
      display: "grid",
      alignContent: "center",
      gap: 16,
      padding: 36,
      opacity: 0.32 + active * 0.68,
      transform: `scale(${0.94 + active * 0.06})`,
    }}
  >
    <div style={{ fontSize: 31, fontWeight: 590 }}>{label}</div>
    <div style={{ color: palette.muted, fontFamily: mono, fontSize: 17 }}>
      {sublabel}
    </div>
  </div>
);

const SettlementScene = () => {
  const frame = useCurrentFrame();
  const stageOne = enter(frame, 5, 25);
  const stageTwo = enter(frame, 48, 25);
  const stageThree = enter(frame, 92, 25);
  const lineOne = interpolate(frame, [20, 72], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lineTwo = interpolate(frame, [68, 122], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const released = enter(frame, 134, 24);
  return (
    <AbsoluteFill style={full}>
      <FrameChrome section="X LAYER SETTLEMENT" />
      <div
        style={{
          position: "absolute",
          top: 235,
          left: 120,
          fontSize: 70,
          fontWeight: 560,
          letterSpacing: "-0.045em",
        }}
      >
        Reality triggers code.
      </div>
      <Node label="ASSET" sublabel="ALIVE-0001" x={120} active={stageOne} />
      <Node
        label="X LAYER"
        sublabel="ATTESTATION VALID"
        x={810}
        active={stageTwo}
      />
      <Node
        label="ESCROW"
        sublabel="1,000 TEST USDT"
        x={1500}
        active={stageThree}
      />
      <div
        style={{
          position: "absolute",
          left: 420,
          top: 515,
          width: 390 * lineOne,
          height: 2,
          background: palette.accent,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 1110,
          top: 515,
          width: 390 * lineTwo,
          height: 2,
          background: palette.accent,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          bottom: 116,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          opacity: released,
          transform: `translateY(${(1 - released) * 28}px)`,
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 21, color: palette.muted }}>
          CONTRACT EVENT · RELEASED
        </div>
        <div style={{ fontSize: 64, fontWeight: 620, color: palette.accent }}>
          ESCROW RELEASED
        </div>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

const Closing = () => {
  const frame = useCurrentFrame();
  const logo = enter(frame, -8, 25);
  const title = enter(frame, 12, 25);
  const line = interpolate(frame, [64, 118], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{ ...full, justifyContent: "center", alignItems: "center" }}
    >
      <div style={{ transform: `scale(${0.88 + logo * 0.12})`, opacity: logo }}>
        <AliveMark />
      </div>
      <Reveal progress={title} style={{ marginTop: 58, textAlign: "center" }}>
        <div
          style={{ fontSize: 94, fontWeight: 560, letterSpacing: "-0.055em" }}
        >
          Give smart contracts eyes.
        </div>
        <div style={{ marginTop: 28, fontSize: 27, color: palette.muted }}>
          AI-verified reality. X Layer moved the money.
        </div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          bottom: 92,
          width: 560 * line,
          height: 2,
          background: palette.accent,
        }}
      />
      <Grain />
    </AbsoluteFill>
  );
};

export const AliveLaunch = () => (
  <AbsoluteFill style={full}>
    <Sequence from={0} durationInFrames={150} premountFor={30}>
      <Opening />
    </Sequence>
    <Sequence from={150} durationInFrames={300} premountFor={30}>
      <ScannerScene />
    </Sequence>
    <Sequence from={450} durationInFrames={240} premountFor={30}>
      <VerificationScene />
    </Sequence>
    <Sequence from={690} durationInFrames={210} premountFor={30}>
      <AttestationScene />
    </Sequence>
    <Sequence from={900} durationInFrames={210} premountFor={30}>
      <SettlementScene />
    </Sequence>
    <Sequence from={1110} durationInFrames={90} premountFor={30}>
      <Closing />
    </Sequence>
  </AbsoluteFill>
);
