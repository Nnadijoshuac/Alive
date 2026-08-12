import { describe, expect, it } from "vitest";
import { createAssetId } from "../src/index.js";
import parityVector from "./fixtures/asset-id-parity.json";

describe("owner-bound asset IDs", () => {
  it("matches the shared Solidity parity vector", () => {
    expect(
      createAssetId(
        parityVector.owner as `0x${string}`,
        parityVector.registrationNonce as `0x${string}`,
      ),
    ).toBe(parityVector.assetId);
  });

  it("changes when either the owner or registration nonce changes", () => {
    const assetId = createAssetId(
      parityVector.owner as `0x${string}`,
      parityVector.registrationNonce as `0x${string}`,
    );
    expect(
      createAssetId(
        `0x${"33".repeat(20)}`,
        parityVector.registrationNonce as `0x${string}`,
      ),
    ).not.toBe(assetId);
    expect(
      createAssetId(
        parityVector.owner as `0x${string}`,
        `0x${"44".repeat(32)}`,
      ),
    ).not.toBe(assetId);
  });
});
