"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  CameraRotateIcon,
  CheckCircleIcon,
  ClockCountdownIcon,
  FingerprintIcon,
  ScanIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { usePublicClient, useWriteContract } from "wagmi";
import { analyzeVerification, createVerificationSession, uploadVerificationCapture } from "@/lib/api";
import { validateAttestationBinding } from "@/lib/attestation-binding";
import { activeChain, contractAddresses, contractsConfigured, explorerTransactionUrl } from "@/lib/chain";
import { attestationRegistryAbi, escrowAbi } from "@/lib/contracts";
import { humanizeCode, truncateHash } from "@/lib/format";
import { localSubjectAddress, rememberVerification } from "@/lib/local-state";
import type { Address, Hex, VerificationAnalysis, VerificationSession } from "@/lib/types";
import { AttestationCard } from "./attestation-card";
import { CameraCapture, type CameraFrame } from "./camera-capture";
import { Button, InlineNotice, KeyValue, StatusBadge } from "./ui";
import { TransactionFlow, type TransactionStep } from "./transaction-flow";
import { useWalletSnapshot, WalletButton } from "./wallet-shell";

type WorkflowState = "intro" | "capturing" | "ready" | "analyzing" | "result";

export function VerificationWorkflow({
  assetId,
  context,
  escrowId,
  intentLabel,
  expectedSubject,
  onSettled,
}: {
  assetId: string;
  context?: Hex;
  escrowId?: Hex;
  intentLabel?: string;
  expectedSubject?: Address;
  onSettled?: () => void | Promise<void>;
}) {
  const wallet = useWalletSnapshot();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<WorkflowState>("intro");
  const [session, setSession] = useState<VerificationSession | null>(null);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [analysis, setAnalysis] = useState<VerificationAnalysis | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motionSamples, setMotionSamples] = useState<number[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submittedSettlementHash, setSubmittedSettlementHash] = useState<Hex | null>(null);
  const [settlementHash, setSettlementHash] = useState<Hex | null>(null);
  const [settling, setSettling] = useState(false);
  const currentChallenge = session?.challenges[challengeIndex];

  useEffect(() => {
    if (!session) return;
    const update = () => setSecondsLeft(Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [session]);

  const begin = async () => {
    const subject = wallet.address ?? (localMode && !expectedSubject ? localSubjectAddress() : undefined);
    if (!subject) { setError(expectedSubject ? "Connect the recorded seller wallet to verify this escrow." : "Connect a wallet or choose local verification mode."); return; }
    if (expectedSubject && subject.toLowerCase() !== expectedSubject.toLowerCase()) { setError("The connected wallet is not the seller recorded by this escrow."); return; }
    if (!/^0x[0-9a-fA-F]{64}$/.test(assetId)) { setError("The asset ID must be a 32-byte hexadecimal identifier."); return; }
    setWorking(true);
    setError(null);
    try {
      const created = await createVerificationSession(assetId as Hex, subject, context);
      setSession(created);
      setChallengeIndex(0);
      setMotionSamples([]);
      setState("capturing");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification session could not be created.");
    } finally {
      setWorking(false);
    }
  };

  const submitChallenge = async (frame: CameraFrame) => {
    if (!session || !currentChallenge) return;
    setWorking(true);
    setError(null);
    try {
      await uploadVerificationCapture(session.sessionId, currentChallenge.id, frame.imageBase64, frame.capturedAt);
      setMotionSamples((items) => [...items, frame.motionSample]);
      if (challengeIndex >= session.challenges.length - 1) setState("ready");
      else setChallengeIndex((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Challenge evidence was not accepted.");
      throw caught;
    } finally {
      setWorking(false);
    }
  };

  const analyze = async () => {
    if (!session) return;
    setWorking(true);
    setState("analyzing");
    setError(null);
    try {
      let returned = await analyzeVerification(session.sessionId);
      if (returned.signedAttestation) {
        const expectedVerifier = contractAddresses.attestationRegistry && publicClient
          ? await publicClient.readContract({
              address: contractAddresses.attestationRegistry,
              abi: attestationRegistryAbi,
              functionName: "authorizedVerifier",
            })
          : undefined;
        const bindingError = await validateAttestationBinding(
          session,
          returned.result,
          returned.signedAttestation,
          activeChain.id,
          contractAddresses.attestationRegistry,
          expectedVerifier,
        );
        if (bindingError) returned = { result: returned.result, attestationError: bindingError };
      }
      setAnalysis(returned);
      rememberVerification(returned.signedAttestation ? { result: returned.result, signedAttestation: returned.signedAttestation } : { result: returned.result });
      setState("result");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verifier analysis failed.");
      setState("ready");
    } finally {
      setWorking(false);
    }
  };

  const settle = async () => {
    if (!analysis?.signedAttestation || !escrowId || !contractAddresses.escrow) return;
    setSettling(true);
    setError(null);
    try {
      const signed = analysis.signedAttestation;
      const contractAttestation = {
        ...signed.attestation,
        issuedAt: BigInt(signed.attestation.issuedAt),
        expiresAt: BigInt(signed.attestation.expiresAt),
      };
      const hash = await writeContractAsync({
        address: contractAddresses.escrow,
        abi: escrowAbi,
        functionName: "settleWithAttestation",
        chainId: activeChain.id,
        args: [escrowId, contractAttestation, signed.signature],
      });
      setSubmittedSettlementHash(hash);
      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      if (!receipt || receipt.status !== "success") throw new Error("Settlement transaction did not confirm successfully.");
      setSettlementHash(hash);
      await onSettled?.();
    } catch (caught) {
      setError(caught instanceof Error && caught.message.toLowerCase().includes("rejected") ? "The wallet rejected settlement." : caught instanceof Error ? caught.message : "Settlement failed.");
    } finally {
      setSettling(false);
    }
  };

  const transactionSteps = useMemo<TransactionStep[]>(() => [
    { label: "Session", detail: session ? truncateHash(session.sessionId) : "Fresh capability not created", state: session ? "confirmed" : state === "intro" ? "idle" : "pending" },
    { label: "Live observations", detail: session ? `${Math.min(challengeIndex + (state === "ready" || state === "analyzing" || state === "result" ? 1 : 0), session.challenges.length)} of ${session.challenges.length} challenges` : "Waiting for randomized instructions", state: state === "capturing" ? "pending" : state === "ready" || state === "analyzing" || state === "result" ? "confirmed" : "idle" },
    { label: "Visual analysis", detail: analysis ? `${analysis.result.reasonCodes.length} policy reason codes` : "Scores must come from the verifier", state: state === "analyzing" ? "pending" : analysis ? "confirmed" : "idle" },
    { label: "Signed attestation", detail: analysis?.signedAttestation ? truncateHash(analysis.signedAttestation.digest) : analysis ? "No signed attestation returned" : "Not issued", state: analysis?.signedAttestation ? "confirmed" : analysis ? "blocked" : "idle" },
    { label: "Settlement", detail: settlementHash ? `${truncateHash(settlementHash)} confirmed` : submittedSettlementHash ? `${truncateHash(submittedSettlementHash)} submitted` : escrowId ? "Ready only after an accepted attestation" : "No escrow context attached", state: settling ? "pending" : settlementHash ? "confirmed" : submittedSettlementHash && error ? "blocked" : escrowId ? "idle" : "blocked" },
  ], [analysis, challengeIndex, error, escrowId, session, settlementHash, settling, state, submittedSettlementHash]);

  return (
    <div className="verification-layout">
      <aside className="verification-rail">
        <TransactionFlow steps={transactionSteps} />
        {session ? <div className="session-metadata"><KeyValue label="Expires in">{secondsLeft}s</KeyValue><KeyValue label="Nonce">{truncateHash(session.nonce)}</KeyValue>{intentLabel ? <KeyValue label="Test intent">{intentLabel}</KeyValue> : null}</div> : null}
      </aside>

      <section className="verification-main">
        {state === "intro" ? (
          <div className="verification-intro">
            <ScanIcon size={38} />
            <h2>Start a fresh physical challenge.</h2>
            <p>The verifier chooses an unpredictable sequence after session creation. Sessions expire and can be used only once.</p>
            <div className="verification-prereqs"><article><ClockCountdownIcon size={22} /><strong>Time bound</strong><span>Complete every observation before expiry.</span></article><article><CameraRotateIcon size={22} /><strong>Active views</strong><span>Respond with live camera frames in order.</span></article><article><FingerprintIcon size={22} /><strong>Multi-signal</strong><span>Identity is not decided by one classifier.</span></article></div>
            <div className="verification-connect">{wallet.connected ? <InlineNotice tone={expectedSubject && wallet.address?.toLowerCase() !== expectedSubject.toLowerCase() ? "warning" : "success"} title={expectedSubject && wallet.address?.toLowerCase() !== expectedSubject.toLowerCase() ? "Seller wallet required" : "Wallet subject ready"}>{wallet.address ? truncateHash(wallet.address) : "Connected"}</InlineNotice> : <><WalletButton />{!expectedSubject ? <Button className={localMode ? "button-primary" : "button-secondary"} onClick={() => setLocalMode(true)}>Use local mode</Button> : null}</>}</div>
            {localMode && !wallet.connected && !expectedSubject ? <InlineNotice title="Local verification">The verifier remains real. No wallet ownership or onchain settlement is claimed.</InlineNotice> : null}
            {error ? <InlineNotice tone="warning" title="Session not started">{error}</InlineNotice> : null}
            <Button className="button-primary verify-primary" disabled={working || (!wallet.connected && (!localMode || Boolean(expectedSubject)))} onClick={() => void begin()}>{working ? "Creating session" : "Generate challenges"}<ArrowRightIcon size={18} /></Button>
          </div>
        ) : null}

        {state === "capturing" && session && currentChallenge ? (
          <div className="challenge-stage">
            <header><div><p className="eyebrow">Live challenge {challengeIndex + 1} of {session.challenges.length}</p><h2>{currentChallenge.prompt}</h2><p>Move continuously into the requested view, then capture the short frame sequence.</p></div><StatusBadge tone={secondsLeft < 30 ? "warning" : "active"}>{secondsLeft}s remaining</StatusBadge></header>
            <div className="challenge-sequence">{session.challenges.map((challenge, index) => <span key={challenge.id} className={index === challengeIndex ? "current" : index < challengeIndex ? "complete" : ""}>{index < challengeIndex ? <CheckCircleIcon size={15} weight="fill" /> : index + 1}<b>{humanizeCode(challenge.type)}</b></span>)}</div>
            <CameraCapture key={currentChallenge.id} label={humanizeCode(currentChallenge.type)} instruction={currentChallenge.prompt} burst onCapture={submitChallenge} />
            {working ? <InlineNotice tone="loading" title="Submitting observation">The next instruction unlocks only after the verifier accepts this challenge.</InlineNotice> : null}
            {error ? <InlineNotice tone="warning" title="Challenge not accepted">{error}</InlineNotice> : null}
          </div>
        ) : null}

        {state === "ready" && session ? (
          <div className="analysis-ready">
            <CheckCircleIcon size={44} weight="fill" />
            <h2>Challenge sequence complete.</h2>
            <p>{session.challenges.length} live observations were submitted in the server-provided order. The server must now compute all scores and reason codes.</p>
            <div className="motion-observations"><KeyValue label="Local motion samples">{motionSamples.length}</KeyValue><KeyValue label="Mean local motion">{motionSamples.length ? `${Math.round((motionSamples.reduce((sum, value) => sum + value, 0) / motionSamples.length) * 100)} / 100` : "Not measured"}</KeyValue><KeyValue label="Server state">Ready to analyze</KeyValue></div>
            {error ? <InlineNotice tone="warning" title="Analysis not completed">{error}</InlineNotice> : null}
            <Button className="button-primary verify-primary" onClick={() => void analyze()}><FingerprintIcon size={18} />Analyze physical state</Button>
          </div>
        ) : null}

        {state === "analyzing" ? (
          <div className="verification-processing" role="status">
            <div className="processing-rings"><FingerprintIcon size={44} /></div>
            <h2>Comparing physical evidence.</h2>
            <p>Identity, liveness, visual change, identifiers, motion, freshness, and replay risk are being evaluated.</p>
            <div className="analysis-signals"><span>Global embedding</span><span>Local features</span><span>View consistency</span><span>Replay risk</span></div>
          </div>
        ) : null}

        {state === "result" && analysis ? (
          <div className="verification-result">
            <AttestationCard result={analysis.result} {...(analysis.signedAttestation ? { signed: analysis.signedAttestation } : {})} />
            {!analysis.result.verified ? <InlineNotice tone="warning" title="Policy rejected this observation">Reason codes are shown above. No settlement transaction is available.</InlineNotice> : !analysis.signedAttestation ? <InlineNotice tone="warning" title="No signed attestation">{analysis.attestationError ?? "The result was accepted, but the verifier did not return a consumable signature."}</InlineNotice> : escrowId && contractsConfigured ? <Button className="button-primary settlement-button" disabled={settling || Boolean(settlementHash)} onClick={() => void settle()}><ShieldCheckIcon size={18} />{settling ? submittedSettlementHash ? "Awaiting confirmation" : "Submitting settlement" : settlementHash ? "Payment released" : submittedSettlementHash && error ? "Retry settlement" : "Settle escrow"}</Button> : <InlineNotice tone="success" title="Signed proof ready">This attestation is not bound to a configured escrow, so no payment transaction will be claimed.</InlineNotice>}
            {submittedSettlementHash && explorerTransactionUrl(submittedSettlementHash) ? <a className="text-link" href={explorerTransactionUrl(submittedSettlementHash)} target="_blank" rel="noreferrer">View submitted settlement transaction</a> : null}
            {error ? <InlineNotice tone="warning" title="Settlement not completed">{error}</InlineNotice> : null}
            <Button className="button-secondary" onClick={() => { setState("intro"); setSession(null); setAnalysis(null); setSubmittedSettlementHash(null); setSettlementHash(null); setError(null); }}>Start a new session</Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
