import { AbsoluteFill, Sequence } from "remotion";
import { BackgroundGrid } from "./components/BackgroundGrid";
import { Scene1Hook } from "./scenes/Scene1Hook";
import { Scene2Actions } from "./scenes/Scene2Actions";
import { Scene3Rules } from "./scenes/Scene3Rules";
import { Scene4Brand } from "./scenes/Scene4Brand";

export function AliveLaunch() {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#050806",
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Global Cinematic Background Grid & Ambient Glow */}
      <BackgroundGrid />

      {/* 0–2.5s (Frames 0–75): "RWAs are moving onchain." */}
      <Sequence from={0} durationInFrames={75}>
        <Scene1Hook />
      </Sequence>

      {/* 2.5–7.0s (Frames 75–210): 4 Actions ("Discover assets", "Verify them", "Set your mandate", "Manage your portfolio with AI") */}
      <Sequence from={75} durationInFrames={135}>
        <Scene2Actions />
      </Sequence>

      {/* 7.0–11.0s (Frames 210–330): "You set the rules." -> "ALIVE handles intelligence, monitoring, execution." */}
      <Sequence from={210} durationInFrames={120}>
        <Scene3Rules />
      </Sequence>

      {/* 11.0–15.0s (Frames 330–450): Official Logo, "ALIVE", "Intelligence For What's Real.", "Built on @XLayerOfficial" */}
      <Sequence from={330} durationInFrames={120}>
        <Scene4Brand />
      </Sequence>
    </AbsoluteFill>
  );
}
