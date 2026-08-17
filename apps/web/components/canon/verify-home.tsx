"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
  MagnifyingGlassIcon,
  ProhibitIcon,
  QuestionIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import {
  extractAssetPassport,
  getAssetEligibility,
  getRwaAsset,
  listAssetSources,
  listRwaAssets,
  type ExtractionResult,
} from "@/lib/rwa-api";
import { loadAssetDocumentation, stageErrorMessage, type VerifyStageKey } from "@/lib/verify-flow";
import type { EligibilityVerdict, RwaAsset } from "@alive/shared";
import { CanonShell } from "./canon-shell";
import styles from "./canon.module.css";

type StageKey = VerifyStageKey;
type StageStatus = "pending" | "active" | "done" | "error";

const STAGES: { key: StageKey; label: string }[] = [
  { key: "identify", label: "Identifying the token" },
  { key: "read", label: "Reading issuer documentation" },
  { key: "extract", label: "Extracting structured facts" },
  { key: "sources", label: "Checking source provenance" },
  { key: "evaluate", label: "Evaluating eligibility" },
];

const DEFAULT_CHIPS = [
  { id: "ttbill-b", label: "tTBILL-B" },
  { id: "tgold", label: "tGOLD" },
  { id: "tusdc", label: "tUSDC" },
  { id: "tsp500", label: "tSP500" },
];

type AssetRef = { id: string; symbol: string };

function initialStages(): Record<StageKey, StageStatus> {
  return {
    identify: "pending",
    read: "pending",
    extract: "pending",
    sources: "pending",
    evaluate: "pending",
  };
}

function verdictTone(status: EligibilityVerdict["status"]) {
  if (status === "ELIGIBLE") return "positive" as const;
  if (status === "RESTRICTED") return "negative" as const;
  return "warning" as const;
}

function verdictIcon(status: EligibilityVerdict["status"]) {
  if (status === "ELIGIBLE") return <ShieldCheckIcon size={30} weight="fill" />;
  if (status === "RESTRICTED") return <ProhibitIcon size={30} weight="fill" />;
  return <QuestionIcon size={30} weight="fill" />;
}

function verdictSummary(status: EligibilityVerdict["status"]) {
  if (status === "ELIGIBLE")
    return "This asset currently passes every deterministic eligibility check ALIVE runs.";
  if (status === "RESTRICTED")
    return "This asset currently fails at least one deterministic eligibility check.";
  return "ALIVE does not have enough current data to evaluate this asset.";
}

