const STORAGE_KEY = "alive.activity.v1";
const MAX_ENTRIES = 50;

export type ActivityEntry = {
  assetId: string;
  symbol: string;
  action: string;
  result: string;
  timestamp: string;
};

/**
 * A browser-local record of verification runs performed in this browser --
 * not a backend event log. Explicitly local: ALIVE has no server-side
 * activity feed today, and this must never be presented as one.
 */
export function recordActivity(entry: Omit<ActivityEntry, "timestamp">): void {
  if (typeof window === "undefined") return;
  try {
    const existing = listActivity();
    const next = [{ ...entry, timestamp: new Date().toISOString() }, ...existing].slice(
      0,
      MAX_ENTRIES,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private browsing, quota); activity
    // logging is a convenience, never load-bearing.
  }
}

export function listActivity(): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ActivityEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as ActivityEntry).assetId === "string" &&
        typeof (entry as ActivityEntry).timestamp === "string",
    );
  } catch {
    return [];
  }
}
