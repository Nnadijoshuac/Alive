"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight01Icon,
  CancelCircleIcon,
  CheckmarkCircle01Icon,
  CircleIcon,
  Loading03Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { AliveIcon } from "@/components/ui/alive-icon";
import {
  extractAssetPassport,
  getAssetEligibility,
  getRwaAsset,
  listAssetSources,
  listRwaAssets,
  type ExtractionResult,
} from "@/lib/rwa-api";
import {
  loadAssetDocumentation,
  stageErrorMessage,
  type VerifyStageKey,
} from "@/lib/verify-flow";
import {
  dataStatus,
  eligibilityStatus,
  isRealAsset,
  listAssetSummaries,
  verificationStatus,
  type AssetSummary,
} from "@/lib/asset-intelligence-summary";
import { recordActivity } from "@/lib/activity-log";
import { AssetIdentity } from "./asset-identity";
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
  const [catalogError, setCatalogError] = useState<string>();
  const [summaryError, setSummaryError] = useState<string>();
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<AssetRef>();
  const [stages, setStages] =
    useState<Record<StageKey, StageStatus>>(initialStages());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>();
  const [failedStage, setFailedStage] = useState<StageKey>();
  const [extraction, setExtraction] = useState<ExtractionResult>();
  const [sourceCount, setSourceCount] = useState<number>();
  const [verdict, setVerdict] = useState<EligibilityVerdict>();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRwaAssets()
      .then((result) => {
        setCatalog(result.assets.filter(isRealAsset));
        setCatalogError(undefined);
      })
      .catch((requestError: unknown) => {
        setCatalog([]);
        setCatalogError(
          requestError instanceof Error
            ? requestError.message
            : "The asset catalog could not be loaded.",
        );
      });
    listAssetSummaries()
      .then((result) => {
        setSummaries(result);
        setSummaryError(undefined);
      })
      .catch((requestError: unknown) => {
        setSummaries([]);
        setSummaryError(
          requestError instanceof Error
            ? requestError.message
            : "Verification coverage could not be loaded.",
        );
      });
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
          asset.id.toLowerCase().includes(needle) ||
          asset.issuerName.toLowerCase().includes(needle) ||
          asset.assetClass.toLowerCase().includes(needle),
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
      setStages((current) => ({
        ...current,
        identify: "done",
        read: "active",
      }));

      await loadAssetDocumentation(asset.id, asset.symbol);
      setStages((current) => ({ ...current, read: "done", extract: "active" }));

      const extractionResult = await extractAssetPassport(asset.id);
      setExtraction(extractionResult);
      setStages((current) => ({
        ...current,
        extract: "done",
        sources: "active",
      }));

      const sources = await listAssetSources(asset.id);
      setSourceCount(sources.length);
      setStages((current) => ({
        ...current,
        sources: "done",
        evaluate: "active",
      }));

      const eligibility = await getAssetEligibility(asset.id);
      setVerdict(eligibility.verdict);
      setStages((current) => ({ ...current, evaluate: "done" }));
      recordActivity({
        assetId: asset.id,
        symbol: asset.symbol,
        action: "Analyzed",
        result: eligibility.verdict.status,
      });

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
      setQuery(q);
      setShowSuggestions(true);
      const match = catalog.find(
        (asset) =>
          asset.symbol.toLowerCase() === needle ||
          asset.id.toLowerCase() === needle,
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

  // Overview is a focused operational view, not a dump of the whole real
  // catalog (that's Explore's job) -- analyzed/verified assets surface
  // first, since those are the ones ALIVE actually has something to say
  // about, with the rest of the real catalog one click away.
  const focusedSummaries = summaries
    ? [...summaries]
        .sort((left, right) => {
          const rank = { VERIFIED: 0, NOT_ANALYZED: 1, UNVERIFIED: 2 } as const;
          return (
            rank[verificationStatus(left)] - rank[verificationStatus(right)]
          );
        })
        .slice(0, 8)
    : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>RWA Intelligence</p>
          <h1 className={styles.heading}>
            Verify the asset before you trust the token.
          </h1>
          <p className={styles.subheading}>
            Search a token, issuer, or asset. ALIVE reads official documents and
            market sources, then evaluates deterministic eligibility rules.
          </p>
        </div>
        <div
          className={styles.methodLedger}
          aria-label="ALIVE analysis sequence"
        >
          <span>Decision sequence</span>
          <ol>
            <li>
              <b>Source</b>
              <small>Official evidence</small>
            </li>
            <li>
              <b>Extract</b>
              <small>Cited facts</small>
            </li>
            <li>
              <b>Evaluate</b>
              <small>Deterministic rules</small>
            </li>
          </ol>
        </div>
      </header>

      <section
        className={styles.analysisPanel}
        aria-labelledby="analysis-console-title"
      >
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.panelKicker}>Verification console</span>
            <h2 id="analysis-console-title">Run a sourced asset check</h2>
          </div>
          <span
            className={styles.runState}
            data-state={
              running || catalog === undefined
                ? "running"
                : error || catalogError
                  ? "error"
                  : "idle"
            }
          >
            {running
              ? "Running"
              : error || catalogError
                ? "Needs attention"
                : catalog === undefined
                  ? "Loading"
                  : "Ready"}
          </span>
        </div>
        <form className={styles.searchForm} onSubmit={handleSubmit}>
          <div className={styles.searchBox} ref={boxRef}>
            <AliveIcon icon={Search01Icon} size="md" tone="muted" />
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
              onKeyDown={(event) => {
                if (event.key === "Escape") setShowSuggestions(false);
                if (event.key === "ArrowDown" && showSuggestions) {
                  event.preventDefault();
                  boxRef.current
                    ?.querySelector<HTMLButtonElement>("[role='option']")
                    ?.focus();
                }
              }}
              aria-label="Search a tokenized asset"
              aria-autocomplete="list"
              aria-controls="asset-search-results"
              aria-expanded={showSuggestions && matches.length > 0}
              role="combobox"
            />
            {showSuggestions && matches.length > 0 ? (
              <div
                className={styles.suggestions}
                id="asset-search-results"
                role="listbox"
              >
                {matches.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={styles.suggestionItem}
                    role="option"
                    aria-selected={selected?.id === asset.id}
                    onClick={() => void runAnalysis(asset)}
                  >
                    <AssetIdentity asset={asset} size={32} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            className={styles.analyzeButton}
            type="submit"
            disabled={running || catalog === undefined || matches.length === 0}
          >
            {running ? (
              <>
                <AliveIcon icon={Loading03Icon} size="md" className="spin" />{" "}
                Analyzing…
              </>
            ) : (
              <>
                Analyze asset <AliveIcon icon={ArrowRight01Icon} size="md" />
              </>
            )}
          </button>
        </form>

        {started ? (
          <ol className={styles.stageList}>
            {STAGES.map((stage) => {
              const status = stages[stage.key];
              return (
                <li
                  className={styles.stageRow}
                  data-status={status}
                  key={stage.key}
                >
                  {status === "done" ? (
                    <AliveIcon
                      icon={CheckmarkCircle01Icon}
                      size="md"
                      tone="positive"
                    />
                  ) : status === "active" ? (
                    <AliveIcon
                      icon={Loading03Icon}
                      size="md"
                      className="spin"
                    />
                  ) : status === "error" ? (
                    <AliveIcon
                      icon={CancelCircleIcon}
                      size="md"
                      tone="negative"
                    />
                  ) : (
                    <AliveIcon icon={CircleIcon} size="md" tone="muted" />
                  )}
                  {stage.label}
                  {stage.key === "extract" && extraction ? (
                    <span className={styles.stageDetail}>
                      {extraction.extraction.mode}
                    </span>
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
          <div className={styles.errorNote} role="alert">
            <strong>{stageErrorMessage(failedStage)}</strong>
            <span>
              {error instanceof Error
                ? error.message
                : "The request could not be completed."}
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
        {catalogError ? (
          <p className={styles.inlineError} role="alert">
            Search catalog unavailable: {catalogError}
          </p>
        ) : null}
      </section>

      <section
        className={styles.snapshotSection}
        aria-labelledby="catalog-snapshot-title"
      >
        <div className={styles.sectionHeaderRow}>
          <div>
            <span className={styles.panelKicker}>Current evidence</span>
            <h2 className={styles.sectionHeading} id="catalog-snapshot-title">
              Catalog snapshot
            </h2>
          </div>
          <span className={styles.snapshotNote}>
            Loaded catalog counts, not a live market claim.
          </span>
        </div>
        <div
          className={styles.summaryStrip}
          aria-busy={summaries === undefined}
        >
          <div className={styles.summaryCell}>
            <span className={styles.summaryLabel}>Catalog assets</span>
            <span className={styles.summaryValue}>{catalogCount ?? "UNKNOWN"}</span>
          </div>
          <div className={styles.summaryCell}>
            <span className={styles.summaryLabel}>Eligible</span>
            <span className={styles.summaryValue}>{eligibleCount ?? "UNKNOWN"}</span>
          </div>
          <div className={styles.summaryCell}>
            <span className={styles.summaryLabel}>Restricted</span>
            <span className={styles.summaryValue}>
              {restrictedCount ?? "UNKNOWN"}
            </span>
          </div>
          <div className={styles.summaryCell}>
            <span className={styles.summaryLabel}>Live data sources</span>
            <span className={styles.summaryValue}>
              {liveSourceCount ?? "UNKNOWN"}
            </span>
          </div>
        </div>
        {summaryError ? (
          <p className={styles.inlineError} role="alert">
            {summaryError}
          </p>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="coverage-title">
        <div className={styles.sectionHeaderRow}>
          <div>
            <span className={styles.panelKicker}>Proof inventory</span>
            <h2 className={styles.sectionHeading} id="coverage-title">
              Verification coverage
            </h2>
          </div>
          <Link href="/explore" className={styles.exploreLink}>
            Browse the full asset catalog →
          </Link>
        </div>
        <div className={styles.tableCard}>
          <AssetTable
            summaries={focusedSummaries ?? []}
            loading={summaries === undefined}
            emptyLabel={
              summaries ? "No assets in the catalog yet." : "Loading…"
            }
          />
        </div>
      </section>
    </div>
  );
}
