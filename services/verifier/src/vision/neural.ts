import { normalizeVector } from "./math.js";

interface NeuralOptions {
  enabled: boolean;
  model: string;
}

interface TensorLike {
  data?: ArrayLike<number>;
  tolist?: () => unknown;
}

type FeatureExtractor = (
  input: unknown,
  options?: Record<string, unknown>,
) => Promise<TensorLike>;

let cachedExtractor: Promise<FeatureExtractor | undefined> | undefined;

async function loadExtractor(
  model: string,
): Promise<FeatureExtractor | undefined> {
  cachedExtractor ??= (async () => {
    try {
      // A variable keeps this a true optional runtime import; offline builds do not need model code.
      const packageName = "@huggingface/transformers";
      const transformers = (await import(packageName)) as {
        pipeline: (
          task: string,
          modelName: string,
          options: Record<string, unknown>,
        ) => Promise<unknown>;
      };
      const pipe = await transformers.pipeline(
        "image-feature-extraction",
        model,
        {
          device: "cpu",
        },
      );
      return pipe as unknown as FeatureExtractor;
    } catch {
      return undefined;
    }
  })();
  return cachedExtractor;
}

function flatten(value: unknown, output: number[]): void {
  if (typeof value === "number") output.push(value);
  else if (Array.isArray(value))
    for (const entry of value) flatten(entry, output);
}

export async function extractNeuralEmbedding(
  image: Buffer,
  options: NeuralOptions,
): Promise<number[] | undefined> {
  if (!options.enabled) return undefined;
  const extractor = await loadExtractor(options.model);
  if (extractor === undefined) return undefined;
  try {
    const dataUrl = `data:image/jpeg;base64,${image.toString("base64")}`;
    const result = await extractor(dataUrl, {
      pooling: "mean",
      normalize: true,
    });
    const values =
      result.data === undefined ? [] : Array.from(result.data, Number);
    if (values.length === 0 && result.tolist !== undefined)
      flatten(result.tolist(), values);
    return values.length === 0 ? undefined : normalizeVector(values);
  } catch {
    return undefined;
  }
}
