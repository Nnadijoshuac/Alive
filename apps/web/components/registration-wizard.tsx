"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  CheckCircleIcon,
  CirclesFourIcon,
  DatabaseIcon,
  FingerprintIcon,
  LockKeyIcon,
  ShieldCheckIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { keccak256, stringToHex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import {
  createAsset,
  finalizeAsset,
  requestAssetAuthorization,
  uploadRegistrationCapture,
} from "@/lib/api";
import {
  authorizationTypedData,
  type AuthorizationSigner,
} from "@/lib/authorization";
import {
  activeChain,
  assetRegistryConfigured,
  contractAddresses,
  explorerTransactionUrl,
} from "@/lib/chain";
import { assetRegistrationArgs, assetRegistryAbi } from "@/lib/contracts";
import { truncateHash } from "@/lib/format";
import { localSubjectAccount, rememberAsset } from "@/lib/local-state";
import { getRegistrationCommitState } from "@/lib/registration-state";
import type {
  AssetCategory,
  AssetMetadata,
  AssetRecord,
  CaptureFrame,
  Hex,
  RegistrationView,
} from "@/lib/types";
import { CameraCapture, type CameraFrame } from "./camera-capture";
import { FingerprintVisualization } from "./fingerprint-visualization";
import { Button, Field, InlineNotice, KeyValue, StatusBadge } from "./ui";
import {
  useWalletAuthorizationSigner,
  useWalletSnapshot,
  WalletButton,
  WalletRequirement,
} from "./wallet-shell";
import { TransactionFlow, type TransactionStep } from "./transaction-flow";

const stages = [
  "Describe",
  "Connect",
  "Privacy",
  "Capture",
  "Build",
  "Review",
  "Commit",
  "Alive",
] as const;
const views: Array<{
  key: RegistrationView;
  label: string;
  instruction: string;
}> = [
  {
    key: "FRONT",
    label: "Front view",
    instruction: "Center the full front face inside the reticle.",
  },
  {
    key: "LEFT",
    label: "Left profile",
    instruction: "Turn the asset left and keep all edges visible.",
  },
  {
    key: "RIGHT",
    label: "Right profile",
    instruction: "Turn the asset right without changing distance.",
  },
  {
    key: "BACK",
    label: "Rear view",
    instruction: "Show the back surface and connection points.",
  },
  {
    key: "DETAIL",
    label: "Unique detail",
    instruction:
      "Frame a sticker, scratch, finish, or other identifying feature.",
  },
  {
    key: "IDENTIFIER",
    label: "Identifier",
    instruction: "Move close enough to read a model or serial label.",
  },
];
const categories: AssetCategory[] = [
  "COMPUTER",
  "PHONE",
  "CAMERA",
  "WATCH",
  "FOOTWEAR",
  "CONSOLE",
  "ELECTRONICS",
  "MACHINERY",
  "OTHER",
];

function asOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function RegistrationWizard() {
  const wallet = useWalletSnapshot();
  const walletSigner = useWalletAuthorizationSigner();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [stage, setStage] = useState(0);
  const [localMode, setLocalMode] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "COMPUTER" as AssetCategory,
    manufacturer: "",
    model: "",
    serialNumber: "",
    description: "",
  });
  const [captures, setCaptures] = useState<
    Partial<Record<RegistrationView, CaptureFrame>>
  >({});
  const [activeView, setActiveView] = useState(0);
  const [asset, setAsset] = useState<AssetRecord | null>(null);
  const [registrationNonce, setRegistrationNonce] = useState<Hex | null>(null);
  const [assetWasLocallyAuthorized, setAssetWasLocallyAuthorized] =
    useState(false);
  const [transactionHash, setTransactionHash] = useState<Hex | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const metadata = useMemo<AssetMetadata>(() => {
    const manufacturer = asOptional(form.manufacturer);
    const model = asOptional(form.model);
    const serialNumber = asOptional(form.serialNumber);
    const description = asOptional(form.description);
    return {
      name: form.name.trim(),
      category: form.category,
      ...(manufacturer ? { manufacturer } : {}),
      ...(model ? { model } : {}),
      ...(serialNumber ? { serialNumber } : {}),
      ...(description ? { description } : {}),
    };
  }, [form]);
  const currentView = views[activeView] ?? views[0];
  const capturedCount = Object.keys(captures).length;
  const commitState = getRegistrationCommitState({
    transactionHash,
    locallyAuthorized: assetWasLocallyAuthorized,
    registryConfigured: assetRegistryConfigured,
    walletConnected: wallet.connected,
    walletCorrectNetwork: wallet.correctNetwork,
    ...(wallet.address ? { walletAddress: wallet.address } : {}),
    ...(asset?.owner ? { assetOwner: asset.owner } : {}),
  });

  const advance = () => {
    setError(null);
    setStage((value) => Math.min(stages.length - 1, value + 1));
  };
  const retreat = () => {
    setError(null);
    setStage((value) => Math.max(0, value - 1));
  };

  const acceptCapture = async (cameraFrame: CameraFrame) => {
    if (!currentView) return;
    const frame: CaptureFrame = {
      view: currentView.key,
      imageBase64: cameraFrame.imageBase64,
      mimeType: "image/jpeg",
      capturedAt: cameraFrame.capturedAt,
      quality: cameraFrame.quality,
    };
    setCaptures((current) => ({ ...current, [currentView.key]: frame }));
    if (activeView < views.length - 1) setActiveView((value) => value + 1);
  };

  const buildFingerprint = async () => {
    if (asset) {
      advance();
      return;
    }

    let signer: AuthorizationSigner | undefined = localMode
      ? undefined
      : walletSigner;
    let locallyAuthorized = false;
    if (!signer && localMode) {
      const account = localSubjectAccount();
      signer = {
        address: account.address,
        sign: (authorization, domain) =>
          account.signTypedData(authorizationTypedData(authorization, domain)),
      };
      locallyAuthorized = true;
    }
    if (!signer) {
      setError("Connect a wallet or explicitly choose local capture mode.");
      return;
    }
    if (capturedCount !== views.length) {
      setError(
        "All six physical views are required before fingerprint generation.",
      );
      return;
    }
    setWorking(true);
    setError(null);
    setProgress(4);
    try {
      const challenge = await requestAssetAuthorization(
        signer.address,
        metadata,
      );
      const signature = await signer.sign(
        challenge.authorization,
        challenge.domain,
      );
      const created = await createAsset(
        signer.address,
        metadata,
        challenge,
        signature,
      );
      setRegistrationNonce(challenge.authorization.nonce);
      let record = created.asset;
      setAssetWasLocallyAuthorized(locallyAuthorized);
      const orderedFrames = views
        .map((view) => captures[view.key])
        .filter((frame): frame is CaptureFrame => Boolean(frame));
      for (let index = 0; index < orderedFrames.length; index += 1) {
        const frame = orderedFrames[index];
        if (!frame) continue;
        await uploadRegistrationCapture(
          record.assetId,
          frame,
          created.capability.token,
        );
        setProgress(Math.round(((index + 1) / orderedFrames.length) * 78));
      }
      record = await finalizeAsset(record.assetId, created.capability.token);
      setProgress(100);
      setAsset(record);
      rememberAsset({ asset: record });
      advance();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Fingerprint generation failed.",
      );
    } finally {
      setWorking(false);
    }
  };

  const registerOnchain = async () => {
    if (
      commitState !== "ready" ||
      !asset?.fingerprintHash ||
      !registrationNonce ||
      !contractAddresses.assetRegistry ||
      !wallet.address
    )
      return;
    setWorking(true);
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: contractAddresses.assetRegistry,
        abi: assetRegistryAbi,
        functionName: "registerAsset",
        chainId: activeChain.id,
        args: assetRegistrationArgs({
          assetId: asset.assetId,
          registrationNonce,
          fingerprintHash: asset.fingerprintHash,
          metadataHash: keccak256(stringToHex(JSON.stringify(metadata))),
          metadataURI: "",
        }),
      });
      setTransactionHash(hash);
      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      if (!receipt || receipt.status !== "success")
        throw new Error(
          "The registration transaction did not confirm successfully.",
        );
      rememberAsset({ asset, transactionHash: hash });
      advance();
    } catch (caught) {
      setError(
        caught instanceof Error &&
          caught.message.toLowerCase().includes("rejected")
          ? "The wallet rejected the registration transaction."
          : caught instanceof Error
            ? caught.message
            : "Registration transaction failed.",
      );
    } finally {
      setWorking(false);
    }
  };

  const finishLocal = () => {
    if (asset) rememberAsset({ asset });
    advance();
  };

  const transactionSteps: TransactionStep[] = [
    {
      label: "Evidence finalized",
      detail: "The verifier returned a fingerprint commitment.",
      state: asset?.fingerprintHash ? "confirmed" : "idle",
    },
    {
      label: "Wallet signature",
      detail: assetWasLocallyAuthorized
        ? "Ephemeral browser authorization cannot register onchain"
        : assetRegistryConfigured
          ? "Confirm asset registration in your wallet."
          : "Unavailable until the Asset Registry is configured.",
      state:
        working && !transactionHash
          ? "pending"
          : transactionHash
            ? "confirmed"
            : assetRegistryConfigured && !assetWasLocallyAuthorized
              ? "idle"
              : "blocked",
    },
    {
      label: "X Layer confirmation",
      detail: transactionHash
        ? truncateHash(transactionHash)
        : "No transaction hash exists yet.",
      state:
        working && transactionHash
          ? "pending"
          : transactionHash && stage === 7
            ? "confirmed"
            : "idle",
    },
  ];

  return (
    <div className="registration-shell">
      <nav className="wizard-progress" aria-label="Registration progress">
        {stages.map((label, index) => (
          <button
            key={label}
            type="button"
            className={
              index === stage ? "current" : index < stage ? "complete" : ""
            }
            disabled={index > stage}
            onClick={() => index < stage && setStage(index)}
            aria-current={index === stage ? "step" : undefined}
          >
            <span>
              {index < stage ? (
                <CheckCircleIcon size={16} weight="fill" />
              ) : (
                index + 1
              )}
            </span>
            {label}
          </button>
        ))}
      </nav>

      <section className="wizard-panel">
        {stage === 0 ? (
          <div className="wizard-content">
            <header>
              <CirclesFourIcon size={30} />
              <div>
                <h2>Describe the physical asset</h2>
                <p>
                  Only its name and category are required. Identifiers
                  strengthen later comparison when available.
                </p>
              </div>
            </header>
            <div className="form-grid">
              <Field label="Asset name">
                <input
                  className="input"
                  value={form.name}
                  maxLength={120}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="My MacBook Pro"
                  autoFocus
                />
              </Field>
              <Field label="Category">
                <select
                  className="select"
                  value={form.category}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      category: event.target.value as AssetCategory,
                    })
                  }
                >
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </Field>
              <Field label="Manufacturer" hint="Optional">
                <input
                  className="input"
                  value={form.manufacturer}
                  onChange={(event) =>
                    setForm({ ...form, manufacturer: event.target.value })
                  }
                  placeholder="Apple"
                />
              </Field>
              <Field label="Model" hint="Optional">
                <input
                  className="input"
                  value={form.model}
                  onChange={(event) =>
                    setForm({ ...form, model: event.target.value })
                  }
                  placeholder="MacBook Pro"
                />
              </Field>
              <Field
                label="Serial number"
                hint="Optional. It is compared with OCR when visible."
              >
                <input
                  className="input"
                  value={form.serialNumber}
                  onChange={(event) =>
                    setForm({ ...form, serialNumber: event.target.value })
                  }
                  autoComplete="off"
                />
              </Field>
              <Field label="Description" hint="Optional observable details">
                <textarea
                  className="textarea"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Finish, stickers, marks, and visible wear"
                />
              </Field>
            </div>
            <WizardFooter nextDisabled={!form.name.trim()} onNext={advance} />
          </div>
        ) : null}

        {stage === 1 ? (
          <div className="wizard-content narrow-wizard">
            <header>
              <LockKeyIcon size={30} />
              <div>
                <h2>Bind the capture to a subject</h2>
                <p>
                  A connected wallet becomes the registered owner. Local mode
                  creates an ephemeral browser subject and never claims an
                  onchain owner.
                </p>
              </div>
            </header>
            <WalletRequirement />
            <div className="wallet-choice">
              <WalletButton />
              <span>or</span>
              <Button
                className={localMode ? "button-primary" : "button-secondary"}
                aria-pressed={localMode}
                onClick={() => setLocalMode((selected) => !selected)}
              >
                {localMode
                  ? "Local capture selected"
                  : "Use local capture mode"}
              </Button>
            </div>
            {localMode ? (
              <InlineNotice
                tone="warning"
                title="Wallet authorization is required for X Layer"
              >
                Local mode uses a session-only browser owner, even when a wallet
                is connected. Capture and verifier analysis will work, but this
                record cannot be registered onchain. Deselect local mode and
                continue with a connected wallet if X Layer registration is
                required.
              </InlineNotice>
            ) : null}
            <WizardFooter
              onBack={retreat}
              onNext={advance}
              nextDisabled={!wallet.connected && !localMode}
            />
          </div>
        ) : null}

        {stage === 2 ? (
          <div className="wizard-content narrow-wizard">
            <header>
              <ShieldCheckIcon size={30} />
              <div>
                <h2>Understand the evidence boundary</h2>
                <p>
                  ALIVE creates a private multi-signal visual fingerprint from
                  the next six views.
                </p>
              </div>
            </header>
            <div className="privacy-grid">
              <article>
                <CameraIcon size={25} />
                <strong>Raw media stays offchain</strong>
                <p>
                  Frames are sent only to the configured verifier and are never
                  written into this repository or a public ledger.
                </p>
              </article>
              <article>
                <DatabaseIcon size={25} />
                <strong>Features remain private</strong>
                <p>
                  Embeddings, local descriptors, and OCR evidence live in
                  verifier storage.
                </p>
              </article>
              <article>
                <FingerprintIcon size={25} />
                <strong>Commitments cross the boundary</strong>
                <p>
                  Only hashes and signed verification results need to reach X
                  Layer.
                </p>
              </article>
            </div>
            <WizardFooter onBack={retreat} onNext={advance} />
          </div>
        ) : null}

        {stage === 3 && currentView ? (
          <div className="wizard-content capture-stage">
            <header>
              <CameraIcon size={30} />
              <div>
                <h2>Capture six identifying views</h2>
                <p>
                  Each frame passes real focus and exposure checks before it can
                  enter the evidence set.
                </p>
              </div>
              <StatusBadge tone="active">
                {capturedCount} / {views.length}
              </StatusBadge>
            </header>
            <div
              className="view-selector"
              role="tablist"
              aria-label="Registration views"
            >
              {views.map((view, index) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={index === activeView}
                  className={index === activeView ? "active" : ""}
                  key={view.key}
                  onClick={() => setActiveView(index)}
                >
                  <span>
                    {captures[view.key] ? (
                      <CheckCircleIcon size={15} weight="fill" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {view.label}
                </button>
              ))}
            </div>
            <CameraCapture
              key={currentView.key}
              label={currentView.label}
              instruction={currentView.instruction}
              onCapture={acceptCapture}
            />
            <WizardFooter
              onBack={retreat}
              onNext={advance}
              nextLabel="Build fingerprint"
              nextDisabled={capturedCount !== views.length}
            />
          </div>
        ) : null}

        {stage === 4 ? (
          <div className="wizard-content processing-stage">
            <header>
              <FingerprintIcon size={30} />
              <div>
                <h2>Build the asset fingerprint</h2>
                <p>
                  The configured verifier extracts visual features, detects
                  identifiers, and creates an evidence commitment.
                </p>
              </div>
            </header>
            <div className="processing-visual">
              <FingerprintVisualization
                hash={asset?.fingerprintHash ?? `${form.name}:${capturedCount}`}
                label={
                  asset
                    ? "Returned evidence commitment"
                    : "Pending local constellation"
                }
              />
            </div>
            <div className="process-status">
              <div>
                <span
                  style={
                    {
                      "--progress-scale": progress / 100,
                    } as React.CSSProperties
                  }
                />
              </div>
              <strong>
                {working
                  ? "Submitting private observations"
                  : asset
                    ? "Fingerprint finalized"
                    : "Ready for verifier analysis"}
              </strong>
              <span>{progress}%</span>
            </div>
            {error ? (
              <InlineNotice tone="warning" title="Verifier could not finish">
                {error}
              </InlineNotice>
            ) : null}
            <div className="wizard-footer">
              <Button
                className="button-secondary"
                onClick={retreat}
                disabled={working}
              >
                <ArrowLeftIcon size={17} />
                Back
              </Button>
              <Button
                className="button-primary"
                onClick={() => (asset ? advance() : void buildFingerprint())}
                disabled={working}
              >
                {working ? (
                  <UploadSimpleIcon className="spin" size={17} />
                ) : (
                  <FingerprintIcon size={17} />
                )}{" "}
                {working
                  ? "Analyzing"
                  : asset
                    ? "Continue"
                    : "Generate fingerprint"}
              </Button>
            </div>
          </div>
        ) : null}

        {stage === 5 && asset ? (
          <div className="wizard-content review-stage">
            <header>
              <CheckCircleIcon size={30} />
              <div>
                <h2>Review the verifier record</h2>
                <p>
                  This is the public-facing summary. No raw capture media
                  appears here.
                </p>
              </div>
            </header>
            <div className="review-grid">
              <FingerprintVisualization
                hash={asset.fingerprintHash ?? asset.assetId}
                compact
              />
              <div className="review-values">
                <KeyValue label="Asset name">{asset.metadata.name}</KeyValue>
                <KeyValue label="Category">{asset.metadata.category}</KeyValue>
                <KeyValue label="Asset ID">
                  {truncateHash(asset.assetId, 12, 10)}
                </KeyValue>
                <KeyValue label="Owner subject">
                  {truncateHash(asset.owner, 12, 8)}
                </KeyValue>
                <KeyValue label="Captured views">
                  {asset.registrationViewCount}
                </KeyValue>
                <KeyValue label="Fingerprint">
                  {asset.fingerprintHash
                    ? truncateHash(asset.fingerprintHash, 12, 10)
                    : "Unavailable"}
                </KeyValue>
              </div>
            </div>
            <WizardFooter
              onBack={retreat}
              onNext={advance}
              nextLabel="Prepare registration"
            />
          </div>
        ) : null}

        {stage === 6 && asset ? (
          <div className="wizard-content commit-stage">
            <header>
              <UploadSimpleIcon size={30} />
              <div>
                <h2>Commit registration to X Layer</h2>
                <p>
                  A real wallet transaction is used only when registry
                  deployment settings are present.
                </p>
              </div>
            </header>
            <TransactionFlow steps={transactionSteps} />
            {commitState === "submitted" ? (
              <InlineNotice
                tone={working ? "loading" : "info"}
                title="Registration transaction already submitted"
              >
                A second registration transaction is disabled for this record.
                Check the recorded transaction result before taking another
                action.
              </InlineNotice>
            ) : commitState === "local-only" ? (
              <InlineNotice tone="warning" title="Offchain-only owner">
                This asset was authorized by a session-only browser signer, so
                it can only be completed as an offchain record. X Layer
                registration requires wallet authorization before fingerprint
                generation.
              </InlineNotice>
            ) : commitState === "contracts-missing" ? (
              <InlineNotice
                tone="warning"
                title="Asset Registry not configured"
              >
                The offchain asset is ready. Set the public Asset Registry
                address to enable a real registration transaction.
              </InlineNotice>
            ) : commitState === "wallet-required" ? (
              <InlineNotice tone="warning" title="Connected wallet required">
                Connect the same wallet that authorized this asset before
                onchain registration.
              </InlineNotice>
            ) : commitState === "wrong-network" ? (
              <WalletRequirement />
            ) : commitState === "owner-mismatch" ? (
              <InlineNotice
                tone="warning"
                title="Connected wallet does not match the asset owner"
              >
                The connected wallet {truncateHash(wallet.address ?? "", 10, 8)}{" "}
                did not authorize this asset. Reconnect the owner wallet{" "}
                {truncateHash(asset.owner, 10, 8)} to submit the registration.
              </InlineNotice>
            ) : null}
            {error ? (
              <InlineNotice tone="warning" title="Transaction not completed">
                {error}
              </InlineNotice>
            ) : null}
            <div className="wizard-footer">
              <Button
                className="button-secondary"
                onClick={retreat}
                disabled={working}
              >
                <ArrowLeftIcon size={17} />
                Back
              </Button>
              {commitState === "ready" || commitState === "submitted" ? (
                <Button
                  className="button-primary"
                  disabled={
                    working ||
                    commitState === "submitted" ||
                    !asset.fingerprintHash ||
                    !registrationNonce
                  }
                  onClick={() => void registerOnchain()}
                >
                  {transactionHash
                    ? "Registration submitted"
                    : working
                      ? "Awaiting confirmation"
                      : `Register on ${activeChain.name}`}
                  <ArrowRightIcon size={17} />
                </Button>
              ) : (
                <Button className="button-secondary" onClick={finishLocal}>
                  Complete offchain record
                  <ArrowRightIcon size={17} />
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {stage === 7 && asset ? (
          <div className="wizard-content success-stage">
            <CheckCircleIcon className="success-icon" size={54} weight="fill" />
            <p className="eyebrow">Registration complete</p>
            <h2>Asset is alive.</h2>
            <p>
              {transactionHash
                ? `The registration confirmed on ${activeChain.name}.`
                : "The verifier record is complete. No onchain transaction was submitted."}
            </p>
            <div className="success-values">
              <KeyValue label="Asset ID">
                {truncateHash(asset.assetId, 14, 12)}
              </KeyValue>
              <KeyValue label="Owner">
                {truncateHash(asset.owner, 14, 10)}
              </KeyValue>
              <KeyValue label="Evidence hash">
                {asset.fingerprintHash
                  ? truncateHash(asset.fingerprintHash, 14, 12)
                  : "Not available"}
              </KeyValue>
              <KeyValue label="Transaction">
                {transactionHash
                  ? truncateHash(transactionHash, 14, 12)
                  : "Not submitted"}
              </KeyValue>
            </div>
            {transactionHash && explorerTransactionUrl(transactionHash) ? (
              <a
                className="text-link"
                href={explorerTransactionUrl(transactionHash)}
                target="_blank"
                rel="noreferrer"
              >
                View confirmed transaction
              </a>
            ) : null}
            <div className="success-actions">
              <Link
                className="button button-primary"
                href={`/verify/${asset.assetId}`}
              >
                Verify asset
              </Link>
              <Link
                className="button button-secondary"
                href={`/escrow/create?assetId=${asset.assetId}`}
              >
                Create escrow
              </Link>
              <Link
                className="button button-secondary"
                href={`/assets/${asset.assetId}`}
              >
                View passport
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function WizardFooter({
  onBack,
  onNext,
  nextDisabled = false,
  nextLabel = "Continue",
}: {
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="wizard-footer">
      {onBack ? (
        <Button className="button-secondary" onClick={onBack}>
          <ArrowLeftIcon size={17} />
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button
        className="button-primary"
        onClick={onNext}
        disabled={nextDisabled}
      >
        {nextLabel}
        <ArrowRightIcon size={17} />
      </Button>
    </div>
  );
}
