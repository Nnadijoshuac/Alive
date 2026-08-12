"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  CameraIcon,
  CirclesFourIcon,
  ClockCounterClockwiseIcon,
  FolderOpenIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { listAssets } from "@/lib/api";
import { formatDate, humanizeCode, truncateHash } from "@/lib/format";
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
import { useWalletSnapshot } from "./wallet-shell";

type LoadState = "loading" | "ready" | "empty" | "error";

export function DashboardView() {
  const wallet = useWalletSnapshot();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const verifications = useMemo(() => localVerifications(), []);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    const remembered = localAssets().map((entry) => entry.asset);
    try {
      const remote = await listAssets(wallet.address);
      const merged = [...remote, ...remembered].filter(
        (asset, index, all) =>
          all.findIndex((candidate) => candidate.assetId === asset.assetId) ===
          index,
      );
      setAssets(merged);
      setState(merged.length ? "ready" : "empty");
    } catch (caught) {
      if (remembered.length) {
        setAssets(remembered);
        setState("ready");
        setError(
          caught instanceof Error
            ? caught.message
            : "Remote assets are unavailable.",
        );
      } else {
        setState("error");
        setError(
          caught instanceof Error
            ? caught.message
            : "Assets could not be loaded.",
        );
      }
    }
  }, [wallet.address]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div className="dashboard-loading" aria-label="Loading assets">
        <Skeleton className="skeleton-tall" />
        <Skeleton className="skeleton-tall" />
        <Skeleton className="skeleton-wide" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="state-panel">
        <FolderOpenIcon size={40} />
        <h2>Asset records are unavailable.</h2>
        <p>{error}</p>
        <Button className="button-secondary" onClick={() => void load()}>
          Retry verifier
        </Button>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="state-panel">
        <CameraIcon size={42} />
        <h2>No physical baselines yet.</h2>
        <p>
          Register an object to create the first private visual fingerprint and
          asset passport.
        </p>
        <Link
          className={`${buttonClass} button-primary`}
          href="/assets/register"
        >
          <PlusIcon size={17} />
          Register an asset
        </Link>
      </div>
    );
  }

  return (
    <div className="dashboard-content">
      {error ? (
        <InlineNotice title="Showing locally remembered records">
          {error}
        </InlineNotice>
      ) : null}
      <section className="dashboard-metrics" aria-label="Protocol activity">
        <article>
          <CirclesFourIcon size={23} />
          <KeyValue label="Registered assets">{assets.length}</KeyValue>
        </article>
        <article>
          <ShieldCheckIcon size={23} />
          <KeyValue label="Completed inspections">
            {verifications.length}
          </KeyValue>
        </article>
        <article>
          <ClockCounterClockwiseIcon size={23} />
          <KeyValue label="Rejected inspections">
            {verifications.filter((item) => !item.result.verified).length}
          </KeyValue>
        </article>
        <article>
          <CameraIcon size={23} />
          <KeyValue label="Evidence mode">Offchain media</KeyValue>
        </article>
      </section>

      <section className="dashboard-section">
        <header>
          <div>
            <h2>Asset passports</h2>
            <p>
              Public summaries of physical baselines. Raw inspection media is
              excluded.
            </p>
          </div>
          <Link
            className={`${buttonClass} button-secondary`}
            href="/assets/register"
          >
            <PlusIcon size={16} />
            Register
          </Link>
        </header>
        <div className="asset-grid">
          {assets.map((asset, index) => (
            <Link
              href={`/assets/${asset.assetId}`}
              className={`asset-card ${index === 0 ? "asset-featured" : ""}`}
              key={asset.assetId}
            >
              <FingerprintVisualization
                hash={asset.fingerprintHash ?? asset.assetId}
                compact
                label="Asset fingerprint"
              />
              <div className="asset-card-body">
                <StatusBadge
                  tone={asset.fingerprintHash ? "success" : "neutral"}
                >
                  {asset.fingerprintHash ? "FINGERPRINTED" : "INCOMPLETE"}
                </StatusBadge>
                <h3>{asset.metadata.name}</h3>
                <p>
                  {asset.metadata.manufacturer ??
                    humanizeCode(asset.metadata.category)}{" "}
                  {asset.metadata.model ?? ""}
                </p>
                <div>
                  <span>{truncateHash(asset.assetId)}</span>
                  <span>{formatDate(asset.createdAt)}</span>
                </div>
                <ArrowRightIcon className="asset-arrow" size={18} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-section recent-inspections">
        <header>
          <div>
            <h2>Recent inspections</h2>
            <p>
              Results shown here are returned by the verifier, not generated by
              the interface.
            </p>
          </div>
        </header>
        {verifications.length ? (
          <div className="inspection-list">
            {verifications.slice(0, 5).map(({ result }) => (
              <Link key={result.sessionId} href={`/assets/${result.assetId}`}>
                <StatusBadge tone={result.verified ? "success" : "warning"}>
                  {result.verified ? "VERIFIED" : "REJECTED"}
                </StatusBadge>
                <strong>{truncateHash(result.assetId, 12, 8)}</strong>
                <span>{formatDate(result.timestamp)}</span>
                <span>
                  {result.reasonCodes.length
                    ? result.reasonCodes.map(humanizeCode).join(", ")
                    : "No failure reasons"}
                </span>
                <ArrowRightIcon size={17} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="compact-empty">
            <ShieldCheckIcon size={25} />
            <span>
              No completed verification sessions are stored in this browser.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
