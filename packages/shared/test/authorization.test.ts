import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  ALIVE_AUTHORIZATION_DOMAIN_NAME,
  ALIVE_AUTHORIZATION_DOMAIN_VERSION,
  getAliveAuthorizationTypedData,
  hashAliveAuthorization,
  hashCreateAssetAuthorizationPayload,
  hashCreateVerificationSessionAuthorizationPayload,
  recoverAliveAuthorizationSigner,
  type WalletAuthorization,
  type WalletAuthorizationDomain,
} from "../src/index.js";

const account = privateKeyToAccount(`0x${"12".repeat(32)}`);
const assetId = `0x${"21".repeat(32)}` as const;
const sessionId = `0x${"31".repeat(32)}` as const;
const context = `0x${"41".repeat(32)}` as const;
const domain: WalletAuthorizationDomain = {
  name: ALIVE_AUTHORIZATION_DOMAIN_NAME,
  version: ALIVE_AUTHORIZATION_DOMAIN_VERSION,
  chainId: 1_952,
};

function authorization(
  overrides: Partial<WalletAuthorization> = {},
): WalletAuthorization {
  return {
    audience: "https://verifier.alive.example",
    action: "CREATE_VERIFICATION_SESSION",
    wallet: account.address,
    resource: sessionId,
    context,
    payloadHash: hashCreateVerificationSessionAuthorizationPayload({
      sessionId,
      assetId,
      wallet: account.address,
      context,
    }),
    nonce: `0x${"51".repeat(32)}`,
    issuedAt: 1_700_000_000,
    expiresAt: 1_700_000_120,
    ...overrides,
  };
}

describe("wallet authorization", () => {
  it("recovers the wallet that signed the exact EIP-712 request", async () => {
    const value = authorization();
    const signature = await account.signTypedData(
      getAliveAuthorizationTypedData(value, domain),
    );
    await expect(
      recoverAliveAuthorizationSigner(value, domain, signature),
    ).resolves.toBe(account.address);
  });

  it("binds the signature to audience, context, payload, and chain", async () => {
    const value = authorization();
    const signature = await account.signTypedData(
      getAliveAuthorizationTypedData(value, domain),
    );
    const digest = hashAliveAuthorization(value, domain);

    expect(
      hashAliveAuthorization(
        { ...value, context: `0x${"42".repeat(32)}` },
        domain,
      ),
    ).not.toBe(digest);
    expect(
      hashAliveAuthorization(
        { ...value, audience: "https://evil.example" },
        domain,
      ),
    ).not.toBe(digest);
    expect(
      hashAliveAuthorization(
        { ...value, payloadHash: `0x${"52".repeat(32)}` },
        domain,
      ),
    ).not.toBe(digest);
    expect(hashAliveAuthorization(value, { ...domain, chainId: 196 })).not.toBe(
      digest,
    );
    await expect(
      recoverAliveAuthorizationSigner(
        { ...value, context: `0x${"42".repeat(32)}` },
        domain,
        signature,
      ),
    ).resolves.not.toBe(account.address);
  });

  it("canonicalizes address and hex casing in action payload commitments", () => {
    const lower = hashCreateVerificationSessionAuthorizationPayload({
      sessionId,
      assetId,
      wallet: account.address.toLowerCase() as typeof account.address,
      context,
    });
    const mixed = hashCreateVerificationSessionAuthorizationPayload({
      sessionId: sessionId
        .toUpperCase()
        .replace("0X", "0x") as typeof sessionId,
      assetId: assetId.toUpperCase().replace("0X", "0x") as typeof assetId,
      wallet: account.address,
      context: context.toUpperCase().replace("0X", "0x") as typeof context,
    });
    expect(mixed).toBe(lower);
  });

  it("changes the asset payload commitment when metadata changes", () => {
    const first = hashCreateAssetAuthorizationPayload({
      assetId,
      owner: account.address,
      metadata: {
        name: "Inspection laptop",
        category: "COMPUTER",
        model: "A1",
      },
    });
    const second = hashCreateAssetAuthorizationPayload({
      assetId,
      owner: account.address,
      metadata: {
        name: "Inspection laptop",
        category: "COMPUTER",
        model: "A2",
      },
    });
    expect(second).not.toBe(first);
  });
});
