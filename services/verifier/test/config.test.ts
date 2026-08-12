import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadVerifierConfig } from "../src/config.js";

describe("verifier configuration", () => {
  it("keeps default persistence in the monorepo storage boundary", () => {
    const config = loadVerifierConfig({});
    const workspaceRoot = path.resolve(process.cwd(), "../..");
    expect(config.databasePath).toBe(path.join(workspaceRoot, "storage/database/alive.sqlite"));
    expect(config.evidencePath).toBe(path.join(workspaceRoot, "storage/evidence"));
    expect(config.authorizationAudience).toBe("http://127.0.0.1:4100");
    expect(config.authorizationChainId).toBe(31_337);
    expect(config.authorizationTtlSeconds).toBe(120);
    expect(config.registrationCapabilityTtlSeconds).toBe(1_800);
  });

  it("resolves configured relative persistence paths from the workspace root", () => {
    const config = loadVerifierConfig({
      DATABASE_URL: "file:./storage/database/custom.sqlite",
      EVIDENCE_STORAGE_PATH: "./storage/evidence/custom",
    });
    const workspaceRoot = path.resolve(process.cwd(), "../..");
    expect(config.databasePath).toBe(path.join(workspaceRoot, "storage/database/custom.sqlite"));
    expect(config.evidencePath).toBe(path.join(workspaceRoot, "storage/evidence/custom"));
  });

  it("rejects ambiguous or non-HTTP authorization audiences", () => {
    expect(() => loadVerifierConfig({ ALIVE_AUTH_AUDIENCE: "http://user:secret@localhost:4100" }))
      .toThrow(/without credentials/i);
    expect(() => loadVerifierConfig({ ALIVE_AUTH_AUDIENCE: "http://localhost:4100?tenant=one" }))
      .toThrow(/without credentials/i);
  });
});
