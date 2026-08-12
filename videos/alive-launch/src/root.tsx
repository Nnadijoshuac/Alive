import { Composition } from "remotion";
import { AliveLaunch } from "./AliveLaunch";

export const AliveVideoRoot = () => (
  <Composition
    id="AliveLaunch"
    component={AliveLaunch}
    durationInFrames={1200}
    fps={30}
    width={1920}
    height={1080}
  />
);
