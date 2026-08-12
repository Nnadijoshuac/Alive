import { describe, expect, it } from "vitest";
import { createAssetId, hashCreateAssetAuthorizationPayload } from "@alive/shared";
import { authorizationTypedData } from "@/lib/authorization";
import { assetRegistrationArgs, assetRegistryAbi } from "@/lib/contracts";
import type { Address, Hex } from "@/lib/types";

const wallet = `0x${"22".repeat(20)}` as Address;
const registrationNonce = `0x${"23".repeat(32)}` as Hex;
const resource = createAssetId(wallet, registrationNonce);
const metadata = { name: "Authorized object", category: "COMPUTER" as const };

describe("wallet authorization typed data", () => {
  it("uses the shared exact domain, field order, and integer timestamps", () => {
    const authorization = {
      audience: "http://127.0.0.1:4100",
      action: "CREATE_ASSET" as const,
      wallet,
      resource,
      context: `0x${"00".repeat(32)}` as Hex,
      payloadHash: hashCreateAssetAuthorizationPayload({ assetId: resource, owner: wallet, metadata }),
      nonce: registrationNonce,
      issuedAt: 10,
      expiresAt: 130,
    };
    const typed = authorizationTypedData(authorization, {
      name: "ALIVE Verifier Authorization",
      version: "1",
      chainId: 1952,
    });

    expect(typed.primaryType).toBe("AliveAuthorization");
    expect(typed.domain).toEqual({ name: "ALIVE Verifier Authorization", version: "1", chainId: 1952 });
    expect(typed.types.AliveAuthorization.map((field) => field.name)).toEqual([
      "audience", "action", "wallet", "resource", "context", "payloadHash", "nonce", "issuedAt", "expiresAt",
    ]);
    expect(typed.message).toMatchObject({ resource, wallet, nonce: registrationNonce, issuedAt: 10n, expiresAt: 130n });

    const fingerprintHash = `0x${"24".repeat(32)}` as Hex;
    const metadataHash = `0x${"25".repeat(32)}` as Hex;
    const args = assetRegistrationArgs({
      assetId: resource,
      registrationNonce: authorization.nonce,
      fingerprintHash,
      metadataHash,
      metadataURI: "ipfs://metadata",
    });
    const registerAsset = assetRegistryAbi.find((item) => item.type === "function" && item.name === "registerAsset");
    expect(registerAsset?.inputs.map((input) => input.name)).toEqual([
      "assetId",
      "registrationNonce",
      "fingerprintHash",
      "metadataHash",
      "metadataURI",
    ]);
    expect(args).toEqual([resource, typed.message.nonce, fingerprintHash, metadataHash, "ipfs://metadata"]);
    expect(args[1]).toBe(typed.message.nonce);
  });
});
