/**
 * LTI Advantage Assignment and Grade Services (AGS) helpers.
 * Server-side only — never import from client components.
 *
 * Functionality:
 * - Builds OAuth2 client-assertion JWTs (HS256 secret or RS256 private key).
 * - Fetches LTI access tokens via client_credentials at the platform token endpoint.
 * - POSTs individual AGS scores and pushes a whole gradebook to a line item.
 * - Masks secrets and fingerprints credential triples for safe display/storage.
 *
 * Notes:
 * - Requires Node crypto; keep all imports server-side.
 * - Ignores learners with a null score during push.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { createHash, createHmac, createPrivateKey, createSign, randomUUID } from "crypto";
import type { GradebookLearner } from "@/lib/lms/gradebook";
import { toAgsScoreLines } from "@/lib/lms/gradebook";

/** OAuth2 client authentication methods supported for token requests. */
export type LtiAuthMethod = "client_secret_post" | "client_secret_basic" | "private_key_jwt";

/** Stored credentials/config for one LMS link. */
export type LmsLinkCredentials = {
  platform: string;
  clientId: string;
  clientSecret?: string | null;
  tokenUrl: string;
  agsLineitemUrl: string;
  authMethod?: LtiAuthMethod;
  privateKeyPem?: string | null;
  issuer?: string | null;
};

/** Outcome summary of an AGS gradebook push. */
export type AgsPushResult = {
  ok: boolean;
  pushed: number;
  failed: number;
  errors: Array<{ userId: string; error: string }>;
  accessTokenObtained: boolean;
};

// Encode a buffer/string as base64url without padding.
function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** Build OAuth2 client_assertion JWT (HS256 with client_secret or RS256 with private key). */
export function buildClientAssertion(params: {
  clientId: string;
  tokenUrl: string;
  clientSecret?: string | null;
  privateKeyPem?: string | null;
  authMethod?: LtiAuthMethod;
  now?: number;
  expiresInSec?: number;
}): string {
  const now = Math.floor((params.now ?? Date.now()) / 1000);
  const exp = now + (params.expiresInSec ?? 300);
  const header = {
    alg: params.privateKeyPem ? "RS256" : "HS256",
    typ: "JWT",
  };
  const payload = {
    iss: params.clientId,
    sub: params.clientId,
    aud: params.tokenUrl,
    iat: now,
    exp,
    jti: randomUUID(),
  };
  const encoded = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  if (params.privateKeyPem) {
    const key = createPrivateKey(params.privateKeyPem);
    const signer = createSign("RSA-SHA256");
    signer.update(encoded);
    signer.end();
    const sig = signer.sign(key);
    return `${encoded}.${base64url(sig)}`;
  }

  const secret = params.clientSecret ?? "";
  if (!secret) throw new Error("CLIENT_SECRET_REQUIRED");
  const sig = createHmac("sha256", secret).update(encoded).digest();
  return `${encoded}.${base64url(sig)}`;
}

