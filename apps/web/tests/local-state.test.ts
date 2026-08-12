import { afterEach, describe, expect, it, vi } from "vitest";
import { rememberAsset, type LocalAssetEntry } from "@/lib/local-state";
import type { Address, Hex } from "@/lib/types";

afterEach(() => vi.unstubAllGlobals());

describe("local asset persistence boundary", () => {
  it("never serializes a registration nonce with the public asset record", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const registrationNonce = `0x${"91".repeat(32)}` as Hex;
    const entry = {
      asset: {
        assetId: `0x${"92".repeat(32)}` as Hex,
        owner: `0x${"93".repeat(20)}` as Address,
        metadata: { name: "Nonce-safe asset", category: "COMPUTER" as const },
        createdAt: "2026-01-01T00:00:00.000Z",
        fingerprintHash: `0x${"94".repeat(32)}` as Hex,
        registrationViewCount: 6,
      },
      registrationNonce,
    } as LocalAssetEntry & { registrationNonce: Hex };

    rememberAsset(entry);

    const serialized = values.get("alive.local.assets") ?? "";
    expect(serialized).not.toContain("registrationNonce");
    expect(serialized).not.toContain(registrationNonce);
    expect(JSON.parse(serialized)).toEqual([{ asset: entry.asset }]);
  });
});
