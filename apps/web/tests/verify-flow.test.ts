import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAssetDocumentation, stageErrorMessage } from "@/lib/verify-flow";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("loadAssetDocumentation", () => {
  it("uses ALIVE's real official sources for ttbill-b and never calls the fixture endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          sources: [
            {
              sourceId: "superstate-docs-invesco-ustb-2026-08-17",
              assetId: "ttbill-b",
              sourceType: "ISSUER_DOCUMENTATION",
              title: "Invesco USTB | Superstate",
              textHash: `0x${"11".repeat(32)}`,
              chunkCount: 1,
              retrievedAt: "2026-08-17T00:00:00.000Z",
            },
            {
              sourceId: "superstate-product-page-ustb-2026-08-17",
              assetId: "ttbill-b",
              sourceType: "OFFICIAL_TOKEN_DOCUMENTATION",
              title: "USTB — Superstate",
              textHash: `0x${"22".repeat(32)}`,
              chunkCount: 1,
              retrievedAt: "2026-08-17T00:00:00.000Z",
            },
          ],
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAssetDocumentation("ttbill-b", "TTBILL-B");

    expect(result).toBe("official");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, unknown];
    expect(url).toContain("/api/assets/ttbill-b/ingest-official-sources");
    expect(url.endsWith("/api/assets/ttbill-b/ingest")).toBe(false);
  });

  it("falls back to the demo fixture only when the asset has no official sources registered", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "ASSET_HAS_NO_OFFICIAL_SOURCES",
              message: "no official sources",
            },
          },
          404,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            sourceId: "demo-doc-tgold",
            assetId: "tgold",
            sourceType: "DEMO_FIXTURE",
            title: "tGOLD fact sheet",
            textHash: `0x${"33".repeat(32)}`,
            chunkCount: 1,
            retrievedAt: "2026-08-17T00:00:00.000Z",
          },
          201,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAssetDocumentation("tgold", "tGOLD");

    expect(result).toBe("demo-fixture");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [officialUrl] = fetchMock.mock.calls[0] as [string, unknown];
    const [fixtureUrl, fixtureInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(officialUrl).toContain("/ingest-official-sources");
    expect(fixtureUrl).toContain("/api/assets/tgold/ingest");
    expect(String(fixtureInit.body)).toContain('"kind":"fixture"');
  });

  it("does not fall back to a demo fixture for a non-404 official-sources failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: { code: "INTERNAL_ERROR", message: "boom" } },
        500,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAssetDocumentation("ttbill-b", "TTBILL-B")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("stageErrorMessage", () => {
  it("names the specific stage that failed instead of blaming connectivity generically", () => {
    expect(stageErrorMessage("read")).toBe("Unable to load issuer documentation.");
    expect(stageErrorMessage("extract")).toBe("AI extraction failed.");
    expect(stageErrorMessage("sources")).toBe("Could not verify source provenance.");
    expect(stageErrorMessage("evaluate")).toBe("Could not evaluate eligibility.");
    expect(stageErrorMessage("identify")).toBe("Could not identify this asset.");
  });

  it("falls back to a generic message only when no stage is known", () => {
    expect(stageErrorMessage(undefined)).toBe("The intelligence service did not respond.");
  });
});
