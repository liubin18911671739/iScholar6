/**
 * OrgMembersPanel (components/training/org-members-panel.tsx)
 *
 * Functionality:
 * - Lists and manages members of a training organization, supporting add/remove and role selection.
 * - Fetches `/api/training/organizations/:orgId/members` and tracks whether the caller can manage.
 * - Lets staff create a new organization and reloads the page on success.
 *
 * Notes:
 * - Uses `sonner` toasts and the `training.manage` i18n namespace.
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

/** Minimal organization option for the selector. */
type OrgOption = { id: string; name: string; slug: string };
/** A member row within an organization. */
type OrgMember = {
  userId: string;
  role: string;
  displayName?: string | null;
  email?: string | null;
  profileRole?: string | null;
};

/** Organization member management panel. */
export function OrgMembersPanel({ organizations }: { organizations: OrgOption[] }) {
  const t = useTranslations("training.manage");
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "");
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"librarian" | "org_admin" | "viewer">("librarian");
  const [busy, setBusy] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  // Default the selector to the first organization once available.
  useEffect(() => {
    if (!orgId && organizations[0]?.id) setOrgId(organizations[0].id);
  }, [organizations, orgId]);

  // Load members and the caller's manage permission for the selected org.
  const load = useCallback(async () => {
    if (!orgId) return;
    const res = await fetch(`/api/training/organizations/${orgId}/members`);
    if (!res.ok) {
      setMembers([]);
      setCanManage(false);
      return;
    }
    const json = await res.json();
    setMembers(json.data ?? []);
    setCanManage(Boolean(json.canManage));
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Add a member with the chosen role.
  async function addMember() {
    if (!orgId || !email.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/training/organizations/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(json.error ?? t("orgMemberFailed")));
        return;
      }
      toast.success(t("orgMemberAdded"));
      setEmail("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Remove a member from the selected organization.
  async function removeMember(userId: string) {
    if (!orgId) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/training/organizations/${orgId}/members?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(String(json.error ?? t("orgMemberFailed")));
        return;
      }
      toast.success(t("orgMemberRemoved"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Create a new organization and reload so it appears everywhere.
  async function createOrg() {
    if (!newOrgName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/training/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(json.error ?? t("orgCreateFailed")));
        return;
      }
      toast.success(t("orgCreateSuccess"));
      setNewOrgName("");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  if (organizations.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("orgMembersTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("orgMembersHint")}</p>
        <div className="space-y-1">
          <Label>{t("fields.organization")}</Label>
          <select
            className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.slug})
              </option>
            ))}
          </select>
        </div>

        <ul className="space-y-1 text-sm">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1"
            >
              <div>
                <span className="font-medium">{m.displayName || m.email || m.userId.slice(0, 8)}</span>
                {m.email && (
                  <span className="ml-2 text-xs text-muted-foreground">{m.email}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{m.role}</Badge>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void removeMember(m.userId)}
                  >
                    {t("actions.remove")}
                  </Button>
                )}
              </div>
            </li>
          ))}
          {members.length === 0 && (
            <li className="text-xs text-muted-foreground">{t("orgMembersEmpty")}</li>
          )}
        </ul>

        {canManage && (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("placeholders.staffEmail")}
            />
            <select
              className="flex h-10 rounded-md border bg-background px-2 text-sm"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "librarian" | "org_admin" | "viewer")
              }
            >
              <option value="librarian">{t("orgRoles.librarian")}</option>
              <option value="org_admin">{t("orgRoles.org_admin")}</option>
              <option value="viewer">{t("orgRoles.viewer")}</option>
            </select>
            <Button onClick={() => void addMember()} disabled={busy || !email.trim()}>
              {t("actions.addOrgMember")}
            </Button>
          </div>
        )}

        <div className="border-t pt-3 space-y-2">
          <Label className="text-xs text-muted-foreground">{t("orgCreateHint")}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder={t("placeholders.orgName")}
            />
            <Button variant="outline" onClick={() => void createOrg()} disabled={busy}>
              {t("actions.createOrg")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
