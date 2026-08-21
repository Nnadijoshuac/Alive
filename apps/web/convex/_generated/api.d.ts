/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_external from "../actions/external.js";
import type * as agent from "../agent.js";
import type * as assets from "../assets.js";
import type * as crons from "../crons.js";
import type * as lib_canonicalCatalog from "../lib/canonicalCatalog.js";
import type * as lib_normalize from "../lib/normalize.js";
import type * as scheduler from "../scheduler.js";
import type * as seed from "../seed.js";
import type * as strategies from "../strategies.js";
import type * as trades from "../trades.js";
import type * as wallet from "../wallet.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/external": typeof actions_external;
  agent: typeof agent;
  assets: typeof assets;
  crons: typeof crons;
  "lib/canonicalCatalog": typeof lib_canonicalCatalog;
  "lib/normalize": typeof lib_normalize;
  scheduler: typeof scheduler;
  seed: typeof seed;
  strategies: typeof strategies;
  trades: typeof trades;
  wallet: typeof wallet;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
