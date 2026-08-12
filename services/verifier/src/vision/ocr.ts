interface TesseractResult {
  data: { text: string };
}

interface TesseractModule {
  recognize: (
    image: Buffer,
    language: string,
    options: { logger: () => void },
  ) => Promise<TesseractResult>;
}

let tesseractModule: Promise<TesseractModule | undefined> | undefined;

export function normalizeOcrText(value: string): string[] {
  const normalized = value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[|]/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  if (normalized === "") return [];
  return [...new Set(normalized.split(/\s+/).filter((token) => token.length >= 2))];
}

export function normalizedIdentifierSimilarity(expected: string, observed: readonly string[]): number {
  const expectedJoined = normalizeOcrText(expected).join("");
  if (expectedJoined === "") return 0;
  const candidates = [observed.join(""), ...observed];
  let best = 0;
  for (const candidateValue of candidates) {
    const candidate = normalizeOcrText(candidateValue).join("");
    if (candidate === "") continue;
    if (candidate.includes(expectedJoined) || expectedJoined.includes(candidate)) {
      best = Math.max(best, Math.min(candidate.length, expectedJoined.length) / Math.max(candidate.length, expectedJoined.length));
      continue;
    }
    const rows = new Array<number>(candidate.length + 1);
    for (let index = 0; index <= candidate.length; index += 1) rows[index] = index;
    for (let expectedIndex = 1; expectedIndex <= expectedJoined.length; expectedIndex += 1) {
      let diagonal = rows[0] ?? 0;
      rows[0] = expectedIndex;
      for (let candidateIndex = 1; candidateIndex <= candidate.length; candidateIndex += 1) {
        const previous = rows[candidateIndex] ?? 0;
        const substitution = diagonal + (expectedJoined[expectedIndex - 1] === candidate[candidateIndex - 1] ? 0 : 1);
        rows[candidateIndex] = Math.min((rows[candidateIndex] ?? 0) + 1, (rows[candidateIndex - 1] ?? 0) + 1, substitution);
        diagonal = previous;
      }
    }
    const distance = rows[candidate.length] ?? Math.max(expectedJoined.length, candidate.length);
    best = Math.max(best, 1 - distance / Math.max(expectedJoined.length, candidate.length));
  }
  return Math.max(0, Math.min(1, best));
}

async function loadTesseract(): Promise<TesseractModule | undefined> {
  const packageName = "tesseract.js";
  tesseractModule ??= import(packageName).then((module) => module as TesseractModule).catch(() => undefined);
  return tesseractModule;
}

export async function extractOcrText(image: Buffer, enabled: boolean): Promise<string[]> {
  if (!enabled) return [];
  const tesseract = await loadTesseract();
  if (tesseract === undefined) return [];
  try {
    const result = await tesseract.recognize(image, "eng", { logger: () => undefined });
    return normalizeOcrText(result.data.text);
  } catch {
    return [];
  }
}
