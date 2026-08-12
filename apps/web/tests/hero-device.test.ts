import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReducedMotionServerSnapshot,
  getReducedMotionSnapshot,
} from "../lib/reduced-motion";

describe("hero reduced-motion hydration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the hydration snapshot deterministic before applying the browser preference", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: true })),
    });

    expect(getReducedMotionServerSnapshot()).toBe(false);
    expect(getReducedMotionSnapshot()).toBe(true);
  });
});
