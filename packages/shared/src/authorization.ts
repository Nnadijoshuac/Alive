import {
  hashTypedData,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";
import { hashCanonical } from "./canonical.js";
import {
  AddressSchema,
  AssetMetadataSchema,
  Bytes32Schema,
  WalletAuthorizationDomainSchema,
  WalletAuthorizationSchema,
  type AssetMetadata,
  type WalletAuthorization,
  type WalletAuthorizationDomain,
} from "./schemas.js";

export const ALIVE_AUTHORIZATION_DOMAIN_NAME = "ALIVE Verifier Authorization";
export const ALIVE_AUTHORIZATION_DOMAIN_VERSION = "1";
export const ALIVE_AUTHORIZATION_PRIMARY_TYPE = "AliveAuthorization";

export const ALIVE_AUTHORIZATION_TYPE_STRING =
  "AliveAuthorization(string audience,string action,address wallet,bytes32 resource,bytes32 context,bytes32 payloadHash,bytes32 nonce,uint64 issuedAt,uint64 expiresAt)";

export const aliveAuthorizationTypes = {
  AliveAuthorization: [
    { name: "audience", type: "string" },
    { name: "action", type: "string" },
    { name: "wallet", type: "address" },
    { name: "resource", type: "bytes32" },
    { name: "context", type: "bytes32" },
    { name: "payloadHash", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;

function normalizedAddress(value: Address): string {
  return AddressSchema.parse(value).toLowerCase();
}

function normalizedBytes32(value: Hex): string {
  return Bytes32Schema.parse(value).toLowerCase();
}

export function hashCreateAssetAuthorizationPayload(input: {
  assetId: Hex;
  owner: Address;
  metadata: AssetMetadata;
}): Hex {
  return hashCanonical({
    authorizationVersion: 1,
    action: "CREATE_ASSET",
    assetId: normalizedBytes32(input.assetId),
    owner: normalizedAddress(input.owner),
    metadata: AssetMetadataSchema.parse(input.metadata),
  });
}

export function hashCreateVerificationSessionAuthorizationPayload(input: {
  sessionId: Hex;
  assetId: Hex;
  wallet: Address;
  context: Hex;
}): Hex {
  return hashCanonical({
    authorizationVersion: 1,
    action: "CREATE_VERIFICATION_SESSION",
    sessionId: normalizedBytes32(input.sessionId),
    assetId: normalizedBytes32(input.assetId),
    wallet: normalizedAddress(input.wallet),
    context: normalizedBytes32(input.context),
  });
}

export function getAliveAuthorizationDomain(input: WalletAuthorizationDomain): TypedDataDomain {
  const domain = WalletAuthorizationDomainSchema.parse(input);
  return {
    name: ALIVE_AUTHORIZATION_DOMAIN_NAME,
    version: ALIVE_AUTHORIZATION_DOMAIN_VERSION,
    chainId: domain.chainId,
  };
}

export function getAliveAuthorizationTypedData(
  authorizationInput: WalletAuthorization,
  domainInput: WalletAuthorizationDomain,
) {
  const authorization = WalletAuthorizationSchema.parse(authorizationInput);
  return {
    domain: getAliveAuthorizationDomain(domainInput),
    types: aliveAuthorizationTypes,
    primaryType: ALIVE_AUTHORIZATION_PRIMARY_TYPE,
    message: {
      audience: authorization.audience,
      action: authorization.action,
      wallet: authorization.wallet as Address,
      resource: authorization.resource as Hex,
      context: authorization.context as Hex,
      payloadHash: authorization.payloadHash as Hex,
      nonce: authorization.nonce as Hex,
      issuedAt: BigInt(authorization.issuedAt),
      expiresAt: BigInt(authorization.expiresAt),
    },
  } as const;
}

export function hashAliveAuthorization(
  authorization: WalletAuthorization,
  domain: WalletAuthorizationDomain,
): Hex {
  return hashTypedData(getAliveAuthorizationTypedData(authorization, domain));
}

export async function recoverAliveAuthorizationSigner(
  authorization: WalletAuthorization,
  domain: WalletAuthorizationDomain,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    ...getAliveAuthorizationTypedData(authorization, domain),
    signature,
  });
}
