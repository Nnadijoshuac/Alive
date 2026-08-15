import type { RwaExtractionMetadata } from "@alive/shared";

import type { SourceDocument } from "../ingestion/ingestion-service.js";
import { LlmProviderError, type LlmJsonProvider } from "../llm.js";
import {
  PASSPORT_EXTRACTION_PROMPT_VERSION,
  PASSPORT_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
} from "./passport-prompt.js";
import {
  ExtractionValidationError,
  validateExtractedFacts,
  type ExtractedFacts,
} from "./extraction-validator.js";

export type ExtractionResult = {
  facts: ExtractedFacts;
  meta: Omit<RwaExtractionMetadata, "extractedAt">;
  warnings: string[];
};

const KEY_FACT_LINE = /^-\s*([A-Za-z][A-Za-z ]*):\s*(.+)$/u;

/**
 * Reads the labelled "Key Facts:" block every ALIVE demo source document
 * ends with. This is the DEMO/no-AI-configured path (and the last-resort
 * path if a configured AI fails twice) — it is not a generic prose parser,
 * it reads a fixed, documented format. Every extracted field still goes
 * through validateExtractedFacts, so it obeys the same citation contract
 * as the AI path.
 */
function deterministicExtract(
  sourceDocuments: readonly SourceDocument[],
): ExtractedFacts {
  const primary = sourceDocuments[0];
  if (!primary) {
    throw new ExtractionValidationError(
      "No source documents were supplied for extraction",
    );
  }

  const facts = new Map<string, string>();
  for (const line of primary.text.split("\n")) {
    const match = KEY_FACT_LINE.exec(line.trim());
    if (match?.[1] && match[2]) {
      facts.set(match[1].trim().toLowerCase(), match[2].trim());
    }
  }

  const citations: Record<string, string[]> = {};
  const candidate: Record<string, unknown> = { citations };

  const issuer = facts.get("issuer");
  if (issuer) {
    candidate.issuerName = issuer;
    citations.issuerName = [primary.sourceId];
  }

  const underlying = facts.get("underlying");
  if (underlying) {
    candidate.underlying = underlying;
    citations.underlying = [primary.sourceId];
  }

  const supportedRaw = facts.get("redemption supported");
  if (supportedRaw !== undefined) {
    const normalized = supportedRaw.toLowerCase();
    const supported =
      normalized === "true" ? true : normalized === "false" ? false : "unknown";
    const redemption: Record<string, unknown> = { supported };
    const frequency = facts.get("redemption frequency");
    if (frequency) redemption.frequency = frequency;
    const settlementPeriod = facts.get("redemption settlement period");
    if (settlementPeriod) redemption.settlementPeriod = settlementPeriod;
    const minimumRaw = facts.get("redemption minimum");
    if (minimumRaw !== undefined) {
      const minimum = Number(minimumRaw);
      if (Number.isFinite(minimum)) redemption.minimum = minimum;
    }
    candidate.redemption = redemption;
    citations.redemption = [primary.sourceId];
  }

  return validateExtractedFacts(
    candidate,
    sourceDocuments.map((document) => document.sourceId),
  );
}

function deterministicMeta(
  sourceDocuments: readonly SourceDocument[],
  reason: "no-ai-configured" | "ai-fallback",
): Omit<RwaExtractionMetadata, "extractedAt"> {
  const allDemoFixtures = sourceDocuments.every(
    (document) => document.sourceType === "DEMO_FIXTURE",
  );
  return {
    pipelineVersion: PASSPORT_EXTRACTION_PROMPT_VERSION,
    promptVersion: PASSPORT_EXTRACTION_PROMPT_VERSION,
    mode:
      reason === "no-ai-configured" && allDemoFixtures
        ? "DEMO_FIXTURE"
        : "DETERMINISTIC_FALLBACK",
  };
}

/**
 * document text -> LLM (or deterministic reader) -> candidate JSON ->
 * strict schema + anti-hallucination validation -> ExtractedFacts.
 * The AI never decides eligibility and never touches a contract here — it
 * only proposes candidate facts, which validateExtractedFacts gates before
 * anything is merged into the passport (see extraction-normalizer.ts).
 */
export async function extractPassportFacts(params: {
  sourceDocuments: readonly SourceDocument[];
  llm: LlmJsonProvider;
}): Promise<ExtractionResult> {
  const { sourceDocuments, llm } = params;
  const availableSourceIds = sourceDocuments.map((document) => document.sourceId);

  if (llm.name === "disabled") {
    return {
      facts: deterministicExtract(sourceDocuments),
      meta: deterministicMeta(sourceDocuments, "no-ai-configured"),
      warnings: [],
    };
  }

  const prompt = buildExtractionPrompt(
    sourceDocuments.map((document) => ({
      sourceId: document.sourceId,
      title: document.title,
      text: document.text,
    })),
  );

  async function attempt(feedback?: string): Promise<ExtractedFacts> {
    const candidate = await llm.generatePolicyJson({
      mandate: feedback
        ? `${prompt}\n\nYour previous response was rejected: ${feedback}\nReturn corrected strict JSON only.`
        : prompt,
      systemPrompt: PASSPORT_EXTRACTION_SYSTEM_PROMPT,
    });
    return validateExtractedFacts(candidate, availableSourceIds);
  }

  const aiMeta: Omit<RwaExtractionMetadata, "extractedAt"> = {
    pipelineVersion: PASSPORT_EXTRACTION_PROMPT_VERSION,
    promptVersion: PASSPORT_EXTRACTION_PROMPT_VERSION,
    mode: "AI",
    ...(llm.model ? { model: llm.model } : {}),
  };

  try {
    return { facts: await attempt(), meta: aiMeta, warnings: [] };
  } catch (firstError) {
    if (
      !(firstError instanceof LlmProviderError) &&
      !(firstError instanceof ExtractionValidationError)
    ) {
      throw firstError;
    }
    try {
      return {
        facts: await attempt(firstError.message),
        meta: aiMeta,
        warnings: [
          "AI extraction required one retry after an invalid first response.",
        ],
      };
    } catch (secondError) {
      if (
        !(secondError instanceof LlmProviderError) &&
        !(secondError instanceof ExtractionValidationError)
      ) {
        throw secondError;
      }
      return {
        facts: deterministicExtract(sourceDocuments),
        meta: deterministicMeta(sourceDocuments, "ai-fallback"),
        warnings: [
          `AI extraction failed twice (${secondError.message}); used the deterministic fallback extractor.`,
        ],
      };
    }
  }
}
