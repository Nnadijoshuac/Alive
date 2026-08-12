import { recoverAliveAttestationSigner } from "@alive/shared";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { AttestationSigner } from "../src/signer.js";
import { result, session } from "./helpers.js";

describe("server-only EIP-712 signing", () => {
  it("signs recoverable Attestation typed data with immutable session context", async () => {
    const privateKey = `0x${"88".repeat(32)}` as const;
    const signer = new AttestationSigner({
      privateKey,
      chainId: 1_952,
      verifyingContract: `0x${"99".repeat(20)}`,
      attestationTtlSeconds: 300,
    });
    const verificationSession = session({ context: `0x${"aa".repeat(32)}` });
    const signed = await signer.sign(
      verificationSession,
      result(verificationSession.sessionId),
      new Date("2026-01-01T00:00:31.000Z"),
    );
    expect(signed.attestation.context).toBe(verificationSession.context);
    await expect(
      recoverAliveAttestationSigner(signed.attestation, signed.domain, signed.signature),
    ).resolves.toBe(privateKeyToAccount(privateKey).address);
  });
});
