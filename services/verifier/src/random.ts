import { randomBytes, randomInt } from "node:crypto";
import { bytesToHex, type Hex } from "viem";
import type { ChallengeType, VerificationChallenge } from "@alive/shared";

export function randomBytes32(): Hex {
  return bytesToHex(randomBytes(32));
}

const prompts: Record<ChallengeType, string> = {
  SHOW_FRONT: "Hold the front of the asset fully inside the reticle.",
  SHOW_BACK: "Turn the asset and show its back surface.",
  TURN_LEFT: "Rotate the physical asset to its left side.",
  TURN_RIGHT: "Rotate the physical asset to its right side.",
  SHOW_IDENTIFIER: "Show the model or serial identifier at readable distance.",
  MOVE_CLOSER: "Move the asset closer without leaving the frame.",
  MOVE_AWAY: "Move the asset farther away while keeping it visible.",
};

function shuffled<T>(values: readonly T[]): T[] {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const selected = randomInt(index + 1);
    const current = output[index];
    output[index] = output[selected] as T;
    output[selected] = current as T;
  }
  return output;
}

export function createChallenges(hasIdentifier: boolean, count = 4): VerificationChallenge[] {
  const base: ChallengeType[] = [
    "SHOW_FRONT",
    "SHOW_BACK",
    "TURN_LEFT",
    "TURN_RIGHT",
  ];
  const capacity = Math.max(1, Math.min(count, base.length + (hasIdentifier ? 1 : 0)));
  const selected = hasIdentifier
    ? [...shuffled(base).slice(0, capacity - 1), "SHOW_IDENTIFIER" as const]
    : shuffled(base).slice(0, capacity);
  return shuffled(selected)
    .map((type, sequence) => ({
      id: randomBytes32(),
      sequence,
      type,
      prompt: prompts[type],
      completedAt: null,
    }));
}
