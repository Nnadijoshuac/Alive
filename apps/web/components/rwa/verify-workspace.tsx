"use client";

import Link from "next/link";
import { useState } from "react";
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
  RwaApiError,
  extractAssetPassport,
  getAssetEligibility,
  getRwaAsset,
  ingestAssetSource,
  listAssetSources,
  publishAssetVerdict,
  type ExtractionResult,
  type PublishedVerdict,
} from "@/lib/rwa-api";
import { formatTimestamp, truncateIdentifier } from "@/lib/rwa-format";
import { EmptyState, ErrorState, Notice, PageIntro, styles } from "./ui";
import type { EligibilityVerdict } from "@alive/shared";

type DemoAsset = { id: string; symbol: string; name: string };

const DEMO_ASSETS: DemoAsset[] = [
  { id: "tusdc", symbol: "tUSDC", name: "Test USD Cash" },
  { id: "ttbill-a", symbol: "tTBILL-A", name: "Test Treasury Fund A" },
  { id: "tgold", symbol: "tGOLD", name: "Test Gold" },
  { id: "tsp500", symbol: "tSP500", name: "Test Broad Equity Index" },
];

type StageKey = "identify" | "read" | "extract" | "sources" | "evaluate";
type StageStatus = "pending" | "active" | "done" | "error";

const STAGES: { key: StageKey; label: string }[] = [
  { key: "identify", label: "Identifying token" },
  { key: "read", label: "Reading issuer documentation" },
  { key: "extract", label: "Extracting structured asset facts" },
  { key: "sources", label: "Checking source provenance" },
  { key: "evaluate", label: "Evaluating eligibility rules" },
];

function verdictTone(status: EligibilityVerdict["status"]) {
  if (status === "ELIGIBLE") return "success" as const;
  if (status === "RESTRICTED") return "danger" as const;
  return "warning" as const;
}

function verdictIcon(status: EligibilityVerdict["status"]) {
  if (status === "ELIGIBLE") return <ShieldCheckIcon size={34} />;
  if (status === "RESTRICTED") return <ProhibitIcon size={34} />;
  return <QuestionIcon size={34} />;
}

