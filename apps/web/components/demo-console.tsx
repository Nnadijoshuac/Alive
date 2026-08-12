"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRightIcon, CameraIcon, CheckCircleIcon, CurrencyCircleDollarIcon, FingerprintIcon, RepeatIcon, ShieldWarningIcon } from "@phosphor-icons/react";
import { clearPresentationState, localAssets, localEscrows, localVerifications } from "@/lib/local-state";
import { AliveLogo } from "./logo";
import { buttonClass, Button, InlineNotice, KeyValue, StatusBadge } from "./ui";

const beats = ["Register", "Escrow", "Attack", "Verify", "Settle"];

export function DemoConsole() {
  const [active, setActive] = useState(0);
  const [, setRevision] = useState(0);
  const assets = localAssets();
  const verifications = localVerifications();
  const escrows = localEscrows();
  const asset = assets[0]?.asset;
  const lastResult = verifications[0]?.result;
  const reset = () => { clearPresentationState(); setRevision((value) => value + 1); setActive(0); };
  const actions = [
    { title: "Register a physical baseline", body: "Capture six real views and wait for the verifier to return the fingerprint commitment.", href: "/assets/register", label: "Open registration", ready: Boolean(asset), icon: CameraIcon },
    { title: "Create verification-gated escrow", body: "Use the registered asset ID, seller wallet, test token, value, expiry, and score requirements.", href: asset ? `/escrow/create?assetId=${asset.assetId}` : "/escrow/create", label: "Open escrow builder", ready: escrows.length > 0, icon: CurrencyCircleDollarIcon },
    { title: "Attempt an adversarial presentation", body: "Try a photo replay, a substituted object, or an expired challenge against the same verifier.", href: "/attack-lab", label: "Open Attack Lab", ready: Boolean(verifications.find((item) => !item.result.verified)), icon: ShieldWarningIcon },
    { title: "Present the genuine object", body: "Complete fresh randomized challenges and inspect returned scores, reasons, and signature.", href: asset ? `/verify/${asset.assetId}` : "/dashboard", label: "Open verification", ready: Boolean(lastResult?.verified), icon: FingerprintIcon },
    { title: "Settle from contract state", body: "Open the funded escrow and consume the context-bound attestation in one atomic settlement.", href: escrows[0] ? `/escrow/${escrows[0].escrowId}` : "/escrow/create", label: "Open settlement flow", ready: false, icon: CheckCircleIcon },
  ];
  const action = actions[active] ?? actions[0]!;
  const Icon = action.icon;

  return (
    <div className="demo-console">
      <header className="demo-header"><AliveLogo /><div><StatusBadge tone="active">PRESENTATION MODE</StatusBadge><Button className="button-ghost" onClick={reset}><RepeatIcon size={16} />Reset local state</Button></div></header>
      <nav className="demo-beats" aria-label="Demo sequence">{beats.map((beat, index) => <button key={beat} type="button" className={index === active ? "active" : ""} onClick={() => setActive(index)}><span>{actions[index]?.ready ? <CheckCircleIcon size={16} weight="fill" /> : index + 1}</span>{beat}</button>)}</nav>
      <main className="demo-stage">
        <section className="demo-copy"><p className="eyebrow">Live demo beat {active + 1}</p><Icon size={38} /><h1>{action.title}</h1><p>{action.body}</p><Link href={action.href} className={`${buttonClass} button-primary`}>{action.label}<ArrowRightIcon size={18} /></Link></section>
        <aside className="demo-evidence">
          <h2>Actual browser state</h2>
          <div><KeyValue label="Assets returned">{assets.length}</KeyValue><KeyValue label="Escrows created">{escrows.length}</KeyValue><KeyValue label="Verifier results">{verifications.length}</KeyValue><KeyValue label="Accepted results">{verifications.filter((item) => item.result.verified).length}</KeyValue><KeyValue label="Rejected results">{verifications.filter((item) => !item.result.verified).length}</KeyValue></div>
          {asset ? <InlineNotice tone="success" title="Physical baseline available">{asset.metadata.name}</InlineNotice> : <InlineNotice tone="warning" title="No baseline yet">Begin with real registration. Presentation mode will not seed a fake asset.</InlineNotice>}
          {lastResult ? <InlineNotice tone={lastResult.verified ? "success" : "warning"} title={lastResult.verified ? "Latest result accepted" : "Latest result rejected"}>Scores and reason codes came from the configured verifier.</InlineNotice> : null}
        </aside>
      </main>
    </div>
  );
}