export function VerifyHome() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<RwaAsset[]>();
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<AssetRef>();
  const [stages, setStages] = useState<Record<StageKey, StageStatus>>(initialStages());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>();
  const [failedStage, setFailedStage] = useState<StageKey>();
  const [extraction, setExtraction] = useState<ExtractionResult>();
  const [sourceCount, setSourceCount] = useState<number>();
  const [verdict, setVerdict] = useState<EligibilityVerdict>();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRwaAssets()
      .then((result) => setCatalog(result.assets))
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const matches = useMemo(() => {
    if (!catalog) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog.slice(0, 6);
    return catalog
      .filter(
        (asset) =>
          asset.symbol.toLowerCase().includes(needle) ||
          asset.name.toLowerCase().includes(needle) ||
          asset.id.toLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [catalog, query]);

  async function runVerification(asset: AssetRef) {
    setSelected(asset);
    setQuery(asset.symbol);
    setShowSuggestions(false);
    setRunning(true);
    setError(undefined);
    setFailedStage(undefined);
    setExtraction(undefined);
    setSourceCount(undefined);
    setVerdict(undefined);
    setStages({ ...initialStages(), identify: "active" });
    try {
      await getRwaAsset(asset.id);
      setStages((current) => ({ ...current, identify: "done", read: "active" }));

      // Prefers ALIVE's own real official sources (ttbill-b's Superstate/
      // Invesco USTB documents); falls back to the demo fixture only for
      // assets with no official sources registered. Never depends on
      // data/source-documents/<assetId>.txt existing.
      await loadAssetDocumentation(asset.id, asset.symbol);
      setStages((current) => ({ ...current, read: "done", extract: "active" }));

      const extractionResult = await extractAssetPassport(asset.id);
      setExtraction(extractionResult);
      setStages((current) => ({ ...current, extract: "done", sources: "active" }));

      const sources = await listAssetSources(asset.id);
      setSourceCount(sources.length);
      setStages((current) => ({ ...current, sources: "done", evaluate: "active" }));

      const eligibility = await getAssetEligibility(asset.id);
      setVerdict(eligibility.verdict);
      setStages((current) => ({ ...current, evaluate: "done" }));

      // Asset Passport opens automatically -- no extra click. The brief
      // pause lets the final "done" state actually render before navigating
      // away from it.
      await new Promise((resolve) => setTimeout(resolve, 500));
      router.push(`/assets/${asset.id}`);
    } catch (requestError) {
      setError(requestError);
      setStages((current) => {
        const next = { ...current };
        for (const stage of STAGES) {
          if (next[stage.key] === "active") {
            next[stage.key] = "error";
            setFailedStage(stage.key);
          }
        }
        return next;
      });
    } finally {
      setRunning(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const needle = query.trim().toLowerCase();
    const chipMatch = DEFAULT_CHIPS.find(
      (chip) => chip.id === needle || chip.label.toLowerCase() === needle,
    );
    const target: AssetRef | undefined =
      selected ??
      matches.find((asset) => asset.symbol.toLowerCase() === needle) ??
      matches[0] ??
      (chipMatch ? { id: chipMatch.id, symbol: chipMatch.label } : undefined);
    if (target) void runVerification(target);
  }

  const started = running || verdict !== undefined || error !== undefined;

  return (
    <CanonShell>
      <main className={styles.main}>
        <div className={styles.stage}>
          <p className={styles.eyebrow}>Continuous verification for tokenized assets</p>
          <h1 className={styles.heading}>Verify a tokenized asset.</h1>

          <form className={styles.searchForm} onSubmit={handleSubmit}>
            <div className={styles.searchBox} ref={boxRef}>
              <span className={styles.searchIcon}>
                <MagnifyingGlassIcon size={18} />
              </span>
              <input
                className={styles.searchInput}
                type="text"
                inputMode="search"
                autoComplete="off"
                placeholder="Search an asset — tTBILL, tGOLD, tUSDC…"
                value={query}
                disabled={running}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(undefined);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                aria-label="Search a tokenized asset"
              />
              {showSuggestions && matches.length > 0 ? (
                <div className={styles.suggestions} role="listbox">
                  {matches.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      className={styles.suggestionItem}
                      role="option"
                      aria-selected={selected?.id === asset.id}
                      onClick={() => void runVerification(asset)}
                    >
                      <strong>{asset.symbol}</strong>
                      <span>{asset.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button className={styles.verifyButton} type="submit" disabled={running}>
              {running ? (
                <>
                  <CircleNotchIcon size={17} className="spin" /> Verifying…
                </>
              ) : (
                <>
                  Verify asset <ArrowRightIcon size={17} weight="bold" />
                </>
              )}
            </button>
          </form>

          <div className={styles.chipRow}>
            {DEFAULT_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={styles.chip}
                data-active={selected?.id === chip.id}
                disabled={running}
                onClick={() => void runVerification({ id: chip.id, symbol: chip.label })}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {!started ? (
            <p className={styles.helper}>
              ALIVE reads issuer documentation, extracts sourced facts, and evaluates
              deterministic eligibility rules — the same pipeline that gates onchain
              access.
            </p>
          ) : null}

          {started ? (
            <ol className={styles.stageList}>
              {STAGES.map((stage, index) => {
                const status = stages[stage.key];
                return (
                  <li className={styles.stageRow} data-status={status} key={stage.key}>
                    <span className={styles.stageIcon}>
                      {status === "done" ? (
                        <CheckCircleIcon size={17} weight="fill" />
                      ) : status === "active" ? (
                        <CircleNotchIcon size={17} className="spin" />
                      ) : status === "error" ? (
                        <XCircleIcon size={17} weight="fill" />
                      ) : (
                        <CircleIcon size={17} />
                      )}
                    </span>
                    {String(index + 1).padStart(2, "0")}. {stage.label}
                    {stage.key === "extract" && extraction ? (
                      <span className={styles.stageDetail}>{extraction.extraction.mode}</span>
                    ) : null}
                    {stage.key === "sources" && sourceCount !== undefined ? (
                      <span className={styles.stageDetail}>
                        {sourceCount} source{sourceCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}

          {error ? (
            <div className={styles.errorNote}>
              <strong>{stageErrorMessage(failedStage)}</strong>
              {error instanceof Error ? error.message : "The request could not be completed."}
              {selected ? (
                <button
                  className={styles.retryButton}
                  type="button"
                  onClick={() => void runVerification(selected)}
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          {verdict && selected ? (
            <div className={styles.verdictCard} data-tone={verdictTone(verdict.status)}>
              <span className={styles.verdictIcon} data-tone={verdictTone(verdict.status)}>
                {verdictIcon(verdict.status)}
              </span>
              <p className={styles.verdictStatus} data-tone={verdictTone(verdict.status)}>
                {selected.symbol} — {verdict.status}
              </p>
              <p className={styles.verdictSummary}>{verdictSummary(verdict.status)}</p>
              {verdict.reasons.length > 0 ? (
                <ul className={styles.reasonList}>
                  {verdict.reasons.map((reason, index) => (
                    <li key={`${reason.code}-${index}`}>
                      <strong>{reason.code}</strong>
                      {reason.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className={styles.verdictActions}>
                <Link className={styles.primaryLink} href={`/assets/${selected.id}`}>
                  View asset passport <ArrowRightIcon size={14} weight="bold" />
                </Link>
                <button
                  className={styles.secondaryLink}
                  type="button"
                  onClick={() => {
                    setSelected(undefined);
                    setVerdict(undefined);
                    setError(undefined);
                    setQuery("");
                    setStages(initialStages());
                  }}
                >
                  Verify another asset
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </CanonShell>
  );
}
