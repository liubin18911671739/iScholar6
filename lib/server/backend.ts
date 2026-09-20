/** Server-side BFF helpers for the Python platform API. */

import { createHmac } from "crypto";
import { auth } from "@/lib/auth";

const SIGNATURE_WINDOW_SECONDS = 300;

/** Returns signed backend identity headers for the current Auth.js user. */
export async function backendIdentityHeaders(): Promise<Record<string, string> | null> {
  const session = await auth();
  const userId = session?.user?.id;
  const secret = process.env.AGENT_SERVICE_TOKEN;
  if (!userId || !secret) return null;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${userId}:${timestamp}`).digest("hex");
  return {
    "X-IScholar-User": userId,
    "X-IScholar-Timestamp": timestamp,
    "X-IScholar-Signature": signature,
  };
}

/** Resolves the private service URL; browser code must never see this value. */
export function backendUrl(path: string): string {
  const base = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
