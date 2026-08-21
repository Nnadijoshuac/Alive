import { Composition } from "remotion";
import { AliveLaunch } from "./AliveLaunch";

export const AliveVideoRoot = () => (
  <Composition
    id="AliveLaunch"
    component={AliveLaunch}
    durationInFrames={450}
    fps={30}
    width={1080}
    height={1080}
  />
);
