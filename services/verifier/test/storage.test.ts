import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileEvidenceStore } from "../src/storage.js";

describe("evidence reset boundary", () => {
  it("refuses to recursively reset the configured boundary itself", async () => {
    const boundary = await mkdtemp(
      path.join(os.tmpdir(), "alive-storage-boundary-"),
    );
    const store = new FileEvidenceStore(boundary, boundary);
    await expect(store.reset()).rejects.toThrow(/unsafe evidence root/i);
  });

  it("resets only a dedicated descendant of the configured boundary", async () => {
    const boundary = await mkdtemp(
      path.join(os.tmpdir(), "alive-storage-boundary-"),
    );
    const evidence = path.join(boundary, "evidence");
    await mkdir(evidence);
    await writeFile(path.join(evidence, "capture.txt"), "test");
    const store = new FileEvidenceStore(evidence, boundary);
    await expect(store.reset()).resolves.toBeUndefined();
  });
});
