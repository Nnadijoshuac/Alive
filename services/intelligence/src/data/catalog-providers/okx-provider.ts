import type {
  CatalogDiscoveryProvider,
  DiscoveredAssetCandidate,
} from "./types.js";

/**
 * OKX discovery provider -- honestly scoped.
 *
 * Research for this pass could not confirm a dedicated "OKX RWA catalog"
 * API. What OKX documents publicly under Onchain OS is a general-purpose
 * **Market API** (token/trade/market data across chains) and a **Trade
 * API** (DEX aggregation) -- neither is RWA-specific, and both require a
 * paid OKX API key (see the Market-API quota/x402 payment model OKX
 * documents). No such key is configured in this environment
 * (`OKX_API_KEY` is unset), and per the security requirement, this
 * provider must never silently substitute fabricated data when its real
 * dependency is missing.
 *
 * This class is therefore real, wired to the documented endpoint shape,
 * and structurally correct -- but with no credential configured,
 * `discover()` returns an empty result and reports exactly why, the same
 * "fail clearly, never invent" pattern used throughout this codebase
 * (see `services/intelligence/src/onchain/gateway-client.ts`'s
 * `resolveGatewayClientConfig`). Per the directive's own framing, even
 * once wired, OKX market data would only ever be DISCOVERY + TOKEN
 * IDENTITY + MARKET METADATA -- never ALIVE verification.
 */
export type OkxProviderAvailability =
  | { configured: true }
  | { configured: false; missing: string[] };

export function resolveOkxProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): OkxProviderAvailability {
  const missing: string[] = [];
  if (!env.OKX_API_KEY) missing.push("OKX_API_KEY");
  if (!env.OKX_API_SECRET) missing.push("OKX_API_SECRET");
  if (!env.OKX_API_PASSPHRASE) missing.push("OKX_API_PASSPHRASE");
  if (missing.length > 0) return { configured: false, missing };
  return { configured: true };
}

export class OkxRwaCatalogProvider implements CatalogDiscoveryProvider {
  readonly name = "okx-onchain-os-market";

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async discover(): Promise<DiscoveredAssetCandidate[]> {
    const availability = resolveOkxProviderConfig(this.env);
    if (!availability.configured) {
      // Never fabricate OKX market data. See `discoveryStatus()` for the
      // structured, reportable reason -- this method's contract is just
      // "candidates, or none."
      return [];
    }
    // Deliberately not wired to a live request: no verified OKX RWA-specific
    // endpoint was identified in this pass (see class doc comment). Wiring
    // this to OKX's general Market API to enrich price/24h-change/market-cap
    // for already-identified candidates (never to originate RWA
    // classification) is the concrete next step once credentials exist.
    void this.fetchImpl;
    return [];
  }

  /** Structured status for reporting -- distinct from `discover()`'s plain candidate list so callers can show *why* zero candidates came back. */
  discoveryStatus(): { available: boolean; reason: string } {
    const availability = resolveOkxProviderConfig(this.env);
    if (availability.configured) {
      return {
        available: true,
        reason: "Credentials configured, but no verified OKX RWA-specific endpoint is wired yet.",
      };
    }
    return {
      available: false,
      reason: `Not configured: missing ${availability.missing.join(", ")}. No dedicated OKX RWA catalog API was confirmed to exist; OKX's general Market/Trade APIs require paid credentials not present in this environment.`,
    };
  }
}
