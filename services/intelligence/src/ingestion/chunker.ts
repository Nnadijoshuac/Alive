export type DocumentChunk = {
  index: number;
  text: string;
};

const DEFAULT_MAX_CHARS = 4_000;

/**
 * Paragraph-aware splitter so a document can be handed to an LLM (or read by
 * a human reviewer) in bounded pieces without cutting a sentence in half
 * where avoidable. This is not a RAG chunker with overlap/embeddings — the
 * hackathon MVP extracts from one document at a time in a single prompt, so
 * chunk count mostly matters for the "is this document too large" gate and
 * for citation display.
 */
export function chunkDocumentText(
  normalizedText: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): DocumentChunk[] {
  if (maxChars <= 0) throw new RangeError("maxChars must be positive");
  const paragraphs = normalizedText.split(/\n{2,}/u).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }
    for (let offset = 0; offset < paragraph.length; offset += maxChars) {
      chunks.push(paragraph.slice(offset, offset + maxChars));
    }
    current = "";
  }
  if (current) chunks.push(current);

  return chunks.map((text, index) => ({ index, text }));
}
