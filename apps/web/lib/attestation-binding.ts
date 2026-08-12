import { hashAliveAttestation, recoverAliveAttestationSigner } from "@alive/shared";
import type { Address, SignedAttestation, VerificationResult, VerificationSession } from "./types";

function sameHex(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export async function validateAttestationBinding(
  session: VerificationSession,
  result: VerificationResult,
  signed: SignedAttestation,
  expectedChainId: number,
  expectedRegistry?: Address,
  expectedVerifier?: Address,
  expectedFingerprintHash?: string,
): Promise<string | undefined> {
  const attestation = signed.attestation;
  if (!sameHex(result.sessionId, session.sessionId) || !sameHex(attestation.sessionId, session.sessionId)) {
    return "The signed session does not match the active verification capability.";
  }
  if (!sameHex(result.assetId, session.assetId) || !sameHex(attestation.assetId, session.assetId)) {
    return "The signed asset does not match the requested physical baseline.";
  }
  if (expectedFingerprintHash && !sameHex(attestation.fingerprintHash, expectedFingerprintHash)) {
    return "The signed fingerprint commitment does not match the registered asset baseline.";
  }
  if (!sameHex(attestation.subject, session.wallet)) {
    return "The signed subject does not match the wallet bound to this session.";
  }
  if (!sameHex(attestation.context, session.context)) {
    return "The signed context does not match this escrow operation.";
  }
  if (!sameHex(attestation.evidenceHash, result.evidenceHash)) {
    return "The signed evidence commitment does not match the analyzed result.";
  }
  if (
    attestation.identityScore !== result.identityScoreBps
    || attestation.livenessScore !== result.livenessScoreBps
    || attestation.integrityScore !== result.integrityScoreBps
    || attestation.verified !== result.verified
  ) {
    return "The signed scores do not match the analyzed result.";
  }
  if (signed.domain.chainId !== expectedChainId) {
    return "The attestation domain does not match the active chain.";
  }
  if (expectedRegistry && !sameHex(signed.domain.verifyingContract, expectedRegistry)) {
    return "The attestation domain does not match the configured registry.";
  }
  if (!sameHex(hashAliveAttestation(attestation, signed.domain), signed.digest)) {
    return "The attestation digest does not match its EIP-712 payload.";
  }
  try {
    const recovered = await recoverAliveAttestationSigner(attestation, signed.domain, signed.signature);
    if (!sameHex(recovered, signed.signer)) return "The EIP-712 signature does not match the reported signer.";
    if (expectedVerifier && !sameHex(recovered, expectedVerifier)) {
      return "The EIP-712 signature does not match the verifier authorized by the registry.";
    }
  } catch {
    return "The EIP-712 signature could not be recovered.";
  }
  return undefined;
}
