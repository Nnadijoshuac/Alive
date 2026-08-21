import {
  getAliveAuthorizationTypedData,
  type WalletAuthorization,
  type WalletAuthorizationDomain,
} from "@alive/shared";
import type { Address, Hex } from "./types";

export interface AuthorizationSigner {
  address: Address;
  sign(
    authorization: WalletAuthorization,
    domain: WalletAuthorizationDomain,
  ): Promise<Hex>;
}

export function authorizationTypedData(
  authorization: WalletAuthorization,
  domain: WalletAuthorizationDomain,
) {
  return getAliveAuthorizationTypedData(authorization, domain);
}
