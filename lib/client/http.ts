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

/** Fetch and validate a backend envelope, returning the raw payload. */
async function fetchEnvelope<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
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
    // FastAPI raises `{ detail: "<CODE>" }`; normalize it to the `error` field.
    const detail = (payload as { detail?: unknown } | null)?.detail;
    const code = payload?.error ?? (typeof detail === "string" ? detail : undefined);
    throw new BackendApiError(code ?? `Request failed: ${response.status}`, response.status, code);
  }
  return payload;
}

/** Fetch a backend envelope, returning only its `data` field. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const payload = await fetchEnvelope<T>(path, init);
  return payload.data as T;
}

/** Fetch a backend envelope and return the full payload (for extra top-level fields). */
export async function requestEnvelope<T>(path: string, init?: RequestInit): Promise<T> {
  const payload = (await fetchEnvelope<unknown>(path, init)) as Record<string, unknown>;
  delete payload.ok;
  delete payload.error;
  return payload as T;
}

/** Fetch a raw (non-envelope) response, e.g. CSV exports. */
export async function requestRaw(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  if (!response.ok) throw new BackendApiError(`Request failed: ${response.status}`, response.status);
  return response;
}
