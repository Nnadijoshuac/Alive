import { chunkDocumentText, type DocumentChunk } from "./chunker.js";
import { loadDocument, type DocumentInput } from "./document-loader.js";
import { hashSourceText } from "./source-hasher.js";
import { normalizeDocumentText } from "./text-normalizer.js";

/**
 * Mirrors the sourceType vocabulary already enforced by
 * `@alive/shared`'s AssetSourceSchema, so an ingested document can become a
 * passport source citation without inventing a second taxonomy.
 */
export const INGESTION_SOURCE_TYPES = [
  "ISSUER_DOCUMENTATION",
  "OFFICIAL_TOKEN_DOCUMENTATION",
  "OFFICIAL_PROTOCOL_API",
  "REGULATORY_FILING",
  "DEMO_FIXTURE",
] as const;
export type IngestionSourceType = (typeof INGESTION_SOURCE_TYPES)[number];

export type SourceDocument = {
  sourceId: string;
  assetId: string;
  sourceType: IngestionSourceType;
  title: string;
  uri?: string;
  text: string;
  textHash: `0x${string}`;
  chunks: DocumentChunk[];
  retrievedAt: string;
};

export type IngestParams = {
  assetId: string;
  sourceId: string;
  sourceType: IngestionSourceType;
  input: DocumentInput;
  retrievedAt: string;
};

const MAX_DOCUMENT_CHARS = 60_000;

export function ingestDocument(
  params: IngestParams,
  fixturesRoot: string,
): SourceDocument {
  const loaded = loadDocument(params.input, fixturesRoot);
  const text = normalizeDocumentText(loaded.rawText);
  if (!text) throw new TypeError("Document contains no extractable text");
  if (text.length > MAX_DOCUMENT_CHARS) {
    throw new RangeError(
      `Document exceeds the ${MAX_DOCUMENT_CHARS}-character ingestion limit`,
    );
  }
  return {
    sourceId: params.sourceId,
    assetId: params.assetId,
    sourceType: params.sourceType,
    title: loaded.title,
    ...(loaded.uri ? { uri: loaded.uri } : {}),
    text,
    textHash: hashSourceText(text),
    chunks: chunkDocumentText(text),
    retrievedAt: params.retrievedAt,
  };
}
