const STORAGE_KEY = "alive.watchlist.v1";

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event("alive:watchlist-changed"));
  } catch {
    // Storage may be unavailable; watchlist is a browser-local convenience.
  }
}

export function getWatchlist(): string[] {
  return readIds();
}

export function isWatched(assetId: string): boolean {
  return readIds().includes(assetId);
}

export function toggleWatch(assetId: string): boolean {
  const current = readIds();
  const next = current.includes(assetId)
    ? current.filter((id) => id !== assetId)
    : [...current, assetId];
  writeIds(next);
  return next.includes(assetId);
}
