/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as awareness from "../awareness.js";
import type * as campaigns from "../campaigns.js";
import type * as gantt from "../gantt.js";
import type * as inflow from "../inflow.js";
import type * as insights from "../insights.js";
import type * as interest from "../interest.js";
import type * as phases from "../phases.js";
import type * as sales from "../sales.js";
import type * as shareLinks from "../shareLinks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  awareness: typeof awareness;
  campaigns: typeof campaigns;
  gantt: typeof gantt;
  inflow: typeof inflow;
  insights: typeof insights;
  interest: typeof interest;
  phases: typeof phases;
  sales: typeof sales;
  shareLinks: typeof shareLinks;
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
