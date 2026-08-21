import {
  ALIVE_AUTHORIZATION_DOMAIN_NAME,
  ALIVE_AUTHORIZATION_DOMAIN_VERSION,
  Bytes32Schema,
  recoverAliveAuthorizationSigner,
  type WalletAuthorization,
  type WalletAuthorizationAction,
  type WalletAuthorizationDomain,
} from "@alive/shared";
import { keccak256, type Address, type Hex } from "viem";
import { ProtocolError } from "./errors.js";

export interface AuthorizationExpectation {
  audience: string;
  action: WalletAuthorizationAction;
  wallet: Address;
  resource: Hex;
  context: Hex;
  payloadHash: Hex;
}

function sameHex(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function authorizationDomain(
  chainId: number,
): WalletAuthorizationDomain {
  return {
    name: ALIVE_AUTHORIZATION_DOMAIN_NAME,
    version: ALIVE_AUTHORIZATION_DOMAIN_VERSION,
    chainId,
  };
}

export function hashCapabilityToken(token: Hex): Hex {
  return keccak256(Bytes32Schema.parse(token));
}

export function requireBearerCapability(
  header: string | string[] | undefined,
): Hex {
  const supplied = Array.isArray(header) ? header[0] : header;
  if (supplied === undefined) {
    throw new ProtocolError(
      401,
      "CAPABILITY_REQUIRED",
      "A resource capability is required",
    );
  }
  const match = /^Bearer\s+(0x[0-9a-fA-F]{64})$/i.exec(supplied.trim());
  if (match?.[1] === undefined) {
    throw new ProtocolError(
      401,
      "CAPABILITY_REQUIRED",
      "Authorization must contain a 32-byte bearer capability",
    );
  }
  return Bytes32Schema.parse(match[1]);
}

export function assertAuthorizationIntent(
  authorization: WalletAuthorization,
  expected: AuthorizationExpectation,
  nowSeconds: number,
): void {
  if (authorization.expiresAt <= nowSeconds) {
    throw new ProtocolError(
      410,
      "AUTHORIZATION_EXPIRED",
      "Wallet authorization has expired",
    );
  }
  if (authorization.issuedAt > nowSeconds + 5) {
    throw new ProtocolError(
      403,
      "AUTHORIZATION_MISMATCH",
      "Wallet authorization was issued in the future",
    );
  }
  if (
    authorization.audience !== expected.audience ||
    authorization.action !== expected.action ||
    authorization.wallet.toLowerCase() !== expected.wallet.toLowerCase() ||
    !sameHex(authorization.resource, expected.resource) ||
    !sameHex(authorization.context, expected.context) ||
    !sameHex(authorization.payloadHash, expected.payloadHash)
  ) {
    throw new ProtocolError(
      403,
      "AUTHORIZATION_MISMATCH",
      "Wallet authorization does not match this exact request",
    );
  }
}

export async function assertWalletAuthorizationSignature(
  authorization: WalletAuthorization,
  chainId: number,
  signature: Hex,
): Promise<void> {
  let recovered: Address;
  try {
    recovered = await recoverAliveAuthorizationSigner(
      authorization,
      authorizationDomain(chainId),
      signature,
    );
  } catch (error) {
    throw new ProtocolError(
      401,
      "AUTHORIZATION_SIGNATURE_INVALID",
      "Wallet authorization signature is invalid",
      error,
    );
  }
  if (recovered.toLowerCase() !== authorization.wallet.toLowerCase()) {
    throw new ProtocolError(
      401,
      "AUTHORIZATION_SIGNATURE_INVALID",
      "Signature does not match the authorized wallet",
    );
  }
}
