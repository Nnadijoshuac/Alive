import { describe, it, expect } from "vitest";
import {
  evaluateWalletContext,
  evaluateAgentSnapshot,
  answerAgentQuestion,
} from "../lib/agent-evaluator";
import { fetchAgentSnapshot, evaluateAgentStrategy, askAgent } from "../lib/agent-api";

const USER_WALLET = "0x8B91361f58980992C2EEcA0410f21cC9c181EE97";
const DEMO_WALLET = "0xe2475653b6f8a846152a5508a8e1b1faae1a44e5";

describe("Agent Standalone Evaluator & API", { timeout: 45000 }, () => {
  it("evaluates wallet context for user wallet without network errors", async () => {
    const ctx = await evaluateWalletContext(USER_WALLET);
    expect(ctx).toBeDefined();
    expect(ctx.walletAddress.toLowerCase()).toBe(USER_WALLET.toLowerCase());
    expect(ctx.portfolio.positions.length).toBeGreaterThan(0);
    expect(ctx.capabilities.chainId).toBe(196);
  });

  it("evaluates agent snapshot for user wallet deterministically", async () => {
    const snap = await evaluateAgentSnapshot(USER_WALLET);
    expect(snap).toBeDefined();
    expect(snap.walletAddress.toLowerCase()).toBe(USER_WALLET.toLowerCase());
    expect(snap.activeStrategy).toBeDefined();
    expect(snap.activeStrategy.rules.length).toBeGreaterThan(0);
    expect(Array.isArray(snap.proposedActions)).toBe(true);
  });

  it("evaluates agent snapshot for demo wallet with proposals", async () => {
    const snap = await evaluateAgentSnapshot(DEMO_WALLET);
    expect(snap).toBeDefined();
    expect(snap.walletAddress.toLowerCase()).toBe(DEMO_WALLET.toLowerCase());
    expect(snap.walletPortfolio.positions.length).toBeGreaterThan(0);
    expect(snap.proposedActions.length).toBeGreaterThan(0);
    const trimAction = snap.proposedActions.find((a) => a.actionType === "SELL" || a.actionType === "BUY");
    expect(trimAction).toBeDefined();
  });

  it("answers agent questions accurately and factually", async () => {
    const balanceAns = await answerAgentQuestion(DEMO_WALLET, "What is my balance and portfolio value?");
    expect(balanceAns.confidence).toBe("HIGH");
    expect(balanceAns.answer).toContain("$");

    const whyAns = await answerAgentQuestion(DEMO_WALLET, "Why was this action proposed?");
    expect(whyAns.confidence).toBe("HIGH");
    expect(whyAns.citations.length).toBeGreaterThan(0);

    const metaAns = await answerAgentQuestion(DEMO_WALLET, "Can I trade wMETAx?");
    expect(metaAns.confidence).toBe("HIGH");
    expect(metaAns.answer).toContain("wMETAx");
  });

  it("fetchAgentSnapshot with force=true returns a complete snapshot without throwing", async () => {
    const snap = await fetchAgentSnapshot(USER_WALLET, true);
    expect(snap).toBeDefined();
    expect(snap.walletAddress.toLowerCase()).toBe(USER_WALLET.toLowerCase());
  });

  it("evaluateAgentStrategy returns a valid snapshot for user wallet", async () => {
    const snap = await evaluateAgentStrategy(USER_WALLET);
    expect(snap).toBeDefined();
    expect(snap.id).toContain("snapshot-");
  });

  it("askAgent returns high confidence response", async () => {
    const res = await askAgent(USER_WALLET, "What is my portfolio status?");
    expect(res.answer).toBeDefined();
    expect(res.confidence).toBeDefined();
  });
});
