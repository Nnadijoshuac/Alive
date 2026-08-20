import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

/**
 * Loads the repo-root .env before anything else in the process. Must stay
 * the first import in any entrypoint (index.ts, scripts/*.ts) that reads
 * process.env -- ESM evaluates a module's imports, in source order, fully
 * before that module's own top-level code runs, so this only reaches
 * config.ts (or any other module that reads env vars at import time, such
 * as chainlink-feeds.ts's optional RPC overrides) ahead of it if it is
 * imported before them, not merely called before them.
 *
 * Existing process environment variables always win (dotenv's default): a
 * value already exported in the calling shell is never overridden by the
 * file. A no-op, not an error, when no .env file exists -- real deployments
 * that inject env vars through the platform are unaffected.
 */
loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
