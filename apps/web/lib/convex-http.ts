/**
 * Native, zero-dependency Convex HTTP Client for Edge & Serverless runtimes.
 *
 * Direct REST communication with Convex without bundling Node.js `ws` or `node:https`.
 * Fully compatible with Cloudflare Workers, Next.js Edge, browser, and standard Node.js.
 */

const CONVEX_URL =
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  process.env.CONVEX_URL ||
  "https://careful-chihuahua-483.convex.cloud";

export interface ConvexQueryResponse<T> {
  status: "success" | "error";
  value?: T;
  errorMessage?: string;
}

/**
 * Execute a query against the Convex HTTP API using native fetch.
 */
export async function convexQuery<T = unknown>(
  functionPath: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!CONVEX_URL) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured.");
  }

  const endpoint = `${CONVEX_URL.replace(/\/$/, "")}/api/query`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: functionPath,
      args,
      format: "json",
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`Convex query failed (${res.status}): ${errorText}`);
  }

  const json = (await res.json().catch(() => null)) as ConvexQueryResponse<T> | null;
  if (!json) {
    throw new Error("Invalid response from Convex");
  }
  if (json.status === "error") {
    throw new Error(`Convex query error: ${json.errorMessage || "Unknown error"}`);
  }

  return (json.value !== undefined ? json.value : (json as unknown as T)) as T;
}

/**
 * Execute a mutation against the Convex HTTP API using native fetch.
 */
export async function convexMutation<T = unknown>(
  functionPath: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!CONVEX_URL) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured.");
  }

  const endpoint = `${CONVEX_URL.replace(/\/$/, "")}/api/mutation`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: functionPath,
      args,
      format: "json",
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`Convex mutation failed (${res.status}): ${errorText}`);
  }

  const json = (await res.json().catch(() => null)) as ConvexQueryResponse<T> | null;
  if (!json) {
    throw new Error("Invalid response from Convex");
  }
  if (json.status === "error") {
    throw new Error(`Convex mutation error: ${json.errorMessage || "Unknown error"}`);
  }

  return (json.value !== undefined ? json.value : (json as unknown as T)) as T;
}
