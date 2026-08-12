import {
  CertificateIcon,
  CheckCircleIcon,
  ShieldWarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { SignedAttestation, VerificationResult } from "@/lib/types";
import {
  formatDate,
  formatScore,
  humanizeCode,
  truncateHash,
} from "@/lib/format";
import { FingerprintVisualization } from "./fingerprint-visualization";
import { KeyValue, StatusBadge } from "./ui";

export function AttestationCard({
  result,
  signed,
}: {
  result: VerificationResult;
  signed?: SignedAttestation;
}) {
  return (
    <article
      className={`attestation-card ${result.verified ? "attestation-valid" : "attestation-rejected"}`}
    >
      <header>
        <div className="attestation-seal">
          {result.verified ? (
            <CertificateIcon size={26} weight="fill" />
          ) : (
            <ShieldWarningIcon size={26} weight="bold" />
          )}
        </div>
        <div>
          <span>ALIVE verification result</span>
          <h3>
            {result.verified
              ? "Physical state accepted"
              : "Verification rejected"}
          </h3>
        </div>
        <StatusBadge tone={result.verified ? "success" : "warning"}>
          {result.verified ? "VERIFIED" : "NOT VERIFIED"}
        </StatusBadge>
      </header>
      <div className="attestation-body">
        <FingerprintVisualization
          hash={result.evidenceHash}
          compact
          label="Evidence commitment"
        />
        <div className="score-matrix">
          <KeyValue label="Identity">
            {formatScore(result.identityScoreBps)}
          </KeyValue>
          <KeyValue label="Liveness">
            {formatScore(result.livenessScoreBps)}
          </KeyValue>
          <KeyValue label="Visual integrity">
            {formatScore(result.integrityScoreBps)}
          </KeyValue>
          <KeyValue label="Analyzed">{formatDate(result.timestamp)}</KeyValue>
        </div>
      </div>
      {result.reasonCodes.length ? (
        <div className="reason-list" role="alert">
          {result.reasonCodes.map((reason) => (
            <span key={reason}>
              <ShieldWarningIcon size={16} />
              {humanizeCode(reason)}
            </span>
          ))}
        </div>
      ) : (
        <div className="attestation-proof">
          <CheckCircleIcon size={17} weight="fill" />
          No policy failure reason was emitted.
        </div>
      )}
      <footer>
        <KeyValue label="Session">{truncateHash(result.sessionId)}</KeyValue>
        <KeyValue label="Signature">
          {signed ? truncateHash(signed.signature) : "Not issued"}
        </KeyValue>
      </footer>
    </article>
  );
}
