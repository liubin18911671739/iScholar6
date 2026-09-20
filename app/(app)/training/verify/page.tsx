/**
 * Training Certificate Verification (/training/verify)
 *
 * Functionality:
 * - Lets a user submit a certificate SHA-256 hash and validates it server-side.
 * - Calls the /api/training/certificates/verify endpoint with the trimmed hash.
 * - Renders decoded certificate details when valid, or an error/invalid message otherwise.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Route entry that verifies a training certificate by its SHA-256 content hash. */
export default function CertificateVerifyPage() {
  const t = useTranslations("training.certificate");
  const [hash, setHash] = useState("");
  const [result, setResult] = useState<{
    valid: boolean;
    data?: {
      programName?: string;
      displayName?: string | null;
      completedAt?: string;
      issuer?: string;
      taskCount?: number;
      contentHash?: string;
    } | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Verify the entered hash against the certificate verification API.
  async function verify() {
    // Clear previous results and surface a busy state while verifying.
    setBusy(true);
    setError("");
    setResult(null);
    try {
      // Call the verification endpoint with the URL-encoded, trimmed hash.
      const res = await fetch(
        `/api/training/certificates/verify?hash=${encodeURIComponent(hash.trim())}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(String(json.error ?? t("verifyFailed")));
        return;
      }
      setResult({ valid: Boolean(json.valid), data: json.data });
    } catch {
      // Report a generic failure message for network or parsing errors.
      setError(t("verifyFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{t("verifyTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("verifyHint")}</p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("hashLabel")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            placeholder="sha256 hex…"
            className="font-mono text-xs"
          />
          <Button onClick={() => void verify()} disabled={busy || !hash.trim()}>
            {t("verifyAction")}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && (
            <div className="rounded border p-3 text-sm">
              {result.valid ? (
                // Show the decoded certificate details when the hash is valid.
                <>
                  <p className="font-medium text-emerald-400">{t("valid")}</p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    <li>
                      {t("program")}: {result.data?.programName}
                    </li>
                    <li>
                      {t("learner")}: {result.data?.displayName ?? "—"}
                    </li>
                    <li>
                      {t("completedAt")}: {result.data?.completedAt}
                    </li>
                    <li>
                      {t("tasks")}: {result.data?.taskCount}
                    </li>
                    <li>
                      {t("issuer")}: {result.data?.issuer}
                    </li>
                  </ul>
                </>
              ) : (
                <p className="text-destructive">{t("invalid")}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
