import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";
import {
  AliveAttestationSchema,
  AttestationDomainSchema,
  type AliveAttestation,
  type AttestationDomain,
} from "./schemas.js";

export const ALIVE_ATTESTATION_DOMAIN_NAME = "Alive Protocol";
export const ALIVE_ATTESTATION_DOMAIN_VERSION = "1";
export const ALIVE_ATTESTATION_PRIMARY_TYPE = "Attestation";

export const ALIVE_ATTESTATION_TYPE_STRING =
  "Attestation(bytes32 assetId,bytes32 fingerprintHash,bytes32 sessionId,address subject,bytes32 context,uint16 identityScore,uint16 livenessScore,uint16 integrityScore,bool verified,bytes32 evidenceHash,uint64 issuedAt,uint64 expiresAt)";

export const aliveAttestationTypes = {
  Attestation: [
    { name: "assetId", type: "bytes32" },
    { name: "fingerprintHash", type: "bytes32" },
    { name: "sessionId", type: "bytes32" },
    { name: "subject", type: "address" },
    { name: "context", type: "bytes32" },
    { name: "identityScore", type: "uint16" },
    { name: "livenessScore", type: "uint16" },
    { name: "integrityScore", type: "uint16" },
    { name: "verified", type: "bool" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

/** Matches Solidity: keccak256(abi.encode(escrowContractAddress, escrowIdBytes32)). */
export function createEscrowAttestationContext(escrowContract: Address, escrowId: Hex): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(escrowId)) throw new TypeError("Escrow ID must be bytes32");
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }],
      [escrowContract, escrowId],
    ),
  );
}

export function getAliveAttestationDomain(input: AttestationDomain): TypedDataDomain {
  const domain = AttestationDomainSchema.parse(input);
  return {
    name: ALIVE_ATTESTATION_DOMAIN_NAME,
    version: ALIVE_ATTESTATION_DOMAIN_VERSION,
    chainId: domain.chainId,
    verifyingContract: domain.verifyingContract as Address,
  };
}

export function getAliveAttestationTypedData(attestationInput: AliveAttestation, domainInput: AttestationDomain) {
  const attestation = AliveAttestationSchema.parse(attestationInput);
  return {
    domain: getAliveAttestationDomain(domainInput),
    types: aliveAttestationTypes,
    primaryType: ALIVE_ATTESTATION_PRIMARY_TYPE,
    message: {
      assetId: attestation.assetId as Hex,
      fingerprintHash: attestation.fingerprintHash as Hex,
      sessionId: attestation.sessionId as Hex,
      subject: attestation.subject as Address,
      context: attestation.context as Hex,
      identityScore: attestation.identityScore,
      livenessScore: attestation.livenessScore,
      integrityScore: attestation.integrityScore,
      verified: attestation.verified,
      evidenceHash: attestation.evidenceHash as Hex,
      issuedAt: BigInt(attestation.issuedAt),
      expiresAt: BigInt(attestation.expiresAt),
    },
  } as const;
}

export function hashAliveAttestation(attestation: AliveAttestation, domain: AttestationDomain): Hex {
  return hashTypedData(getAliveAttestationTypedData(attestation, domain));
}

export async function recoverAliveAttestationSigner(
  attestation: AliveAttestation,
  domain: AttestationDomain,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({ ...getAliveAttestationTypedData(attestation, domain), signature });
}
