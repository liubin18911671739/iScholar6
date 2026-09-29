/**
 * Backend client HTTP helpers (lib/client/http.ts)
 *
 * - Unwraps the backend `{ ok, data }` envelope and throws `BackendApiError`.
 * - Shared by the typed clients in `lib/client/*`.
 *
 * Same-origin fetch carries the Auth.js session cookie; the BFF signs the identity.
 */

export type Envelope<T> = { ok?: boolean; data?: T; error?: string };

/** Error thrown when the backend returns a non-2xx or `{ ok: false }` envelope. */
export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

/** Encode defined query params; arrays repeat the key. */
export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

/** Fetch a backend envelope, throwing `BackendApiError` on failure. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !payload?.ok) {
    throw new BackendApiError(
      payload?.error ?? `Request failed: ${response.status}`,
      response.status,
      payload?.error
    );
  }
  return payload.data as T;
}
