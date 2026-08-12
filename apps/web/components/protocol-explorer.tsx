"use client";

import { useState } from "react";
import { CameraIcon, CpuIcon, DatabaseIcon, FingerprintIcon, LockKeyIcon, SealCheckIcon, WalletIcon } from "@phosphor-icons/react";
import { InlineNotice, KeyValue } from "./ui";

const nodes = [
  { id: "capture", label: "Live capture", icon: CameraIcon, boundary: "Browser", detail: "getUserMedia produces fresh frames for ordered server challenges. Client-side quality gates reject unusable focus and exposure.", input: "Physical light", output: "Private frames" },
  { id: "analysis", label: "Visual analysis", icon: CpuIcon, boundary: "Verifier", detail: "Global similarity, local features, identifiers, view consistency, motion, freshness, replay risk, and visual change are combined transparently.", input: "Private frames", output: "Scores and reasons" },
  { id: "evidence", label: "Evidence store", icon: DatabaseIcon, boundary: "Offchain", detail: "Raw images and feature vectors remain outside Git and outside the blockchain. Storage is private to the local verifier deployment.", input: "Features and media", output: "Evidence hash" },
  { id: "fingerprint", label: "Asset commitment", icon: FingerprintIcon, boundary: "Protocol", detail: "A deterministic bytes32 commitment anchors the registered baseline without revealing the underlying inspection media.", input: "Canonical fingerprint", output: "bytes32" },
  { id: "signature", label: "EIP-712 attestation", icon: SealCheckIcon, boundary: "Verifier key", detail: "Scores cross the onchain boundary as integer basis points. Asset, session, subject, context, timestamps, expiry, and evidence hash are signed.", input: "Verified result", output: "Single-use signature" },
  { id: "registry", label: "X Layer validation", icon: LockKeyIcon, boundary: "Contract", detail: "The registry validates signer authority, freshness, score bounds, asset existence, consumer authorization, and replay protection.", input: "Attestation", output: "Consumed proof" },
  { id: "settlement", label: "Payment outcome", icon: WalletIcon, boundary: "Escrow", detail: "Escrow checks its exact asset, seller subject, context, identity policy, and liveness policy before transferring tokens.", input: "Consumed proof", output: "Release or lock" },
] as const;

export function ProtocolExplorer() {
  const [selected, setSelected] = useState<(typeof nodes)[number]>(nodes[0]);
  const SelectedIcon = selected.icon;
  return (
    <div className="protocol-explorer">
      <div className="protocol-track" role="list" aria-label="Protocol causal chain">
        {nodes.map((node, index) => {
          const Icon = node.icon;
          return <button type="button" role="listitem" key={node.id} className={node.id === selected.id ? "active" : ""} onClick={() => setSelected(node)}><span>{index + 1}</span><Icon size={23} /><strong>{node.label}</strong><small>{node.boundary}</small></button>;
        })}
      </div>
      <article className="protocol-detail">
        <div className="protocol-detail-icon"><SelectedIcon size={36} weight="duotone" /></div>
        <p className="eyebrow">{selected.boundary} boundary</p>
        <h2>{selected.label}</h2>
        <p>{selected.detail}</p>
        <div><KeyValue label="Consumes">{selected.input}</KeyValue><KeyValue label="Produces">{selected.output}</KeyValue></div>
      </article>
      <aside className="protocol-invariants">
        <h3>Non-negotiable protocol invariants</h3>
        <div><span>01</span><p>Raw inspection media remains offchain and outside source control.</p></div>
        <div><span>02</span><p>Successful scores and transaction state originate from real systems.</p></div>
        <div><span>03</span><p>Sessions and attestations expire and are single-use capabilities.</p></div>
        <div><span>04</span><p>Uncertainty and reason codes remain visible to the user.</p></div>
        <InlineNotice title="Security scope">ALIVE provides reasonable replay resistance for an MVP. It does not claim perfect authenticity or bank-grade liveness.</InlineNotice>
      </aside>
    </div>
  );
}
