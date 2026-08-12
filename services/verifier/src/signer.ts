import {
  getAliveAttestationTypedData,
  hashAliveAttestation,
  type AliveAttestation,
  type AttestationDomain,
  type SignedAttestation,
  type VerificationResult,
  type VerificationSession,
} from "@alive/shared";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { ProtocolError } from "./errors.js";

export interface AttestationSignerOptions {
  privateKey?: Hex;
  chainId?: number;
  verifyingContract?: Address;
  attestationTtlSeconds: number;
}

export class AttestationSigner {
  private readonly account?: ReturnType<typeof privateKeyToAccount>;
  private readonly domain?: AttestationDomain;
  private readonly ttlSeconds: number;

  constructor(options: AttestationSignerOptions) {
    this.ttlSeconds = options.attestationTtlSeconds;
    if (options.privateKey !== undefined && options.chainId !== undefined && options.verifyingContract !== undefined) {
      this.account = privateKeyToAccount(options.privateKey);
      this.domain = { chainId: options.chainId, verifyingContract: options.verifyingContract };
    }
  }

  get configured(): boolean {
    return this.account !== undefined && this.domain !== undefined;
  }

  get address(): Address | undefined {
    return this.account?.address;
  }

  async sign(session: VerificationSession, result: VerificationResult, now: Date): Promise<SignedAttestation> {
    if (this.account === undefined || this.domain === undefined) {
      throw new ProtocolError(
        503,
        "SIGNER_NOT_CONFIGURED",
        "Configure the server-only verifier key, chain ID, and attestation registry address",
      );
    }
    if (session.sessionId.toLowerCase() !== result.sessionId.toLowerCase()) {
      throw new ProtocolError(409, "RESULT_SESSION_MISMATCH", "Result does not belong to this session");
    }
    const issuedAt = Math.floor(Date.parse(result.timestamp) / 1_000);
    const expiresAt = issuedAt + this.ttlSeconds;
    if (Math.floor(now.getTime() / 1_000) >= expiresAt) {
      throw new ProtocolError(410, "ATTESTATION_WINDOW_EXPIRED", "Analysis is too old to attest");
    }
    const attestation: AliveAttestation = {
      assetId: result.assetId,
      sessionId: result.sessionId,
      subject: session.wallet,
      context: session.context,
      identityScore: result.identityScoreBps,
      livenessScore: result.livenessScoreBps,
      integrityScore: result.integrityScoreBps,
      verified: result.verified,
      evidenceHash: result.evidenceHash,
      issuedAt,
      expiresAt,
    };
    const signature = await this.account.signTypedData(getAliveAttestationTypedData(attestation, this.domain));
    return {
      attestation,
      domain: this.domain,
      signature,
      digest: hashAliveAttestation(attestation, this.domain),
      signer: this.account.address,
    };
  }
}