/** Obtain an OAuth2 access token from the platform using the configured auth method. */
export async function fetchLtiAccessToken(
  creds: LmsLinkCredentials,
  scopes: string[] = [
    "https://purl.imsglobal.org/spec/lti-ags/scope/score",
    "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
  ],
  fetchImpl: typeof fetch = fetch
): Promise<{ accessToken: string; expiresIn?: number }> {
  const method = creds.authMethod ?? "client_secret_post";
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("scope", scopes.join(" "));

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (method === "private_key_jwt" || method === "client_secret_post") {
    if (method === "private_key_jwt" || creds.privateKeyPem) {
      const assertion = buildClientAssertion({
        clientId: creds.clientId,
        tokenUrl: creds.tokenUrl,
        clientSecret: creds.clientSecret,
        privateKeyPem: creds.privateKeyPem,
        authMethod: method,
      });
      body.set(
        "client_assertion_type",
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
      );
      body.set("client_assertion", assertion);
    } else {
      body.set("client_id", creds.clientId);
      body.set("client_secret", creds.clientSecret ?? "");
    }
  } else if (method === "client_secret_basic") {
    const basic = Buffer.from(
      `${creds.clientId}:${creds.clientSecret ?? ""}`,
      "utf8"
    ).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }

  const res = await fetchImpl(creds.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TOKEN_FAILED:${res.status}:${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) throw new Error("TOKEN_MISSING");
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}

/**
 * POST a single score to an AGS lineitem .../scores endpoint.
 * lineitem URL should be the line item resource; we append /scores if needed.
 */
export function scoresEndpoint(lineitemUrl: string): string {
  const base = lineitemUrl.replace(/\/$/, "");
  return base.endsWith("/scores") ? base : `${base}/scores`;
}

// POST a single AGS score to a line-item scores endpoint.
export async function postAgsScore(params: {
  scoresUrl: string;
  accessToken: string;
  userId: string;
  scoreGiven: number | null;
  scoreMaximum?: number;
  activityProgress?: string;
  gradingProgress?: string;
  comment?: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const body = {
    userId: params.userId,
    scoreGiven: params.scoreGiven,
    scoreMaximum: params.scoreMaximum ?? 100,
    activityProgress: params.activityProgress ?? "Completed",
    gradingProgress: params.gradingProgress ?? "FullyGraded",
    timestamp: new Date().toISOString(),
    comment: params.comment,
  };
  const res = await fetchImpl(params.scoresUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/vnd.ims.lis.v1.score+json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`SCORE_FAILED:${res.status}:${text.slice(0, 200)}`);
  }
}

/** Push overall grades for a camp to the configured AGS line item. */
export async function pushGradebookToAgs(params: {
  credentials: LmsLinkCredentials;
  learners: GradebookLearner[];
  /** Map iScholar user id → LMS platform user id when different. */
  userIdMap?: Record<string, string>;
  fetchImpl?: typeof fetch;
  /** Dry run: obtain token only, do not POST scores. */
  dryRun?: boolean;
}): Promise<AgsPushResult> {
  const result: AgsPushResult = {
    ok: true,
    pushed: 0,
    failed: 0,
    errors: [],
    accessTokenObtained: false,
  };

  let accessToken: string;
  try {
    const token = await fetchLtiAccessToken(
      params.credentials,
      undefined,
      params.fetchImpl
    );
    accessToken = token.accessToken;
    result.accessTokenObtained = true;
  } catch (e) {
    result.ok = false;
    result.errors.push({
      userId: "*",
      error: e instanceof Error ? e.message : String(e),
    });
    return result;
  }

  if (params.dryRun) {
    return result;
  }

  const scoresUrl = scoresEndpoint(params.credentials.agsLineitemUrl);
  const lines = toAgsScoreLines(params.learners);
  for (const line of lines) {
    if (line.scoreGiven == null) continue;
    const platformUserId = params.userIdMap?.[line.userId] ?? line.userId;
    try {
      await postAgsScore({
        scoresUrl,
        accessToken,
        userId: platformUserId,
        scoreGiven: line.scoreGiven,
        scoreMaximum: line.scoreMaximum,
        activityProgress: line.activityProgress,
        gradingProgress: line.gradingProgress,
        comment: line.comment,
        fetchImpl: params.fetchImpl,
      });
      result.pushed += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push({
        userId: platformUserId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  result.ok = result.failed === 0;
  return result;
}

/** Mask secrets for API responses. */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}…${value.slice(-2)}`;
}

/** Fingerprint the client id/token URL/line-item triple for dedupe or change detection. */
export function contentHashCredentials(creds: {
  clientId?: string | null;
  tokenUrl?: string | null;
  agsLineitemUrl?: string | null;
}): string {
  const raw = `${creds.clientId ?? ""}|${creds.tokenUrl ?? ""}|${creds.agsLineitemUrl ?? ""}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}
