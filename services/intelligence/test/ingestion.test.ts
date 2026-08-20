import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { chunkDocumentText } from "../src/ingestion/chunker.js";
import { loadDocument } from "../src/ingestion/document-loader.js";
import { ingestDocument } from "../src/ingestion/ingestion-service.js";
import { hashSourceText } from "../src/ingestion/source-hasher.js";
import { normalizeDocumentText } from "../src/ingestion/text-normalizer.js";

const sourceDocumentsPath = fileURLToPath(
  new URL("../../../data/source-documents", import.meta.url),
);

const TAB = String.fromCharCode(9);
const CARRIAGE_RETURN = String.fromCharCode(13);
const NEWLINE = String.fromCharCode(10);
const NUL = String.fromCharCode(0);
const BELL = String.fromCharCode(7);

describe("text-normalizer", () => {
  it("normalizes line endings and collapses runaway whitespace", () => {
    const input = ["A", CARRIAGE_RETURN, NEWLINE, "B  ", TAB]
      .concat([NEWLINE, NEWLINE, NEWLINE, NEWLINE, "C   D  "])
      .join("");
    expect(normalizeDocumentText(input)).toBe("A" + NEWLINE + "B" + NEWLINE + NEWLINE + "C D");
  });

  it("collapses a tab into the same single space as runs of spaces", () => {
    const input = "A B" + TAB + "C" + NEWLINE;
    expect(normalizeDocumentText(input)).toBe("A B C");
  });

  it("strips stray control bytes that are not tab or newline", () => {
    const input = "A" + NUL + BELL + "B";
    expect(normalizeDocumentText(input)).toBe("AB");
  });
});

describe("source-hasher", () => {
  it("is deterministic for identical normalized text", () => {
    const a = hashSourceText("same text");
    const b = hashSourceText("same text");
    expect(a).toBe(b);
  });

  it("changes when the text changes", () => {
    expect(hashSourceText("text one")).not.toBe(hashSourceText("text two"));
  });
});

describe("chunker", () => {
  it("keeps a short document as a single chunk", () => {
    expect(chunkDocumentText("one paragraph")).toEqual([
      { index: 0, text: "one paragraph" },
    ]);
  });

  it("splits on paragraph boundaries under the max size", () => {
    const chunks = chunkDocumentText("para one\n\npara two", 100);
    expect(chunks).toEqual([{ index: 0, text: "para one\n\npara two" }]);
  });

  it("forces a hard split when a single paragraph exceeds max size", () => {
    const chunks = chunkDocumentText("x".repeat(25), 10);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.text.length)).toEqual([10, 10, 5]);
  });
});

describe("document-loader", () => {
  it("loads a fixture document by ID from the fixtures root", () => {
    const loaded = loadDocument(
      { kind: "fixture", fixtureId: "tusdc", title: "tUSDC fact sheet" },
      sourceDocumentsPath,
    );
    expect(loaded.title).toBe("tUSDC fact sheet");
    expect(loaded.rawText).toMatch(/DEMO DATA/);
  });

  it("rejects a fixture ID that would escape the fixtures root", () => {
    expect(() =>
      loadDocument(
        {
          kind: "fixture",
          fixtureId: "../../secrets/private-key",
          title: "x",
        },
        sourceDocumentsPath,
      ),
    ).toThrow();
  });

  it("accepts pasted text directly", () => {
    const loaded = loadDocument(
      { kind: "text", text: "pasted content", title: "Pasted doc" },
      sourceDocumentsPath,
    );
    expect(loaded.rawText).toBe("pasted content");
  });

  it("rejects empty pasted text", () => {
    expect(() =>
      loadDocument(
        { kind: "text", text: "   ", title: "Empty" },
        sourceDocumentsPath,
      ),
    ).toThrow();
  });
});

describe("ingestion-service", () => {
  it("ingests a fixture document into a hashed, chunked SourceDocument", () => {
    const document = ingestDocument(
      {
        assetId: "tusdc",
        sourceId: "demo-doc-tusdc",
        sourceType: "DEMO_FIXTURE",
        input: {
          kind: "fixture",
          fixtureId: "tusdc",
          title: "tUSDC fact sheet",
        },
        retrievedAt: "2026-08-15T00:00:00.000Z",
      },
      sourceDocumentsPath,
    );
    expect(document.assetId).toBe("tusdc");
    expect(document.textHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(document.chunks.length).toBeGreaterThan(0);
    expect(document.text).toMatch(/ALIVE Demo Cash Issuer/);
  });

  it("produces the same hash for the same fixture ingested twice", () => {
    const first = ingestDocument(
      {
        assetId: "tgold",
        sourceId: "demo-doc-tgold",
        sourceType: "DEMO_FIXTURE",
        input: { kind: "fixture", fixtureId: "tgold", title: "tGOLD" },
        retrievedAt: "2026-08-15T00:00:00.000Z",
      },
      sourceDocumentsPath,
    );
    const second = ingestDocument(
      {
        assetId: "tgold",
        sourceId: "demo-doc-tgold",
        sourceType: "DEMO_FIXTURE",
        input: { kind: "fixture", fixtureId: "tgold", title: "tGOLD" },
        retrievedAt: "2026-08-15T01:00:00.000Z",
      },
      sourceDocumentsPath,
    );
    expect(first.textHash).toBe(second.textHash);
  });

  it("rejects an unknown fixture ID", () => {
    expect(() =>
      ingestDocument(
        {
          assetId: "tusdc",
          sourceId: "demo-doc-missing",
          sourceType: "DEMO_FIXTURE",
          input: { kind: "fixture", fixtureId: "does-not-exist", title: "x" },
          retrievedAt: "2026-08-15T00:00:00.000Z",
        },
        sourceDocumentsPath,
      ),
    ).toThrow();
  });
});
