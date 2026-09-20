/**
 * Remote Query Helpers (lib/supabase/remote-query.ts)
 *
 * Functionality:
 * - Normalizes Supabase list payloads into safe arrays (`asRowArray`, `asRowArrayOrEmpty`).
 * - Provides CRUD helpers (`remoteInsert` / `remoteUpsert` / `remoteUpdate` / `remoteDelete`).
 * - Hooks a React list query (`useRemoteRows`) with loading/error state and refetch.
 *
 * Notes:
 * - Client-only ("use client"); relies on `getCollaborativeClient` and field-map translation.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { getCollaborativeClient } from "./collaborative";
import { fromRemoteRecord, toRemoteRecord } from "./field-map";

export { toRemoteRecord } from "./field-map";

/** Result of a collaborative remote list query. `data === undefined` means still loading. */
export type RemoteListQuery<T> = {
  data: T[] | undefined;
  error: string | null;
  refetch: () => void;
};

/** Query handle preloaded with no data (still-loading placeholder). */
export function emptyRemoteListQuery<T>(): RemoteListQuery<T> {
  return { data: undefined, error: null, refetch: () => {} };
}

/** Wrap already-loaded local rows as a resolved remote-style query handle. */
export function localListQuery<T>(data: T[] | undefined): RemoteListQuery<T> {
  return { data: asRowArray(data), error: null, refetch: () => {} };
}

/**
 * Normalize list payloads so callers can safely use `.filter` / `.map` / `.length`.
 * - `undefined`/`null` → `undefined` (still loading / unknown)
 * - array → as-is
 * - `{ data: T[] }` nested payload → inner array
 * - single row object with `id` → `[row]`
 * - query-shaped / unknown objects → `[]` (never a bare object)
 */
export function asRowArray<T>(value: unknown): T[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Nested list: `{ data: [...] }` (mistaken assignment of a query result)
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (obj.data !== undefined && obj.data !== null && typeof obj.data === "object") {
      return asRowArray<T>(obj.data);
    }
    // Single entity row (has id) — wrap for list consumers
    if ("id" in obj && !("refetch" in obj) && !("error" in obj && "data" in obj)) {
      return [value as T];
    }
    // Anything else (query handle, plain map, etc.) → empty list, not a crashy object
    return [];
  }
  return [];
}

/** Like asRowArray but never undefined (defaults to empty list). */
export function asRowArrayOrEmpty<T>(value: unknown): T[] {
  return asRowArray<T>(value) ?? [];
}

/** Insert one row into a remote table (collaborative auth required). */
export async function remoteInsert(table: string, row: Record<string, unknown>) {
  const client = getCollaborativeClient();
  if (!client) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
  const { error } = await client.from(table).insert(toRemoteRecord(row));
  if (error) throw error;
}

/** Upsert one row into a remote table (collaborative auth required). */
export async function remoteUpsert(table: string, row: Record<string, unknown>) {
  const client = getCollaborativeClient();
  if (!client) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
  const { error } = await client.from(table).upsert(toRemoteRecord(row));
  if (error) throw error;
}

/** Update one remote row by id (collaborative auth required). */
export async function remoteUpdate(table: string, id: string, row: Record<string, unknown>) {
  const client = getCollaborativeClient();
  if (!client) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
  const { error } = await client.from(table).update(toRemoteRecord(row)).eq("id", id);
  if (error) throw error;
}

/** Delete one remote row by id (collaborative auth required). */
export async function remoteDelete(table: string, id: string) {
  const client = getCollaborativeClient();
  if (!client) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
  const { error } = await client.from(table).delete().eq("id", id);
  if (error) throw error;
}

// Build a localized, table-specific error message for failed remote queries.
function formatRemoteError(table: string, message?: string) {
  const detail = message?.trim() ? `（${message.trim()}）` : "";
  return `无法从 Supabase 加载「${table}」数据${detail}。请检查登录状态、权限或网络连接后重试。`;
}

/**
 * Collaborative-mode list query. On failure, sets `error` and leaves `data`
 * undefined — never silently falls back to an empty list.
 */
export function useRemoteRows<T>(table: string, column?: string, value?: string): RemoteListQuery<T> {
  const [data, setData] = useState<T[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    setError(null);

    const client = getCollaborativeClient();
    if (!client) {
      setError(formatRemoteError(table, "未登录或客户端未配置"));
      return;
    }

    const query = column && value !== undefined
      ? client.from(table).select("*").eq(column, value)
      : client.from(table).select("*");

    void Promise.resolve(query).then(({ data: rows, error: queryError }) => {
      if (cancelled) return;
      if (queryError) {
        console.error(`Supabase query ${table} failed`, queryError);
        setData(undefined);
        setError(formatRemoteError(table, queryError.message));
        return;
      }
      setError(null);
      const list = asRowArrayOrEmpty<Record<string, unknown>>(rows);
      setData(list.map((row) => fromRemoteRecord(row)) as T[]);
    }).catch((err: unknown) => {
      if (cancelled) return;
      console.error(`Supabase query ${table} failed`, err);
      setData(undefined);
      setError(formatRemoteError(table, err instanceof Error ? err.message : undefined));
    });

    return () => { cancelled = true; };
  }, [table, column, value, reloadToken]);

  // Always expose array|undefined — never a bare object — so list hooks stay safe.
  return { data: asRowArray<T>(data), error, refetch };
}
