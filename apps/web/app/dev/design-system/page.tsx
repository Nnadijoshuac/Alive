import {
  CameraIcon,
  CheckCircleIcon,
  FingerprintIcon,
  ShieldWarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AttestationCard } from "@/components/attestation-card";
import { FingerprintVisualization } from "@/components/fingerprint-visualization";
import { Scanner } from "@/components/scanner";
import { TransactionFlow } from "@/components/transaction-flow";
import {
  Button,
  Field,
  InlineNotice,
  PageIntro,
  Panel,
  StatusBadge,
} from "@/components/ui";
import type { VerificationResult } from "@/lib/types";

const fixtureHash = `0x${"18".repeat(32)}` as const;
const rejectedFixture: VerificationResult = {
  assetId: fixtureHash,
  sessionId: fixtureHash,
  identityScore: 0,
  livenessScore: 0,
  integrityScore: 0,
  identityScoreBps: 0,
  livenessScoreBps: 0,
  integrityScoreBps: 0,
  verified: false,
  signals: {
    embeddingSimilarity: 0,
    localFeatureSimilarity: 0,
    identifierExpected: false,
    identifierCriticalMismatch: false,
    multiViewConsistency: 0,
    challengeCompletion: 0,
    motionConsistency: 0,
    captureFreshness: 0,
    replayRisk: 0,
    imageQuality: 0,
    visualIntegrity: 0,
  },
  reasonCodes: ["SESSION_INVALID"],
  evidenceHash: fixtureHash,
  timestamp: "2026-01-01T00:00:00.000Z",
};

export default function DesignSystemPage() {
  return (
    <div className="page-width">
      <PageIntro
        eyebrow="Development surface"
        title="ALIVE interface primitives."
        description="A visual QA surface for controls, state, scanner language, fingerprints, attestations, and transaction choreography."
      />
      <div className="design-system-grid">
        <Panel className="design-specimen">
          <h2>Actions</h2>
          <div className="specimen-row">
            <Button className="button-primary">Primary action</Button>
            <Button className="button-secondary">Secondary action</Button>
            <Button className="button-ghost">Ghost action</Button>
            <Button className="button-primary" disabled>
              Disabled
            </Button>
          </div>
          <div className="specimen-row">
            <StatusBadge>NEUTRAL</StatusBadge>
            <StatusBadge tone="active">ACTIVE</StatusBadge>
            <StatusBadge tone="success">VERIFIED</StatusBadge>
            <StatusBadge tone="warning">REJECTED</StatusBadge>
          </div>
        </Panel>
        <Panel className="design-specimen">
          <h2>Inputs</h2>
          <div className="form-grid">
            <Field label="Asset name" hint="Required">
              <input className="input" placeholder="Physical asset name" />
            </Field>
            <Field label="Category">
              <select className="select">
                <option>COMPUTER</option>
                <option>CAMERA</option>
              </select>
            </Field>
          </div>
        </Panel>
        <Panel className="design-specimen">
          <h2>Notices</h2>
          <div className="notice-stack">
            <InlineNotice title="Informational state">
              Raw media remains offchain.
            </InlineNotice>
            <InlineNotice tone="success" title="Accepted state">
              <CheckCircleIcon size={14} /> Evidence commitment ready.
            </InlineNotice>
            <InlineNotice tone="warning" title="Failure state">
              <ShieldWarningIcon size={14} /> Reason code remains visible.
            </InlineNotice>
          </div>
        </Panel>
        <div className="design-span">
          <Scanner active label="Scanner visual">
            <div className="scanner-fixture">
              <CameraIcon size={50} />
            </div>
          </Scanner>
        </div>
        <FingerprintVisualization
          hash={fixtureHash}
          label="Deterministic fingerprint fixture"
        />
        <Panel className="design-specimen">
          <h2>Transaction flow</h2>
          <TransactionFlow
            steps={[
              {
                label: "Capture",
                detail: "Confirmed observation",
                state: "confirmed",
              },
              {
                label: "Analyze",
                detail: "Verifier pending",
                state: "pending",
              },
              {
                label: "Attest",
                detail: "Locked until result",
                state: "blocked",
              },
              { label: "Settle", detail: "No claim made", state: "idle" },
            ]}
          />
        </Panel>
        <div className="design-span">
          <div className="fixture-label">
            <FingerprintIcon size={17} />
            Rejected-state fixture with non-protocol sample values
          </div>
          <AttestationCard result={rejectedFixture} />
        </div>
      </div>
    </div>
  );
}
