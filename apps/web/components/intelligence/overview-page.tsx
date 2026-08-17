"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
  MagnifyingGlassIcon,
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
import {
  dataStatus,
  eligibilityStatus,
  listAssetSummaries,
  type AssetSummary,
} from "@/lib/asset-intelligence-summary";
import { recordActivity } from "@/lib/activity-log";
import type { EligibilityVerdict, RwaAsset } from "@alive/shared";
import { AssetTable } from "./asset-table";
import styles from "./overview.module.css";

type StageKey = VerifyStageKey;
type StageStatus = "pending" | "active" | "done" | "error";

const STAGES: { key: StageKey; label: string }[] = [
  { key: "identify", label: "Asset identified" },
  { key: "read", label: "Official sources verified" },
  { key: "extract", label: "AI document analysis complete" },
  { key: "sources", label: "Source provenance checked" },
  { key: "evaluate", label: "Eligibility evaluated" },
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

export function OverviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [catalog, setCatalog] = useState<RwaAsset[]>();
  const [summaries, setSummaries] = useState<AssetSummary[]>();
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
    listAssetSummaries()
      .then(setSummaries)
      .catch(() => setSummaries([]));
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

  async function runAnalysis(asset: AssetRef) {
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
      recordActivity({
        assetId: asset.id,
        symbol: asset.symbol,
        action: "Analyzed",
        result: eligibility.verdict.status,
      });

      // Asset Intelligence opens automatically -- no extra click. The brief
      // pause lets the final "done" state actually render first.
      await new Promise((resolve) => setTimeout(resolve, 450));
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

  useEffect(() => {
    const q = searchParams.get("q");
    if (q && catalog && catalog.length > 0 && !running && !selected) {
      const needle = q.trim().toLowerCase();
      const match = catalog.find(
        (asset) =>
          asset.symbol.toLowerCase() === needle || asset.id.toLowerCase() === needle,
      );
      if (match) void runAnalysis({ id: match.id, symbol: match.symbol });
    }
    // Deliberately excludes runAnalysis/running/selected: this effect must
    // only react to the URL's ?q= changing or the catalog finishing its
    // first load, not to every state change runAnalysis itself causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, catalog]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const needle = query.trim().toLowerCase();
    const target: AssetRef | undefined =
      selected ??
      matches.find((asset) => asset.symbol.toLowerCase() === needle) ??
      matches[0];
    if (target) void runAnalysis(target);
  }

  const started = running || verdict !== undefined || error !== undefined;

  // "Catalog assets" is deliberately not called "monitored" -- most of the
  // demo catalog has never been individually analyzed or put under live
  // Chainlink monitoring. Only assets with a LIVE quote (see dataStatus)
  // are genuinely monitored; the rest are catalog placeholders a judge can
  // choose to analyze.
  const catalogCount = summaries?.length;
  const eligibleCount = summaries?.filter(
    (s) => eligibilityStatus(s) === "ELIGIBLE",
  ).length;
  const restrictedCount = summaries?.filter(
    (s) => eligibilityStatus(s) === "RESTRICTED",
  ).length;
  const liveSourceCount = summaries?.filter(
    (s) => dataStatus(s) === "LIVE",
  ).length;

  return (
    <div className={styles.page}>
      <div>
        <p className={styles.eyebrow}>RWA Intelligence</p>
        <h1 className={styles.heading}>Verified financial intelligence for tokenized assets.</h1>
        <p className={styles.subheading}>
          Search a token, issuer, or asset. ALIVE reads official documents, reads live
          market data, and evaluates deterministic eligibility rules.
        </p>

        <form className={styles.searchForm} onSubmit={handleSubmit}>
          <div className={styles.searchBox} ref={boxRef}>
            <MagnifyingGlassIcon size={16} aria-hidden="true" />
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              placeholder="Search token, issuer, asset or address"
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
                    onClick={() => void runAnalysis(asset)}
                  >
                    <strong>{asset.symbol}</strong>
                    <span>{asset.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button className={styles.analyzeButton} type="submit" disabled={running}>
            {running ? (
              <>
                <CircleNotchIcon size={16} className="spin" /> Analyzing…
              </>
            ) : (
              <>
                Analyze asset <ArrowRightIcon size={15} weight="bold" />
              </>
            )}
          </button>
        </form>

        {started ? (
          <ol className={styles.stageList}>
            {STAGES.map((stage) => {
              const status = stages[stage.key];
              return (
                <li className={styles.stageRow} data-status={status} key={stage.key}>
                  {status === "done" ? (
                    <CheckCircleIcon size={16} weight="fill" />
                  ) : status === "active" ? (
                    <CircleNotchIcon size={16} className="spin" />
                  ) : status === "error" ? (
                    <XCircleIcon size={16} weight="fill" />
                  ) : (
                    <CircleIcon size={16} />
                  )}
                  {stage.label}
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
            <span>
              {error instanceof Error ? error.message : "The request could not be completed."}
            </span>
            {selected ? (
              <button
                className={styles.retryButton}
                type="button"
                onClick={() => void runAnalysis(selected)}
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={styles.summaryStrip}>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Catalog assets</span>
          <span className={styles.summaryValue}>{catalogCount ?? "—"}</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Eligible</span>
          <span className={styles.summaryValue}>{eligibleCount ?? "—"}</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Restricted</span>
          <span className={styles.summaryValue}>{restrictedCount ?? "—"}</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Live data sources</span>
          <span className={styles.summaryValue}>{liveSourceCount ?? "—"}</span>
        </div>
        <div className={styles.summaryCell}>
          <span className={styles.summaryLabel}>Active alerts</span>
          <span className={styles.summaryValue}>0</span>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionHeading}>Catalog assets</h2>
        <div className={styles.tableCard}>
          <AssetTable
            summaries={summaries ?? []}
            emptyLabel={summaries ? "No assets in the catalog yet." : "Loading…"}
          />
        </div>
      </div>
    </div>
  );
}
