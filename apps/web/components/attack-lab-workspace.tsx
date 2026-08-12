"use client";

import { useMemo, useState } from "react";
import {
  CameraSlashIcon,
  ClockCountdownIcon,
  ImageIcon,
  ShieldWarningIcon,
  SwapIcon,
  TestTubeIcon,
} from "@phosphor-icons/react";
import { localAssets } from "@/lib/local-state";
import { Button, Field, InlineNotice, StatusBadge } from "./ui";
import { VerificationWorkflow } from "./verification-workflow";

const intents = [
  {
    id: "PHOTO_REPLAY",
    label: "Static photo replay",
    icon: ImageIcon,
    instruction:
      "Present a photograph or screen image of the registered object, then attempt the live movement instructions.",
    signals: "Motion consistency, challenge completion, perceptual replay risk",
  },
  {
    id: "WRONG_OBJECT",
    label: "Object substitution",
    icon: SwapIcon,
    instruction:
      "Present a different physical object with a similar category or silhouette.",
    signals:
      "Global similarity, local features, identifiers, multi-view consistency",
  },
  {
    id: "EXPIRED_SESSION",
    label: "Expired capability",
    icon: ClockCountdownIcon,
    instruction:
      "Create a session, let its server deadline pass, then attempt to submit an observation.",
    signals: "Session expiry, freshness, challenge validity",
  },
  {
    id: "GENUINE_CONTROL",
    label: "Genuine control",
    icon: TestTubeIcon,
    instruction:
      "Present the originally registered asset and complete each requested view live.",
    signals: "All configured verifier signals",
  },
] as const;

export function AttackLabWorkspace() {
  const remembered = useMemo(() => localAssets(), []);
  const [assetId, setAssetId] = useState(remembered[0]?.asset.assetId ?? "");
  const [intent, setIntent] = useState<(typeof intents)[number]>(intents[0]);
  const [running, setRunning] = useState(false);

  return (
    <div className="attack-lab-layout">
      <aside className="attack-controls">
        <div className="attack-warning">
          <ShieldWarningIcon size={30} />
          <div>
            <strong>Adversarial testing only</strong>
            <span>
              The selected intent guides the presenter. It is not sent to the
              verifier and cannot predetermine the result.
            </span>
          </div>
        </div>
        <Field
          label="Registered asset ID"
          hint="Use a real asset baseline from this verifier."
        >
          <input
            className="input mono"
            value={assetId}
            onChange={(event) => {
              setAssetId(event.target.value);
              setRunning(false);
            }}
            placeholder="0x..."
          />
        </Field>
        <div
          className="intent-list"
          role="radiogroup"
          aria-label="Attack intent"
        >
          {intents.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={intent.id === item.id}
                key={item.id}
                className={intent.id === item.id ? "active" : ""}
                onClick={() => {
                  setIntent(item);
                  setRunning(false);
                }}
              >
                <Icon size={22} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.signals}</small>
                </span>
              </button>
            );
          })}
        </div>
        <Button
          className="button-primary"
          disabled={!/^0x[0-9a-fA-F]{64}$/.test(assetId)}
          onClick={() => setRunning(true)}
        >
          {running ? "Lab active" : "Run real verification"}
        </Button>
      </aside>
      <section className="attack-stage">
        <header>
          <CameraSlashIcon size={31} />
          <div>
            <StatusBadge tone="warning">
              {intent.id.replaceAll("_", " ")}
            </StatusBadge>
            <h2>{intent.label}</h2>
            <p>{intent.instruction}</p>
          </div>
        </header>
        {!running ? (
          <div className="attack-idle">
            <div className="attack-reticle">
              <ShieldWarningIcon size={46} />
            </div>
            <h3>Verifier outcome is intentionally unknown.</h3>
            <p>
              Start the lab, follow the selected adversarial procedure, and
              inspect genuine scores and reason codes.
            </p>
          </div>
        ) : (
          <VerificationWorkflow
            key={`${assetId}:${intent.id}`}
            assetId={assetId}
            intentLabel={intent.label}
          />
        )}
        {!remembered.length ? (
          <InlineNotice tone="warning" title="No local baseline found">
            Register an asset first or paste an ID that exists in the configured
            verifier.
          </InlineNotice>
        ) : null}
      </section>
    </div>
  );
}
