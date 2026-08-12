import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  getAliveAttestationTypedData,
  ALIVE_ATTESTATION_PRIMARY_TYPE,
  ALIVE_ATTESTATION_TYPE_STRING,
  hashAliveAttestation,
  recoverAliveAttestationSigner,
  type AliveAttestation,
  type AttestationDomain,
} from "../src/index.js";

const privateKey = `0x${"42".repeat(32)}` as const;

describe("ALIVE EIP-712 attestation", () => {
  it("recovers the dedicated signer and changes digest with escrow context", async () => {
    const account = privateKeyToAccount(privateKey);
    const domain: AttestationDomain = {
      chainId: 1_952,
      verifyingContract: `0x${"12".repeat(20)}`,
    };
    const attestation: AliveAttestation = {
      assetId: `0x${"01".repeat(32)}`,
      fingerprintHash: `0x${"09".repeat(32)}`,
      sessionId: `0x${"02".repeat(32)}`,
      subject: `0x${"03".repeat(20)}`,
      context: `0x${"04".repeat(32)}`,
      identityScore: 9_300,
      livenessScore: 9_100,
      integrityScore: 8_700,
      verified: true,
      evidenceHash: `0x${"05".repeat(32)}`,
      issuedAt: 1_700_000_000,
      expiresAt: 1_700_000_300,
    };
    const signature = await account.signTypedData(getAliveAttestationTypedData(attestation, domain));

    expect(ALIVE_ATTESTATION_PRIMARY_TYPE).toBe("Attestation");
    expect(ALIVE_ATTESTATION_TYPE_STRING).toBe(
      "Attestation(bytes32 assetId,bytes32 fingerprintHash,bytes32 sessionId,address subject,bytes32 context,uint16 identityScore,uint16 livenessScore,uint16 integrityScore,bool verified,bytes32 evidenceHash,uint64 issuedAt,uint64 expiresAt)",
    );
    await expect(recoverAliveAttestationSigner(attestation, domain, signature)).resolves.toBe(account.address);
    expect(hashAliveAttestation(attestation, domain)).not.toBe(
      hashAliveAttestation({ ...attestation, context: `0x${"00".repeat(32)}` }, domain),
    );
    expect(hashAliveAttestation(attestation, domain)).not.toBe(
      hashAliveAttestation({ ...attestation, fingerprintHash: `0x${"10".repeat(32)}` }, domain),
    );
  });
});
