import {
  getAliveEligibilityTypedData,
  hashAliveEligibilityAttestation,
  hashAssetId,
  hashEligibilityReasons,
  type EligibilityAttestation,
  type EligibilityAttestationDomain,
  type EligibilityVerdict,
  type SignedEligibilityAttestation,
} from "@alive/shared";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

import { generateEligibilityNonce } from "./nonce-store.js";

export class EligibilitySignerError extends Error {
  constructor(
    readonly code: "SIGNER_NOT_CONFIGURED" | "VERDICT_MISSING_MARKET_SNAPSHOT",
    message: string,
  ) {
    super(message);
    this.name = "EligibilitySignerError";
  }
}

export interface EligibilitySignerOptions {
  privateKey?: Hex;
  chainId?: number;
  verifyingContract?: Address;
}

/**
 * Mirrors services/verifier/src/signer.ts's AttestationSigner: fails closed
 * (a clear "not configured" error, never a silent no-op) when the
 * server-only key/chain/contract triple is unset, wraps viem's
 * privateKeyToAccount + signTypedData exactly the same way. This is the
 * legacy verifier's strongest reusable pattern, applied to the new
 * eligibility attestation instead of the physical-asset one.
 */
export class EligibilitySigner {
  private readonly account?: ReturnType<typeof privateKeyToAccount>;
  private readonly domain?: EligibilityAttestationDomain;

  constructor(options: EligibilitySignerOptions) {
    if (
      options.privateKey !== undefined &&
      options.chainId !== undefined &&
      options.verifyingContract !== undefined
    ) {
      this.account = privateKeyToAccount(options.privateKey);
      this.domain = {
        chainId: options.chainId,
        verifyingContract: options.verifyingContract,
      };
    }
  }

  get configured(): boolean {
    return this.account !== undefined && this.domain !== undefined;
  }

  get address(): Address | undefined {
    return this.account?.address;
  }

  async sign(
    assetId: string,
    verdict: EligibilityVerdict,
    now: Date,
  ): Promise<SignedEligibilityAttestation> {
    if (this.account === undefined || this.domain === undefined) {
      throw new EligibilitySignerError(
        "SIGNER_NOT_CONFIGURED",
        "Configure ELIGIBILITY_SIGNER_PRIVATE_KEY, ELIGIBILITY_CHAIN_ID, and ELIGIBILITY_REGISTRY_ADDRESS to publish onchain verdicts.",
      );
    }
    if (!verdict.marketSnapshotHash) {
      throw new EligibilitySignerError(
        "VERDICT_MISSING_MARKET_SNAPSHOT",
        "Cannot sign a verdict that has no market snapshot commitment.",
      );
    }

    const issuedAt = Math.floor(now.getTime() / 1_000);
    const validUntil = Math.min(
      Math.floor(Date.parse(verdict.validUntil) / 1_000),
      issuedAt + 86_400,
    );
    const attestation: EligibilityAttestation = {
      assetIdHash: hashAssetId(assetId),
      eligible: verdict.eligible,
      reasonHash: hashEligibilityReasons(verdict.reasons),
      passportHash: verdict.passportHash,
      marketSnapshotHash: verdict.marketSnapshotHash,
      policyHash: verdict.policyHash,
      issuedAt,
      validUntil,
      nonce: generateEligibilityNonce(),
    };

    const signature = await this.account.signTypedData(
      getAliveEligibilityTypedData(attestation, this.domain),
    );
    return {
      attestation,
      domain: this.domain,
      signature,
      digest: hashAliveEligibilityAttestation(attestation, this.domain),
      signer: this.account.address,
    };
  }
}
