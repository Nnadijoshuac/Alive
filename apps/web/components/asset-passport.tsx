"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  CameraIcon,
  CheckCircleIcon,
  FingerprintIcon,
  IdentificationCardIcon,
  ShieldWarningIcon,
} from "@phosphor-icons/react";
import { getAsset } from "@/lib/api";
import { explorerTransactionUrl } from "@/lib/chain";
import {
  formatDate,
  formatScore,
  humanizeCode,
  truncateHash,
} from "@/lib/format";
import { localAssets, localVerifications } from "@/lib/local-state";
import type { AssetRecord } from "@/lib/types";
import { FingerprintVisualization } from "./fingerprint-visualization";
import {
  buttonClass,
  Button,
  InlineNotice,
  KeyValue,
  Skeleton,
  StatusBadge,
} from "./ui";

export function AssetPassport({ assetId }: { assetId: string }) {
  const [asset, setAsset] = useState<AssetRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rememberedEntry = useMemo(
    () =>
      localAssets().find(
        (entry) => entry.asset.assetId.toLowerCase() === assetId.toLowerCase(),
      ),
    [assetId],
  );
  const inspections = useMemo(
    () =>
      localVerifications().filter(
        (entry) => entry.result.assetId.toLowerCase() === assetId.toLowerCase(),
      ),
    [assetId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAsset(await getAsset(assetId));
    } catch (caught) {
      if (rememberedEntry) {
        setAsset(rememberedEntry.asset);
        setError(
          caught instanceof Error
            ? caught.message
            : "Remote record is unavailable.",
        );
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : "Asset record could not be loaded.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [assetId, rememberedEntry]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading)
    return (
      <div className="passport-loading">
        <Skeleton className="skeleton-wide" />
        <Skeleton className="skeleton-tall" />
      </div>
    );
  if (!asset)
    return (
      <div className="state-panel">
        <IdentificationCardIcon size={42} />
        <h2>Asset passport not found.</h2>
        <p>{error ?? "The verifier did not return this asset."}</p>
        <Button className="button-secondary" onClick={() => void load()}>
          Retry lookup
        </Button>
      </div>
    );

  return (
    <div className="passport-content">
      {error ? (
        <InlineNotice title="Showing the locally remembered record">
          {error}
        </InlineNotice>
      ) : null}
      <section className="passport-hero">
        <div className="passport-identity">
          <StatusBadge tone={asset.fingerprintHash ? "success" : "warning"}>
            {asset.fingerprintHash ? "BASELINE ACTIVE" : "BASELINE INCOMPLETE"}
          </StatusBadge>
          <h2>{asset.metadata.name}</h2>
          <p>
            {[
              asset.metadata.manufacturer,
              asset.metadata.model,
              humanizeCode(asset.metadata.category),
            ]
              .filter(Boolean)
              .join(" / ")}
          </p>
          <div className="passport-actions">
            <Link
              className={`${buttonClass} button-primary`}
              href={`/verify/${asset.assetId}`}
            >
              <CameraIcon size={17} />
              Verify now
            </Link>
            <Link
              className={`${buttonClass} button-secondary`}
              href={`/escrow/create?assetId=${asset.assetId}`}
            >
              Create escrow
              <ArrowRightIcon size={17} />
            </Link>
          </div>
        </div>
        <FingerprintVisualization
          hash={asset.fingerprintHash ?? asset.assetId}
          label="Asset visual fingerprint"
        />
      </section>

      <section className="passport-data">
        <KeyValue label="Asset ID">{asset.assetId}</KeyValue>
        <KeyValue label="Owner">{asset.owner}</KeyValue>
        <KeyValue label="Registered">{formatDate(asset.createdAt)}</KeyValue>
        <KeyValue label="Evidence commitment">
          {asset.fingerprintHash ?? "Not finalized"}
        </KeyValue>
        <KeyValue label="Registration views">
          {asset.registrationViewCount}
        </KeyValue>
        <KeyValue label="Registration transaction">
          {rememberedEntry?.transactionHash ? (
            <a
              className="text-link inline-link"
              href={explorerTransactionUrl(rememberedEntry.transactionHash)}
              target="_blank"
              rel="noreferrer"
            >
              {truncateHash(rememberedEntry.transactionHash)}
            </a>
          ) : (
            "Not submitted from this browser"
          )}
        </KeyValue>
      </section>

      <section className="passport-timeline">
        <header>
          <h2>Physical-state timeline</h2>
          <p>
            Each event comes from registration or a completed verifier session.
          </p>
        </header>
        <ol>
          <li>
            <span className="timeline-icon">
              <FingerprintIcon size={18} />
            </span>
            <div>
              <StatusBadge tone="success">REGISTERED</StatusBadge>
              <h3>Baseline fingerprint created</h3>
              <p>
                {asset.registrationViewCount} views entered the private evidence
                set.
              </p>
              <time>{formatDate(asset.createdAt)}</time>
            </div>
          </li>
          {inspections.map(({ result }) => (
            <li key={result.sessionId}>
              <span className="timeline-icon">
                {result.verified ? (
                  <CheckCircleIcon size={18} weight="fill" />
                ) : (
                  <ShieldWarningIcon size={18} />
                )}
              </span>
              <div>
                <StatusBadge tone={result.verified ? "success" : "warning"}>
                  {result.verified ? "VERIFIED" : "REJECTED"}
                </StatusBadge>
                <h3>
                  {result.verified
                    ? "Physical-state policy satisfied"
                    : "Physical-state policy not satisfied"}
                </h3>
                <div className="timeline-scores">
                  <span>Identity {formatScore(result.identityScoreBps)}</span>
                  <span>Liveness {formatScore(result.livenessScoreBps)}</span>
                  <span>Integrity {formatScore(result.integrityScoreBps)}</span>
                </div>
                {result.reasonCodes.length ? (
                  <p>{result.reasonCodes.map(humanizeCode).join(", ")}</p>
                ) : null}
                <time>{formatDate(result.timestamp)}</time>
              </div>
            </li>
          ))}
        </ol>
        {!inspections.length ? (
          <div className="compact-empty">
            <ShieldWarningIcon size={24} />
            <span>No subsequent inspection exists in this browser yet.</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
