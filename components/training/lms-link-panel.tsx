/**
 * LmsLinkPanel (components/training/lms-link-panel.tsx)
 *
 * Functionality:
 * - Form for configuring a program's LTI 1.3 / AGS gradebook link (platform, auth method, credentials, endpoints).
 * - Loads the existing link via GET and persists edits via PUT `/lms/link`; secrets stay write-only and are never echoed back.
 * - Triggers dry-run or real gradebook pushes to the LMS and surfaces the last push status.
 *
 * Notes:
 * - Uses `sonner` toasts for feedback and the `training.manage` i18n namespace.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

/** Editable LTI link configuration form state. */
type LinkForm = {
  platform: "canvas" | "moodle" | "generic";
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  agsLineitemUrl: string;
  deploymentId: string;
  authMethod: "client_secret_post" | "client_secret_basic" | "private_key_jwt";
  privateKeyPem: string;
};

/** Build a blank LTI link form. */
const emptyForm = (): LinkForm => ({
  platform: "canvas",
  enabled: false,
  issuer: "",
  clientId: "",
  clientSecret: "",
  tokenUrl: "",
  agsLineitemUrl: "",
  deploymentId: "",
  authMethod: "client_secret_post",
  privateKeyPem: "",
});

/** Staff panel to configure and push a program's LMS gradebook link. */
export function LmsLinkPanel({ programId }: { programId: string }) {
  const t = useTranslations("training.manage");
  const [form, setForm] = useState<LinkForm>(emptyForm());
  const [hasSecret, setHasSecret] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [lastPush, setLastPush] = useState<{
    at?: string | null;
    status?: string | null;
    error?: string | null;
  }>({});
  const [busy, setBusy] = useState(false);

  // Load the saved link config, keeping secret fields blank while tracking whether they exist.
  const load = useCallback(async () => {
    const res = await fetch(`/api/training/programs/${programId}/lms/link`);
    if (!res.ok) return;
    const json = await res.json();
    const data = json.data;
    if (!data) {
      setForm(emptyForm());
      setHasSecret(false);
      setHasKey(false);
      setLastPush({});
      return;
    }
    setForm({
      platform: data.platform ?? "canvas",
      enabled: Boolean(data.enabled),
      issuer: data.issuer ?? "",
      clientId: data.clientId ?? "",
      clientSecret: "",
      tokenUrl: data.tokenUrl ?? "",
      agsLineitemUrl: data.agsLineitemUrl ?? "",
      deploymentId: data.deploymentId ?? "",
      authMethod: data.authMethod ?? "client_secret_post",
      privateKeyPem: "",
    });
    setHasSecret(Boolean(data.hasClientSecret));
    setHasKey(Boolean(data.hasPrivateKey));
    setLastPush({
      at: data.lastPushAt,
      status: data.lastPushStatus,
      error: data.lastPushError,
    });
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Merge a single field into the link form state.
  function patch<K extends keyof LinkForm>(key: K, value: LinkForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Persist the link config and clear transient secret inputs on success.
  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/training/programs/${programId}/lms/link`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: form.platform,
          enabled: form.enabled,
          issuer: form.issuer || null,
          clientId: form.clientId || null,
          clientSecret: form.clientSecret || undefined,
          tokenUrl: form.tokenUrl || null,
          agsLineitemUrl: form.agsLineitemUrl || null,
          deploymentId: form.deploymentId || null,
          authMethod: form.authMethod,
          privateKeyPem: form.privateKeyPem || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(json.error ?? t("lmsSaveFailed")));
        return;
      }
      toast.success(t("lmsSaveSuccess"));
      setForm((prev) => ({ ...prev, clientSecret: "", privateKeyPem: "" }));
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Run a dry-run or live gradebook push to the LMS.
  async function push(dryRun: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/training/programs/${programId}/lms/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        toast.error(
          String(json.error ?? json.data?.errors?.[0]?.error ?? t("lmsPushFailed"))
        );
        await load();
        return;
      }
      toast.success(
        dryRun
          ? t("lmsDryRunOk")
          : t("lmsPushOk", { count: json.data?.pushed ?? 0 })
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{t("lmsLinkTitle")}</CardTitle>
        {form.enabled ? (
          <Badge variant="secondary">{t("lmsEnabled")}</Badge>
        ) : (
          <Badge variant="outline">{t("lmsDisabled")}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("lmsLinkHint")}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("lms.platform")}</Label>
            <select
              className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
              value={form.platform}
              onChange={(e) =>
                patch("platform", e.target.value as LinkForm["platform"])
              }
            >
              <option value="canvas">Canvas</option>
              <option value="moodle">Moodle</option>
              <option value="generic">Generic</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("lms.authMethod")}</Label>
            <select
              className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
              value={form.authMethod}
              onChange={(e) =>
                patch("authMethod", e.target.value as LinkForm["authMethod"])
              }
            >
              <option value="client_secret_post">client_secret_post</option>
              <option value="client_secret_basic">client_secret_basic</option>
              <option value="private_key_jwt">private_key_jwt</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("lms.issuer")}</Label>
            <Input
              value={form.issuer}
              onChange={(e) => patch("issuer", e.target.value)}
              placeholder="https://canvas.example.edu"
            />
          </div>
          <div className="space-y-1">
            <Label>{t("lms.clientId")}</Label>
            <Input
              value={form.clientId}
              onChange={(e) => patch("clientId", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>
              {t("lms.clientSecret")}
              {hasSecret && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({t("lms.secretSet")})
                </span>
              )}
            </Label>
            <Input
              type="password"
              value={form.clientSecret}
              onChange={(e) => patch("clientSecret", e.target.value)}
              placeholder={hasSecret ? "••••••••" : ""}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("lms.tokenUrl")}</Label>
            <Input
              value={form.tokenUrl}
              onChange={(e) => patch("tokenUrl", e.target.value)}
              placeholder="https://…/login/oauth2/token"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("lms.agsLineitemUrl")}</Label>
            <Input
              value={form.agsLineitemUrl}
              onChange={(e) => patch("agsLineitemUrl", e.target.value)}
              placeholder="https://…/api/lti/courses/…/line_items/…"
            />
          </div>
          <div className="space-y-1">
            <Label>{t("lms.deploymentId")}</Label>
            <Input
              value={form.deploymentId}
              onChange={(e) => patch("deploymentId", e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm pb-1">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => patch("enabled", e.target.checked)}
            />
            {t("lms.enablePush")}
          </label>
          {form.authMethod === "private_key_jwt" && (
            <div className="space-y-1 sm:col-span-2">
              <Label>
                {t("lms.privateKey")}
                {hasKey && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({t("lms.secretSet")})
                  </span>
                )}
              </Label>
              <Textarea
                value={form.privateKeyPem}
                onChange={(e) => patch("privateKeyPem", e.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder="-----BEGIN PRIVATE KEY-----"
              />
            </div>
          )}
        </div>

        {(lastPush.at || lastPush.status) && (
          <p className="text-xs text-muted-foreground">
            {t("lms.lastPush", {
              status: lastPush.status ?? "—",
              at: lastPush.at ? new Date(lastPush.at).toLocaleString() : "—",
            })}
            {lastPush.error ? ` · ${lastPush.error}` : ""}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={busy}>
            {t("lmsSave")}
          </Button>
          <Button
            variant="outline"
            onClick={() => void push(true)}
            disabled={busy || !form.enabled}
          >
            {t("lmsDryRun")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void push(false)}
            disabled={busy || !form.enabled}
          >
            {t("lmsPush")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
