"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwiseIcon,
  CircleNotchIcon,
  FlaskIcon,
  ProhibitIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import type { EligibilityVerdict, RwaAsset } from "@alive/shared";
import {
  extractAssetPassport,
  getAssetEligibility,
  getRwaAsset,
  listRwaMarkets,
  publishAssetVerdict,
  resetDemoOverrides,
  setDemoNavAge,
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

export function AttackLabPage() {
  const [asset, setAsset] = useState<RwaAsset>();
  const [quote, setQuote] = useState<RwaMarketQuote>();
  const [verdict, setVerdict] = useState<EligibilityVerdict>();
  const [signedDigest, setSignedDigest] = useState<string>();
  const [signingUnavailable, setSigningUnavailable] = useState(false);
  const [stage, setStage] = useState<Stage>("loading");
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<unknown>();
  const [attacked, setAttacked] = useState(false);

  const refresh = useCallback(async () => {
    const [passport, markets, eligibility] = await Promise.all([
      getRwaAsset(ATTACK_ASSET_ID),
      listRwaMarkets(),
      getAssetEligibility(ATTACK_ASSET_ID),
    ]);
    setAsset(passport.asset);
    setQuote(markets.quotes.find((q) => q.assetId === ATTACK_ASSET_ID));
    setVerdict(eligibility.verdict);
    return eligibility.verdict;
  }, []);

  const publish = useCallback(async () => {
    try {
      const published = await publishAssetVerdict(ATTACK_ASSET_ID);
      setSignedDigest(published.signed.digest);
      setSigningUnavailable(false);
    } catch {
      // Signing requires ELIGIBILITY_SIGNER_PRIVATE_KEY configured
      // server-side. Not fatal to the demo -- ALIVE's own detection and
      // eligibility re-evaluation are already real and shown regardless.
      setSignedDigest(undefined);
      setSigningUnavailable(true);
    }
  }, []);

  const prepareBaseline = useCallback(async () => {
    setStage("preparing");
    setError(undefined);
    setProgress(["Resetting demo overrides...", "Loading issuer documentation...", "Extracting facts...", "Evaluating eligibility..."]);
    try {
      await resetDemoOverrides();
      await loadAssetDocumentation(ATTACK_ASSET_ID, "tTBILL-A");
      await extractAssetPassport(ATTACK_ASSET_ID);
      const v = await refresh();
      await publish();
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
  }, [refresh, publish]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStage("loading");
      try {
        const v = await refresh();
        if (cancelled) return;
        if (v.status === "ELIGIBLE") {
          setStage("ready");
          await publish();
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
    setProgress(["Making TTBILL-A's NAV stale...", "Re-evaluating eligibility...", "Signing updated verdict..."]);
    try {
      await setDemoNavAge(ATTACK_ASSET_ID, STALE_NAV_AGE_SECONDS);
      await refresh();
      await publish();
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
    setProgress(["Restoring fresh NAV...", "Re-evaluating eligibility...", "Signing updated verdict..."]);
    try {
      await resetDemoOverrides();
      await refresh();
      await publish();
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
          <span className={styles.assetName}>{asset?.name ?? "Tokenized Treasury Demo"}</span>
          <span className={styles.demoBadge}>Demo data</span>
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
                  isEligible ? styles.stateValuePositive : isRestricted ? styles.stateValueNegative : ""
                }`}
              >
                {isEligible ? "Ready" : isRestricted ? "Blocking" : "—"}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.scenarioCard}>
        <h2 className={styles.scenarioTitle}>Make NAV stale</h2>
        <p className={styles.scenarioDescription}>
          Push the demo asset&apos;s NAV beyond ALIVE&apos;s permitted freshness window
          (24 hours). Expect ALIVE to detect NAV_STALE, mark the asset RESTRICTED,
          and X Layer to refuse the gated action.
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
            isRestricted ? styles.resultBlockRestricted : isEligible ? styles.resultBlockEligible : ""
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
              <span className={styles.stateValue}>
                {isEligible ? "Action allowed" : "Blocked by contract"}
              </span>
            </div>
          </div>
          <p className={styles.onchainNote}>
            {signedDigest ? (
              <>
                Signed verdict digest <code>{signedDigest.slice(0, 18)}…</code> is ready to
                publish to <code>AliveEligibilityRegistry</code> on X Layer Testnet
                (chain 1952). <code>AliveVault.depositEligibleAsset</code> reverts with{" "}
                <code>AssetNotEligible</code> whenever the registry reports this asset
                ineligible -- proven in <code>packages/contracts/test</code> and against
                a real testnet deployment via{" "}
                <code>pnpm --filter @alive/contracts prove:flow</code>.
              </>
            ) : signingUnavailable ? (
              <>
                Verdict signing requires <code>ELIGIBILITY_SIGNER_PRIVATE_KEY</code> to be
                configured server-side -- not available in this environment. ALIVE&apos;s
                detection above (NAV staleness, reason code, eligibility status) is real
                and unaffected; only the onchain publish step is unavailable here.
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
