export type RwaPresentationState = {
  policyId?: string;
  proposalId?: string;
  proposalPolicyId?: string;
  vaultAddress?: `0x${string}`;
};

const STORAGE_KEY = "alive:rwa:presentation:v1";
export const RWA_STATE_EVENT = "alive:rwa-state";

function sanitize(value: unknown): RwaPresentationState {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.policyId === "string"
      ? { policyId: record.policyId }
      : {}),
    ...(typeof record.proposalId === "string"
      ? { proposalId: record.proposalId }
      : {}),
    ...(typeof record.proposalPolicyId === "string"
      ? { proposalPolicyId: record.proposalPolicyId }
      : {}),
    ...(typeof record.vaultAddress === "string" &&
    /^0x[0-9a-fA-F]{40}$/u.test(record.vaultAddress)
      ? { vaultAddress: record.vaultAddress as `0x${string}` }
      : {}),
  };
}

export function readRwaState(): RwaPresentationState {
  if (typeof window === "undefined") return {};
  try {
    return sanitize(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown,
    );
  } catch {
    return {};
  }
}

export function rememberRwaState(
  update: RwaPresentationState,
): RwaPresentationState {
  if (typeof window === "undefined") return sanitize(update);
  const current = readRwaState();
  const merged: RwaPresentationState = { ...current, ...update };
  const policyChanged =
    typeof update.policyId === "string" &&
    update.policyId !== current.policyId;

  if (policyChanged && update.proposalId === undefined) {
    delete merged.proposalId;
    delete merged.proposalPolicyId;
  }

  if (
    typeof update.policyId === "string" &&
    typeof update.proposalId === "string"
  ) {
    merged.proposalPolicyId = update.policyId;
  }

  const next = sanitize(merged);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(RWA_STATE_EVENT, { detail: next }));
  return next;
}

export function clearRwaState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(RWA_STATE_EVENT, { detail: {} }));
}
