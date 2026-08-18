"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CircleNotchIcon,
  FlaskIcon,
  ProhibitIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import type { EligibilityVerdict } from "@alive/shared";
import {
  extractAssetPassport,
  getAssetEligibility,
  listRwaMarkets,
  resetDemoOverrides,
  runGatewayProof,
  setDemoNavAge,
  type GatewayProofResult,
  type RwaMarketQuote,
} from "@/lib/rwa-api";
import { loadAssetDocumentation } from "@/lib/verify-flow";
import { formatFreshness, formatPrice } from "@/lib/rwa-format";
import overviewStyles from "./overview.module.css";
import styles from "./attack-lab.module.css";

const ATTACK_ASSET_ID = "ttbill-a";
// 31 hours against the demo policy's 24-hour maxNavAgeSeconds bound --
// the exact margin already proven in packages/contracts/scripts/prove-gateway-flow.ts.
const STALE_NAV_AGE_SECONDS = 31 * 3_600;

type Stage = "loading" | "preparing" | "ready" | "running" | "restoring" | "error";
type OnchainState = "unavailable" | "not-run" | "done";

function explorerUrl(txHash: string): string {
  return `https://www.okx.com/web3/explorer/xlayer-test/tx/${txHash}`;
}

export function AttackLabPage() {
  const [quote, setQuote] = useState<RwaMarketQuote>();
  const [verdict, setVerdict] = useState<EligibilityVerdict>();
  const [gateway, setGateway] = useState<GatewayProofResult>();
  const [onchainState, setOnchainState] = useState<OnchainState>("not-run");
  const [onchainUnavailableReason, setOnchainUnavailableReason] = useState<string>();
  const [stage, setStage] = useState<Stage>("loading");
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<unknown>();
  const [attacked, setAttacked] = useState(false);

  const refresh = useCallback(async () => {
    const [markets, eligibility] = await Promise.all([
      listRwaMarkets(),
      getAssetEligibility(ATTACK_ASSET_ID),
    ]);
    setQuote(markets.quotes.find((q) => q.assetId === ATTACK_ASSET_ID));
    setVerdict(eligibility.verdict);
    return eligibility.verdict;
  }, []);

  const runOnchain = useCallback(async () => {
    setOnchainState("not-run");
    try {
      const result = await runGatewayProof(ATTACK_ASSET_ID);
      setGateway(result);
      setOnchainState("done");
      setOnchainUnavailableReason(undefined);
    } catch (requestError) {
      // GATEWAY_CLIENT_UNAVAILABLE (no broadcasting key configured) or a
      // genuine RPC/broadcast failure -- either way, this is honestly
      // "not proven onchain this run," never faked as blocked/allowed.
      setGateway(undefined);
      setOnchainState("unavailable");
      setOnchainUnavailableReason(
        requestError instanceof Error ? requestError.message : "Onchain proof unavailable.",
      );
    }
  }, []);

  const prepareBaseline = useCallback(async () => {
    setStage("preparing");
    setError(undefined);
    setProgress(["Resetting demo overrides...", "Loading issuer documentation...", "Extracting facts...", "Evaluating eligibility..."]);
    try {
      await resetDemoOverrides();
      await loadAssetDocumentation(ATTACK_ASSET_ID, "tTBILL-A", {
        allowDemoFixtureFallback: true,
      });
      await extractAssetPassport(ATTACK_ASSET_ID);
      const v = await refresh();
      setProgress((current) => [...current, "Publishing verdict to X Layer Testnet...", "Attempting gated deposit..."]);
      await runOnchain();
      setStage(v.status === "ELIGIBLE" ? "ready" : "error");
      if (v.status !== "ELIGIBLE") {
        setError(new Error(`Baseline is not ELIGIBLE (${v.status}): ${v.reasons.map((r) => r.code).join(", ")}`));
      }
    } catch (requestError) {
      setError(requestError);
      setStage("error");
    } finally {
      setProgress([]);
    }
  }, [refresh, runOnchain]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStage("loading");
      try {
        const v = await refresh();
        if (cancelled) return;
        if (v.status === "ELIGIBLE") {
          setStage("ready");
          await runOnchain();
        } else {
          await prepareBaseline();
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError);
          setStage("error");
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAttack() {
    setStage("running");
    setError(undefined);
    setProgress([
      "Making TTBILL-A's NAV stale...",
      "Re-evaluating eligibility...",
      "Signing and publishing restricted verdict to X Layer Testnet...",
      "Attempting the gated deposit against the new verdict...",
    ]);
    try {
      await setDemoNavAge(ATTACK_ASSET_ID, STALE_NAV_AGE_SECONDS);
      await refresh();
      await runOnchain();
      setAttacked(true);
      setStage("ready");
    } catch (requestError) {
      setError(requestError);
      setStage("error");
    } finally {
      setProgress([]);
    }
  }

  async function restore() {
    setStage("restoring");
    setError(undefined);
    setProgress([
      "Restoring fresh NAV...",
      "Re-evaluating eligibility...",
      "Signing and publishing eligible verdict to X Layer Testnet...",
      "Retrying the gated deposit...",
    ]);
    try {
      await resetDemoOverrides();
      await refresh();
      await runOnchain();
      setAttacked(false);
      setStage("ready");
    } catch (requestError) {
      setError(requestError);
      setStage("error");
    } finally {
      setProgress([]);
    }
  }

  const busy = stage === "loading" || stage === "preparing" || stage === "running" || stage === "restoring";
  const isRestricted = verdict?.status === "RESTRICTED";
  const isEligible = verdict?.status === "ELIGIBLE";
  const depositAllowed = gateway?.deposit.ok === true;
  const depositBlocked = gateway?.deposit.ok === false;

  function xLayerLabel(): string {
    if (onchainState === "unavailable") return isEligible ? "Ready (unproven)" : "Restricted — onchain proof not run";
    if (onchainState === "not-run") return isEligible ? "Ready" : "Restricted — onchain proof not run";
    if (depositAllowed) return "Action allowed";
    if (depositBlocked) return "Blocked by contract";
    return "—";
  }

  return (
    <div className={overviewStyles.page}>
      <div>
        <p className={overviewStyles.eyebrow}>Simulated failure environment</p>
        <h1 className={overviewStyles.heading}>Try to break ALIVE.</h1>
        <p className={overviewStyles.subheading}>
          Attack Lab uses a controlled demo asset so failure conditions can be
          reproduced safely. Live Chainlink assets are never modified.
        </p>
      </div>

      <div className={styles.assetCard}>
        <div className={styles.assetIdentity}>
          <span className={styles.assetSymbol}>TTBILL-A</span>
          <span className={styles.assetName}>X Layer Testnet Enforcement Harness</span>
          <span className={styles.demoBadge}>Testnet harness — not a real asset</span>
        </div>
        {quote ? (
          <div className={styles.stateGrid}>
            <div className={styles.stateCell}>
              <span className={styles.stateLabel}>NAV</span>
              <span className={styles.stateValue}>{formatPrice(quote.price)}</span>
            </div>
            <div className={styles.stateCell}>
              <span className={styles.stateLabel}>NAV age</span>
              <span className={styles.stateValue}>{formatFreshness(quote.ageSeconds)}</span>
            </div>
            <div className={styles.stateCell}>
              <span className={styles.stateLabel}>Eligibility</span>
              <span
                className={`${styles.stateValue} ${
                  isEligible ? styles.stateValuePositive : isRestricted ? styles.stateValueNegative : ""
                }`}
              >
                {verdict?.status ?? "—"}
              </span>
            </div>
            <div className={styles.stateCell}>
              <span className={styles.stateLabel}>X Layer</span>
              <span
                className={`${styles.stateValue} ${
                  depositAllowed ? styles.stateValuePositive : depositBlocked ? styles.stateValueNegative : ""
                }`}
              >
                {xLayerLabel()}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.scenarioCard}>
        <h2 className={styles.scenarioTitle}>Make NAV stale</h2>
        <p className={styles.scenarioDescription}>
          Push the demo asset&apos;s NAV beyond ALIVE&apos;s permitted freshness window
          (24 hours). Expect ALIVE to detect NAV_STALE, publish a RESTRICTED verdict
          to X Layer Testnet, and the gated deposit to be rejected by the contract.
        </p>
        {!attacked ? (
          <button className={styles.actionButton} type="button" onClick={runAttack} disabled={busy || stage !== "ready"}>
            {stage === "running" ? <CircleNotchIcon size={15} className="spin" /> : <FlaskIcon size={15} weight="bold" />}
            Run attack
          </button>
        ) : (
          <button className={styles.restoreButton} type="button" onClick={restore} disabled={busy}>
            {stage === "restoring" ? <CircleNotchIcon size={15} className="spin" /> : <ArrowClockwiseIcon size={15} weight="bold" />}
            Restore asset
          </button>
        )}
        {progress.length > 0 ? (
          <ul className={styles.progressList}>
            {progress.map((line) => (
              <li key={line}>
                <CircleNotchIcon size={12} className="spin" /> {line}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? (
        <div className={overviewStyles.errorNote}>
          <strong>Attack Lab could not complete that step.</strong>
          <span>{error instanceof Error ? error.message : "The request could not be completed."}</span>
          <button className={overviewStyles.retryButton} type="button" onClick={prepareBaseline}>
            Reset demo
          </button>
        </div>
      ) : null}

      {verdict && stage !== "loading" && stage !== "preparing" ? (
        <div
          className={`${styles.resultBlock} ${
            depositBlocked ? styles.resultBlockRestricted : depositAllowed ? styles.resultBlockEligible : ""
          }`}
        >
          <h2 className={styles.resultHeading}>
            {isRestricted ? (
              <>
                <ProhibitIcon size={16} weight="bold" /> Attack result
              </>
            ) : (
              <>
                <ShieldCheckIcon size={16} weight="bold" /> Current state
              </>
            )}
          </h2>
          <div className={styles.resultGrid}>
            <div className={styles.stateCell}>
              <span className={styles.stateLabel}>NAV</span>
              <span className={styles.stateValue}>{quote ? formatFreshness(quote.ageSeconds) : "—"}</span>
            </div>
            <div className={styles.stateCell}>
              <span className={styles.stateLabel}>ALIVE</span>
              <span className={styles.stateValue}>{verdict.status}</span>
            </div>
            <div className={styles.stateCell}>
              <span className={styles.stateLabel}>Reason</span>
              <span className={styles.stateValue}>
                {verdict.reasons.map((r) => r.code).join(", ")}
              </span>
            </div>
            <div className={styles.stateCell}>
              <span className={styles.stateLabel}>X Layer</span>
              <span className={styles.stateValue}>{xLayerLabel()}</span>
            </div>
          </div>

          {onchainState === "done" && gateway ? (
            <p className={styles.onchainNote}>
              Verdict published to <code>AliveEligibilityRegistry</code> (X Layer Testnet, chain 1952):{" "}
              <a href={explorerUrl(gateway.publish.txHash)} target="_blank" rel="noreferrer">
                {gateway.publish.txHash.slice(0, 14)}…<ArrowSquareOutIcon size={11} />
              </a>{" "}
              (block {gateway.publish.blockNumber}), registry.isEligible ={" "}
              {String(gateway.publish.onchainEligible)}.
              <br />
              {gateway.deposit.ok ? (
                <>
                  <code>AliveVault.depositEligibleAsset</code> succeeded:{" "}
                  <a href={explorerUrl(gateway.deposit.txHash)} target="_blank" rel="noreferrer">
                    {gateway.deposit.txHash.slice(0, 14)}…<ArrowSquareOutIcon size={11} />
                  </a>{" "}
                  (block {gateway.deposit.blockNumber}).
                </>
              ) : (
                <>
                  <code>AliveVault.depositEligibleAsset</code> rejected before broadcast:{" "}
                  <code>{gateway.deposit.contractError}</code>.
                </>
              )}
            </p>
          ) : onchainState === "unavailable" ? (
            <p className={styles.onchainNote}>
              Onchain proof not run this session: {onchainUnavailableReason}. ALIVE&apos;s
              detection above (NAV staleness, reason code, eligibility status) is real and
              unaffected; only the X Layer publish/deposit step is unavailable here.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
