import { readFileSync } from "node:fs";
import path from "node:path";

export type DocumentInput =
  | { kind: "fixture"; fixtureId: string; title: string }
  | { kind: "text"; text: string; title: string; uri?: string };

export type LoadedDocument = {
  title: string;
  rawText: string;
  uri?: string;
};

const FIXTURE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;

function safeFixtureSegment(fixtureId: string): string {
  if (!FIXTURE_ID_PATTERN.test(fixtureId)) {
    throw new TypeError(
      "Fixture ID must be a lowercase slug (letters, digits, '.', '_', '-')",
    );
  }
  return fixtureId;
}

/**
 * Loads a demo/fixture issuer document by ID from a fixed root directory, or
 * accepts pasted plain text directly. Deliberately does not fetch arbitrary
 * URLs or parse binary PDFs — per the hackathon scope, real-looking demo
 * fixtures plus a pasted-text path cover the ingestion surface without an
 * elaborate crawler.
 */
export function loadDocument(
  input: DocumentInput,
  fixturesRoot: string,
): LoadedDocument {
  if (input.kind === "text") {
    if (!input.text.trim()) throw new TypeError("Pasted document text is empty");
    return {
      title: input.title,
      rawText: input.text,
      ...(input.uri ? { uri: input.uri } : {}),
    };
  }

  const root = path.resolve(fixturesRoot);
  const segment = safeFixtureSegment(input.fixtureId);
  const resolved = path.resolve(root, `${segment}.txt`);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Fixture path escapes the source-documents root");
  }
  const rawText = readFileSync(resolved, "utf8");
  return { title: input.title, rawText };
}
