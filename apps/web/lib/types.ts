export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export type AssetCategory =
  | "COMPUTER"
  | "PHONE"
  | "CAMERA"
  | "WATCH"
  | "FOOTWEAR"
  | "CONSOLE"
  | "ELECTRONICS"
  | "MACHINERY"
  | "OTHER";

export type RegistrationView = "FRONT" | "LEFT" | "RIGHT" | "BACK" | "DETAIL" | "IDENTIFIER";

export interface AssetMetadata {
  name: string;
  category: AssetCategory;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  description?: string;
}

export interface AssetRecord {
  assetId: Hex;
  owner: Address;
  metadata: AssetMetadata;
  createdAt: string;
  fingerprintHash: Hex | null;
  registrationViewCount: number;
}

export interface CaptureQuality {
  blurScore: number;
  exposureScore: number;
  brightness: number;
  clippedRatio: number;
  usable: boolean;
  width: number;
  height: number;
}

export interface CaptureFrame {
  view: RegistrationView;
  imageBase64: string;
  mimeType: "image/jpeg";
  capturedAt: string;
  quality: CaptureQuality;
}

export type ChallengeType =
  | "SHOW_FRONT"
  | "SHOW_BACK"
  | "TURN_LEFT"
  | "TURN_RIGHT"
  | "SHOW_IDENTIFIER"
  | "MOVE_CLOSER"
  | "MOVE_AWAY";

export interface VerificationChallenge {
  id: Hex;
  sequence: number;
  type: ChallengeType;
  prompt: string;
  completedAt: string | null;
}

export interface VerificationSession {
  sessionId: Hex;
  assetId: Hex;
  wallet: Address;
  nonce: Hex;
  context: Hex;
  createdAt: string;
  expiresAt: string;
  status: "PENDING" | "ANALYZING" | "ANALYZED" | "ATTESTED" | "EXPIRED";
  challenges: VerificationChallenge[];
}

export interface VerificationSignals {
  embeddingSimilarity: number;
  localFeatureSimilarity: number;
  identifierSimilarity?: number;
  identifierExpected: boolean;
  identifierCriticalMismatch: boolean;
  multiViewConsistency: number;
  challengeCompletion: number;
  motionConsistency: number;
  captureFreshness: number;
  replayRisk: number;
  imageQuality: number;
  visualIntegrity: number;
  neuralSimilarity?: number;
}

export interface VerificationResult {
  assetId: Hex;
  sessionId: Hex;
  identityScore: number;
  livenessScore: number;
  integrityScore: number;
  identityScoreBps: number;
  livenessScoreBps: number;
  integrityScoreBps: number;
  verified: boolean;
  signals: VerificationSignals;
  reasonCodes: string[];
  evidenceHash: Hex;
  timestamp: string;
}

export interface SignedAttestation {
  attestation: {
    assetId: Hex;
    sessionId: Hex;
    subject: Address;
    context: Hex;
    identityScore: number;
    livenessScore: number;
    integrityScore: number;
    verified: boolean;
    evidenceHash: Hex;
    issuedAt: number;
    expiresAt: number;
  };
  signature: Hex;
  digest: Hex;
  signer: Address;
  domain: { chainId: number; verifyingContract: Address };
}

export interface VerificationAnalysis {
  result: VerificationResult;
  signedAttestation?: SignedAttestation;
  attestationError?: string;
}
