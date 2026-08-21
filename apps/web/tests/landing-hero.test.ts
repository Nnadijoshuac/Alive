import { describe, it, expect } from "vitest";
import { LandingPage } from "../components/landing/landing-page";

describe("ALIVE Landing Page Hero", () => {
  it("exports LandingPage component", () => {
    expect(LandingPage).toBeDefined();
    expect(typeof LandingPage).toBe("function");
  });
});
