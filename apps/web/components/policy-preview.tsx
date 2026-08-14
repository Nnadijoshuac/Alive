"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";

type PolicyRangeProps = {
  description: string;
  formatValue: (value: number) => string;
  id: string;
  label: string;
  max: number;
  min: number;
  name: string;
  onChange: (value: number) => void;
  value: number;
};

function PolicyRange({
  description,
  formatValue,
  id,
  label,
  max,
  min,
  name,
  onChange,
  value,
}: PolicyRangeProps) {
  const descriptionId = `${id}-description`;

  return (
    <div className="policy-preview-control">
      <div className="policy-preview-control-heading">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{formatValue(value)}</output>
      </div>
      <input
        id={id}
        name={name}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-describedby={descriptionId}
        aria-valuetext={formatValue(value)}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
      <p id={descriptionId}>{description}</p>
    </div>
  );
}

export function PolicyPreview() {
  const identityId = useId();
  const livenessId = useId();
  const lifetimeId = useId();
  const titleId = useId();
  const [identityThreshold, setIdentityThreshold] = useState(85);
  const [livenessThreshold, setLivenessThreshold] = useState(72);
  const [attestationLifetime, setAttestationLifetime] = useState(15);

  return (
    <section className="policy-preview" aria-labelledby={titleId}>
      <header className="policy-preview-header">
        <p className="policy-preview-kicker">Policy preview</p>
        <h3 id={titleId}>Set the gate before evidence arrives.</h3>
        <p>
          These controls illustrate the identity, liveness, and freshness terms
          an escrow policy can require.
        </p>
      </header>

      <fieldset className="policy-preview-controls">
        <legend>Release conditions</legend>
        <PolicyRange
          id={identityId}
          name="identity-threshold"
          label="Identity threshold"
          description={`${identityThreshold * 100} basis points. The presented object must meet or exceed this configured threshold.`}
          min={50}
          max={100}
          value={identityThreshold}
          formatValue={(value) => `${value}%`}
          onChange={setIdentityThreshold}
        />
        <PolicyRange
          id={livenessId}
          name="liveness-threshold"
          label="Liveness threshold"
          description={`${livenessThreshold * 100} basis points. Fresh challenge evidence must meet or exceed this configured threshold.`}
          min={50}
          max={100}
          value={livenessThreshold}
          formatValue={(value) => `${value}%`}
          onChange={setLivenessThreshold}
        />
        <PolicyRange
          id={lifetimeId}
          name="attestation-lifetime"
          label="Attestation lifetime"
          description="The signed attestation must be submitted before this freshness window closes."
          min={1}
          max={60}
          value={attestationLifetime}
          formatValue={(value) =>
            `${value} ${value === 1 ? "minute" : "minutes"}`
          }
          onChange={setAttestationLifetime}
        />
      </fieldset>

      <div className="policy-preview-outcomes" aria-label="Policy outcomes">
        <article className="policy-preview-outcome policy-preview-outcome-locked">
          <span>Rejected or expired</span>
          <strong>Funds remain untouched</strong>
          <p>
            A failed threshold, stale signature, mismatched context, or replayed
            session cannot authorize release.
          </p>
        </article>
        <article className="policy-preview-outcome policy-preview-outcome-release">
          <span>Valid, fresh, and unused</span>
          <strong>Release is permitted</strong>
          <p>
            The contract may release funds only after every configured policy
            check succeeds.
          </p>
        </article>
      </div>

      <p className="policy-preview-note" role="note">
        Preview only. Moving these controls does not capture evidence, run
        verification, issue an attestation, or move funds.
      </p>

      <nav className="policy-preview-actions" aria-label="Policy preview actions">
        <Link className="policy-preview-primary-link" href="/escrow/create">
          Create an escrow
          <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
        </Link>
        <Link className="policy-preview-secondary-link" href="/attack-lab">
          Explore failure cases
          <ArrowRightIcon size={16} aria-hidden="true" />
        </Link>
      </nav>
    </section>
  );
}
