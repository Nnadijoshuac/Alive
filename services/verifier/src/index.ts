import { pathToFileURL } from "node:url";
import { buildApp } from "./app.js";
import { loadVerifierConfig } from "./config.js";

export { buildApp } from "./app.js";
export { loadVerifierConfig, type VerifierConfig } from "./config.js";
export { AliveRepository } from "./db/repository.js";
export {
  FileEvidenceStore,
  decodeCaptureBase64,
  type EvidenceStore,
} from "./storage.js";
export { extractViewFingerprint } from "./vision/features.js";
export { analyzeVerification } from "./vision/matching.js";
export {
  normalizeOcrText,
  normalizedIdentifierSimilarity,
} from "./vision/ocr.js";

async function start(): Promise<void> {
  const config = loadVerifierConfig();
  const app = await buildApp(config);
  await app.listen({ host: config.host, port: config.port });
  process.stdout.write(
    `ALIVE verifier listening on http://${config.host}:${config.port}\n`,
  );
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(entrypoint).href
) {
  start().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
