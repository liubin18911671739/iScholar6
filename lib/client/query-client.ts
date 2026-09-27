/**
 * React Query client (lib/client/query-client.ts)
 *
 * Functionality:
 * - Builds a configured `QueryClient` for the BFF data layer.
 * - Exposes a browser singleton so free mutation helpers can invalidate the same cache.
 *
 * Notes:
 * - Browser singleton is intentional: research mutations are free functions called from
 *   event handlers, outside React, and must invalidate the provider's cache.
 */

import { QueryClient } from "@tanstack/react-query";

/** Create a fresh client with data-layer defaults. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** Shared client in the browser; a throwaway client during SSR. */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