export function VerifyWorkspace() {
  const [selected, setSelected] = useState<DemoAsset>();
  const [stages, setStages] = useState<Record<StageKey, StageStatus>>({
    identify: "pending",
    read: "pending",
    extract: "pending",
    sources: "pending",
    evaluate: "pending",
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>();
  const [extraction, setExtraction] = useState<ExtractionResult>();
  const [sourceCount, setSourceCount] = useState<number>();
  const [verdict, setVerdict] = useState<EligibilityVerdict>();
  const [published, setPublished] = useState<PublishedVerdict>();
  const [publishError, setPublishError] = useState<unknown>();
  const [publishing, setPublishing] = useState(false);

  async function runVerification(asset: DemoAsset) {
    setSelected(asset);
    setRunning(true);
    setError(undefined);
    setExtraction(undefined);
    setSourceCount(undefined);
    setVerdict(undefined);
    setPublished(undefined);
    setPublishError(undefined);
    setStages({
      identify: "active",
      read: "pending",
      extract: "pending",
      sources: "pending",
      evaluate: "pending",
    });
    try {
      await getRwaAsset(asset.id);
      setStages((current) => ({ ...current, identify: "done", read: "active" }));

      await ingestAssetSource(asset.id, `demo-doc-${asset.id}`, "DEMO_FIXTURE", {
        kind: "fixture",
        fixtureId: asset.id,
        title: `${asset.symbol} fact sheet`,
      });
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
    } catch (requestError) {
      setError(requestError);
      setStages((current) => {
        const next = { ...current };
        for (const stage of STAGES) {
          if (next[stage.key] === "active") next[stage.key] = "error";
        }
        return next;
      });
    } finally {
      setRunning(false);
    }
  }

  async function signVerdict() {
    if (!selected) return;
    setPublishing(true);
    setPublishError(undefined);
    try {
      setPublished(await publishAssetVerdict(selected.id));
    } catch (requestError) {
      setPublishError(requestError);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageIntro
        eyebrow="ALIVE verification gateway"
        title="Verify an RWA before capital moves."
        description="Pick a demo asset. ALIVE reads its issuer documentation, extracts structured facts with citations, checks current market and redemption data, and evaluates the result against a deterministic eligibility policy — the same pipeline that gates the X Layer vault."
        aside={<span className={styles.badge}>Every stage is a real API call</span>}
      />

      <section className={styles.section}>
        <div className={styles.grid2}>
          {DEMO_ASSETS.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={`${styles.panel} ${selected?.id === asset.id ? styles.panelAccent : ""}`}
              onClick={() => void runVerification(asset)}
              disabled={running}
              aria-pressed={selected?.id === asset.id}
            >
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.kicker}>{asset.symbol}</p>
                  <h2>{asset.name}</h2>
                </div>
                <MagnifyingGlassIcon size={22} color="#6de493" />
              </div>
              <p className={styles.fieldHint}>ID: {asset.id}</p>
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <section className={styles.section} aria-label="Verification stages">
          <ol className={styles.steps}>
            {STAGES.map((stage, index) => {
              const status = stages[stage.key];
              return (
                <li className={styles.step} key={stage.key}>
                  <span className={styles.stepIndex}>
                    {status === "done" ? (
                      <CheckCircleIcon size={20} color="#6de493" weight="fill" />
                    ) : status === "active" ? (
                      <CircleNotchIcon size={20} />
                    ) : status === "error" ? (
                      <XCircleIcon size={20} color="#e46d6d" weight="fill" />
                    ) : (
                      <CircleIcon size={20} />
                    )}
                  </span>
                  <div>
                    <h3>
                      {String(index + 1).padStart(2, "0")}. {stage.label}
                    </h3>
                    {stage.key === "extract" && extraction ? (
                      <p>
                        Mode: {extraction.extraction.mode}
                        {extraction.warnings.length > 0
                          ? ` — ${extraction.warnings.join(" ")}`
                          : ""}
                      </p>
                    ) : null}
                    {stage.key === "sources" && sourceCount !== undefined ? (
                      <p>{sourceCount} source document(s) on record for this asset.</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <section className={styles.section}>
          <EmptyState
            icon={<MagnifyingGlassIcon size={26} />}
            title="Select an asset to verify"
            description="ALIVE runs the same real pipeline for every demo asset above: ingest, extract, evaluate."
          />
        </section>
      )}

      {error ? (
        <section className={styles.section}>
          {selected ? (
            <ErrorState error={error} retry={() => void runVerification(selected)} />
          ) : (
            <ErrorState error={error} />
          )}
        </section>
      ) : null}

      {verdict ? (
        <section className={styles.section} aria-labelledby="verdict-title">
          <div className={styles.attackStage}>
            <div className={styles.attackBoundary}>
              <div className={styles.attackBoundaryContent}>
                {verdictIcon(verdict.status)}
                <strong id="verdict-title">{verdict.status}</strong>
                <span>
                  {verdict.status === "ELIGIBLE"
                    ? "This asset currently passes every deterministic eligibility check."
                    : verdict.status === "RESTRICTED"
                      ? "This asset currently fails at least one deterministic eligibility check."
                      : "ALIVE does not have enough current data to evaluate this asset."}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.grid2}>
            <article className={styles.panel}>
              <p className={styles.label}>Reasons</p>
              <ul className={styles.violationList}>
                {verdict.reasons.map((reason, index) => (
                  <li key={`${reason.code}-${index}`}>
                    <strong>{reason.code}</strong>
                    {reason.message}
                  </li>
                ))}
              </ul>
            </article>
            <article className={styles.panel}>
              <p className={styles.label}>Verdict binding</p>
              <ul className={styles.plainList}>
                <li>Evaluated at {formatTimestamp(verdict.evaluatedAt)}</li>
                <li>Valid until {formatTimestamp(verdict.validUntil)}</li>
                <li>Passport hash {truncateIdentifier(verdict.passportHash, 10, 8)}</li>
                <li>Policy hash {truncateIdentifier(verdict.policyHash, 10, 8)}</li>
                {verdict.marketSnapshotHash ? (
                  <li>
                    Market snapshot {truncateIdentifier(verdict.marketSnapshotHash, 10, 8)}
                  </li>
                ) : (
                  <li>No market snapshot was available for this evaluation.</li>
                )}
              </ul>
            </article>
          </div>

          <Notice title="Deterministic, not AI-decided" tone="info">
            AI only proposed the extracted facts (see the extraction stage above). This
            ELIGIBLE/RESTRICTED/UNKNOWN result comes entirely from deterministic rule
            evaluation over those facts, current market data, and the active eligibility
            policy — the same result an onchain AliveEligibilityRegistry verdict would carry.
          </Notice>

          <div className={styles.actions}>
            <Link className={styles.buttonSecondary} href={`/assets/${selected?.id}`}>
              View asset passport <ArrowRightIcon size={16} weight="bold" />
            </Link>
            <button
              className={styles.buttonQuiet}
              type="button"
              onClick={() => void signVerdict()}
              disabled={publishing}
            >
              {publishing ? "Signing…" : "Sign eligibility verdict"}
            </button>
          </div>

          {publishError ? (
            publishError instanceof RwaApiError && publishError.code === "SIGNER_NOT_CONFIGURED" ? (
              <Notice title="Eligibility signer not configured" tone="warning">
                Set ELIGIBILITY_SIGNER_PRIVATE_KEY, ELIGIBILITY_CHAIN_ID, and
                ELIGIBILITY_REGISTRY_ADDRESS on the intelligence service to sign
                verdicts for onchain publication.
              </Notice>
            ) : (
              <ErrorState error={publishError} />
            )
          ) : null}

          {published ? (
            <Notice title="Verdict signed" tone="success">
              <p className={styles.errorText}>
                Signer {truncateIdentifier(published.signed.signer, 8, 6)} signed digest{" "}
                {truncateIdentifier(published.signed.digest, 10, 8)}. Submitting this
                signature to AliveEligibilityRegistry.publishEligibility on the configured
                chain would make it the vault&apos;s new source of truth for this asset — that
                onchain broadcast is not wired into this screen yet.
              </p>
            </Notice>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
