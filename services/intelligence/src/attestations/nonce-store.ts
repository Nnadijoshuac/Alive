import { randomBytes } from "node:crypto";
import { bytesToHex } from "viem";

/**
 * Same one-line generator as services/verifier/src/random.ts's
 * randomBytes32 — small enough to duplicate rather than take a
 * cross-service dependency for. Global uniqueness is enforced on-chain by
 * AliveEligibilityRegistry's consumed-nonce mapping; this only generates.
 */
export function generateEligibilityNonce(): `0x${string}` {
  return bytesToHex(randomBytes(32));
}
