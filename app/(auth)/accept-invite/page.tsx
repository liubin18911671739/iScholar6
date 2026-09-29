/**
 * Accept Invite Page (/(auth)/accept-invite)
 *
 * Functionality:
 * - Reads a signed invite token from the query string and sets the account password.
 * - On success links back to the sign-in page.
 *
 * Notes:
 * - Reads the token from `window.location.search` (client-only) to avoid a
 *   `useSearchParams` suspense boundary during static rendering.
 *
 * @author mrpi
 * @date 2026-09-30
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Password-setting form for invited users. */
export default function AcceptInvitePage() {
  const t = useTranslations("invite");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError(t("weak"));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json.error === "WEAK_PASSWORD" ? t("weak") : t("invalid"));
        return;
      }
      setDone(true);
    } catch {
      setError(t("invalid"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("success")}</p>
            <Button asChild className="w-full">
              <Link href="/login">{t("backToLogin")}</Link>
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{t("confirm")}</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !token}>
              {busy ? t("submitting") : t("submit")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
