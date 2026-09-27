/**
 * QueryProvider (components/providers/query-provider.tsx)
 *
 * Functionality:
 * - Mounts the TanStack React Query provider for the BFF data layer.
 * - Reuses the shared browser client so free mutation helpers invalidate live queries.
 *
 * Notes:
 * - Always mounted; harmless when `NEXT_PUBLIC_DATA_BACKEND=legacy` (no queries run).
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/client/query-client";

/** Provides the TanStack Query client to the application tree. */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => getQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
