import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { AddressSchema, Bytes32Schema } from "./schemas.js";

const assetIdParameters = [{ type: "address" }, { type: "bytes32" }] as const;

/**
 * Derives the owner-bound onchain asset identifier using Solidity's
 * `keccak256(abi.encode(address, bytes32))` representation.
 */
export function createAssetId(owner: Address, registrationNonce: Hex): Hex {
  return keccak256(
    encodeAbiParameters(assetIdParameters, [
      AddressSchema.parse(owner) as Address,
      Bytes32Schema.parse(registrationNonce) as Hex,
    ]),
  );
}
