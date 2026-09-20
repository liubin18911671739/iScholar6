/**
 * TrainingManagePage (components/training/manage-page.tsx)
 *
 * Functionality:
 * - Staff/TA management console for training programs: create/edit programs, invite members, and assign camp roles.
 * - Composes the class report, consent audit, export, task-pack, calendar, org-member, LMS, and program-task panels.
 * - Resolves `staff` vs `ta` access from `/api/training/programs` and subscribes to realtime ops events for toasts.
 *
 * Notes:
 * - Supabase is the sole data layer; heavy composition of child panels from `components/training/*`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  createTrainingProgram,
  enrollLearner,
  useTrainingClassReport,
  useTrainingEnrollments,
  useTrainingPrograms,
} from "@/lib/local/hooks";
import { RemoteLoadError } from "@/components/collaborative/remote-load-error";
import { ProgramTasksPanel } from "@/components/training/program-tasks-panel";
import { ClassReportPanel } from "@/components/training/class-report-panel";
import { ProgramExportPanel } from "@/components/training/program-export-panel";
import { ConsentAuditPanel } from "@/components/training/consent-audit-panel";
import { TaskPacksPanel } from "@/components/training/task-packs-panel";
import { DueCalendarPanel } from "@/components/training/due-calendar";
import { OrgMembersPanel } from "@/components/training/org-members-panel";
import { LmsLinkPanel } from "@/components/training/lms-link-panel";
import { getCollaborativeClient } from "@/lib/supabase/collaborative";
import { subscribeTrainingOps } from "@/lib/supabase/realtime-training";

/** Program lifecycle status. */
type ProgramStatus = "draft" | "active" | "archived";
/** Enrollment lifecycle status. */
type EnrollmentStatus = "active" | "completed" | "removed";
/** Role a member holds within a training camp. */
type CampRole = "learner" | "ta";

/** A single remote enrollment row. */
type RemoteEnrollment = {
  id: string;
  learner_id: string;
  status: EnrollmentStatus;
  role?: CampRole;
  email?: string | null;
  profiles?: { id: string; display_name?: string | null; role?: string } | null;
};

/** A remote training program together with its enrollments. */
type RemoteProgram = {
  id: string;
  name: string;
  description?: string | null;
  discipline?: string | null;
  cohort_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  max_members?: number | null;
  status?: ProgramStatus;
  organization_id?: string | null;
  training_enrollments?: RemoteEnrollment[];
};

/** Minimal organization option used by selectors. */
type OrgOption = { id: string; name: string; slug: string };

/** Editable program form state. */
type ProgramForm = {
  name: string;
  description: string;
  discipline: string;
  cohortName: string;
  startDate: string;
  endDate: string;
  maxMembers: string;
  status: ProgramStatus;
  organizationId: string;
};

/** Build a blank program form. */
const emptyForm = (): ProgramForm => ({
  name: "",
  description: "",
  discipline: "外语/旅游/国际传播",
  cohortName: "",
  startDate: "",
  endDate: "",
  maxMembers: "",
  status: "draft",
  organizationId: "",
});

/** Map an invite API error code to a localized message, falling back to the generic one. */
function inviteErrorMessage(code: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  const known = [
    "ALREADY_ENROLLED",
    "PROGRAM_ARCHIVED",
    "PROGRAM_FULL",
    "PROGRAM_NOT_FOUND",
    "INVITE_FAILED",
    "USER_EXISTS_LOOKUP_FAILED",
    "INVALID_EMAIL",
    "VALIDATION_ERROR",
  ] as const;
  if ((known as readonly string[]).includes(code)) {
    return t(`inviteErrors.${code}`);
  }
  return t("inviteErrors.GENERIC", { code });
}

/** Best-effort display label for an enrollment. */
function memberLabel(item: RemoteEnrollment): string {
  return (
    item.profiles?.display_name ||
    item.email ||
    item.learner_id.slice(0, 8) + "…"
  );
}

/** Resolved manage access level, or null while still loading / in local mode. */
type ManageAccess = "staff" | "ta" | null;

/** Staff/TA console for managing training programs, members, and related panels. */
export function TrainingManagePage() {
  const t = useTranslations("training.manage");
  const { data: programs } = useTrainingPrograms();
  const [remotePrograms, setRemotePrograms] = useState<RemoteProgram[]>([]);
  const [form, setForm] = useState<ProgramForm>(emptyForm);
  const [learner, setLearner] = useState("");
  const [batchEmails, setBatchEmails] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [remoteLoadError, setRemoteLoadError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  /** staff = full manage; ta = review/ops read for own camps; null until loaded / local mode */
  const [access, setAccess] = useState<ManageAccess>(null);
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const collaborative = true;
  // Supabase is the sole data layer; staff/ta roles come from GET /programs.
  const isStaffAccess = access === "staff";
  const isTaAccess = access === "ta";
  const { data: localEnrollments } = useTrainingEnrollments(selected);
  const { data: localReport } = useTrainingClassReport(selected);

  // Load programs and resolve the caller's staff/ta access level.
  const refreshPrograms = useCallback(async () => {
    setRemoteLoadError("");
    setForbidden(false);
    try {
      const res = await fetch("/api/training/programs");
      if (res.status === 403) {
        setForbidden(true);
        setRemotePrograms([]);
        setAccess(null);
        return;
      }
      if (!res.ok) throw new Error("LOAD_FAILED");
      const json = await res.json();
      setRemotePrograms(json.data ?? []);
      setAccess(json.access === "ta" ? "ta" : "staff");
    } catch {
      setRemotePrograms([]);
      setRemoteLoadError(t("loadError"));
    }
  }, [t]);

  // Load organizations for the program form (staff only).
  useEffect(() => {
    if (!collaborative || !isStaffAccess) return;
    void (async () => {
      const res = await fetch("/api/training/organizations");
      if (!res.ok) return;
      const json = await res.json();
      const orgs = (json.data ?? []) as OrgOption[];
      setOrganizations(orgs);
      setForm((prev) =>
        prev.organizationId || orgs.length === 0
          ? prev
          : { ...prev, organizationId: orgs[0].id }
      );
    })();
  }, [collaborative, isStaffAccess]);

  useEffect(() => {
    void refreshPrograms();
  }, [refreshPrograms]);

  // Realtime ops toasts (submissions / reviews) — metadata only.
  const programIdsKey = remotePrograms.map((p) => p.id).join(",");
  useEffect(() => {
    if (!collaborative) return;
    const client = getCollaborativeClient();
    if (!client) return;
    const programIds = programIdsKey ? programIdsKey.split(",") : [];
    const unsub = subscribeTrainingOps(client, {
      programIds: programIds.length ? programIds : undefined,
      onEvent: (event) => {
        if (event.table === "training_submissions") {
          toast.message(
            t("realtime.submission", {
              status: event.status ?? "updated",
              task: event.taskId ?? "—",
            })
          );
        } else if (event.table === "training_reviews") {
          toast.message(t("realtime.review"));
        }
        void refreshPrograms();
      },
    });
    return unsub;
  }, [collaborative, programIdsKey, refreshPrograms, t]);

  const displayedPrograms = collaborative
    ? remotePrograms
    : (programs ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        discipline: p.discipline,
        cohort_name: p.cohortName,
        status: "active" as ProgramStatus,
        training_enrollments: [],
      }));

  const remoteSelected = remotePrograms.find((program) => program.id === selected);
  const displayedEnrollments: RemoteEnrollment[] = collaborative
    ? (remoteSelected?.training_enrollments ?? []).filter((e) => e.status !== "removed")
    : (localEnrollments ?? []).map((e) => ({
        id: e.id,
        learner_id: e.learnerId,
        status: (e.status as EnrollmentStatus) || "active",
        role: "learner",
        profiles: { id: e.learnerId, display_name: e.displayName },
      }));
  const displayedReport = collaborative ? undefined : localReport;
  const selectedProgram = displayedPrograms.find((p) => p.id === selected);
  const isArchived = selectedProgram?.status === "archived";

  function patchForm<K extends keyof ProgramForm>(key: K, value: ProgramForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Create a program remotely or locally depending on the active data mode.
  async function create() {
    if (!form.name.trim()) return;
    setError("");
    setBusy(true);
    try {
      if (collaborative) {
        const res = await fetch("/api/training/programs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || null,
            discipline: form.discipline.trim() || null,
            cohortName: form.cohortName.trim() || null,
            startDate: form.startDate || null,
            endDate: form.endDate || null,
            maxMembers: form.maxMembers ? Number(form.maxMembers) : null,
            status: form.status,
            organizationId: form.organizationId || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (json.error === "FORBIDDEN") {
            setForbidden(true);
            setError(t("forbiddenCreate"));
          } else {
            setError(t("createFailed"));
          }
          return;
        }
        setRemotePrograms((items) => [json.data, ...items]);
        setSelected(json.data.id);
        toast.success(t("createSuccess"));
      } else {
        const id = await createTrainingProgram({
          name: form.name.trim(),
          cohortName: form.cohortName.trim() || form.name.trim(),
          discipline: form.discipline.trim() || undefined,
          description: form.description.trim() || undefined,
        });
        setSelected(id);
        toast.success(t("createSuccess"));
      }
      setForm(emptyForm());
    } catch {
      setError(t("createFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Persist edits to the selected program.
  async function saveProgram() {
    if (!collaborative || !selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/training/programs/${selected}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim() || undefined,
          description: form.description.trim() || null,
          discipline: form.discipline.trim() || null,
          cohortName: form.cohortName.trim() || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          maxMembers: form.maxMembers ? Number(form.maxMembers) : null,
          status: form.status,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? t("saveFailed"));
        return;
      }
      setRemotePrograms((items) =>
        items.map((p) => (p.id === selected ? { ...p, ...json.data } : p))
      );
      toast.success(t("saveSuccess"));
    } catch {
      setError(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Mirror the selected remote program into the editable form.
  useEffect(() => {
    if (!remoteSelected) return;
    setForm((prev) => ({
      name: remoteSelected.name ?? "",
      description: remoteSelected.description ?? "",
      discipline: remoteSelected.discipline ?? "",
      cohortName: remoteSelected.cohort_name ?? "",
      startDate: remoteSelected.start_date ?? "",
      endDate: remoteSelected.end_date ?? "",
      maxMembers: remoteSelected.max_members != null ? String(remoteSelected.max_members) : "",
      status: remoteSelected.status ?? "draft",
      organizationId: remoteSelected.organization_id ?? prev.organizationId ?? "",
    }));
  }, [remoteSelected]);

  // Invite a single email to the selected program.
  async function inviteOne(email: string) {
    if (!selected || !email.trim()) return;
    const res = await fetch(`/api/training/programs/${selected}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(inviteErrorMessage(String(json.error ?? "GENERIC"), t));
      return false;
    }
    if (json.existing || json.error === "ALREADY_ENROLLED") {
      toast.message(t("inviteErrors.ALREADY_ENROLLED"));
    } else {
      toast.success(t("inviteSuccess", { email: email.trim() }));
    }
    return true;
  }

  // Enroll/invite a learner by email (remote) or local id.
  async function enroll() {
    if (!selected || !learner.trim()) return;
    if (isArchived) {
      toast.error(t("inviteErrors.PROGRAM_ARCHIVED"));
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (collaborative) {
        await inviteOne(learner);
        await refreshPrograms();
      } else {
        await enrollLearner({
          programId: selected,
          learnerId: learner,
          displayName: learner,
        });
        toast.success(t("inviteSuccess", { email: learner }));
      }
      setLearner("");
    } catch {
      setError(t("inviteFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Bulk-invite a pasted list of emails, reporting ok/fail counts.
  async function enrollBatch() {
    if (!collaborative || !selected || !batchEmails.trim()) return;
    if (isArchived) {
      toast.error(t("inviteErrors.PROGRAM_ARCHIVED"));
      return;
    }
    const emails = batchEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (emails.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/training/programs/${selected}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(inviteErrorMessage(String(json.error ?? "GENERIC"), t));
        return;
      }
      const rows = (json.data ?? []) as Array<{ ok: boolean; error?: string }>;
      const okCount = rows.filter((r) => r.ok).length;
      const failCount = rows.length - okCount;
      toast.success(t("batchResult", { ok: okCount, fail: failCount }));
      setBatchEmails("");
      await refreshPrograms();
    } catch {
      toast.error(t("inviteFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Remove an enrollment from the selected program.
  async function removeMember(enrollmentId: string) {
    if (!collaborative || !selected) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/training/programs/${selected}/members/${enrollmentId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(String(json.error ?? t("removeFailed")));
        return;
      }
      toast.success(t("removeSuccess"));
      await refreshPrograms();
    } finally {
      setBusy(false);
    }
  }

  // Update a member's camp role (learner/ta).
  async function setMemberRole(enrollmentId: string, role: CampRole) {
    if (!collaborative || !selected) return;
    const res = await fetch(
      `/api/training/programs/${selected}/members/${enrollmentId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      }
    );
    if (!res.ok) {
      toast.error(t("saveFailed"));
      return;
    }
    toast.success(t("roleUpdated"));
    await refreshPrograms();
  }

  // Count currently active enrollments.
  const activeCount = useMemo(
    () => displayedEnrollments.filter((e) => e.status === "active").length,
    [displayedEnrollments]
  );

  if (forbidden) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{t("forbiddenPage")}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {collaborative && (
        <p className="text-sm text-emerald-600">{t("collabBanner")}</p>
      )}
      {isTaAccess && (
        <p className="rounded border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">
          {t("taBanner")}
        </p>
      )}
      <RemoteLoadError error={remoteLoadError || null} onRetry={() => void refreshPrograms()} />
      {error && (
        <p role="alert" className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {isStaffAccess && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selected && collaborative ? t("editProgram") : t("createProgram")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("fields.name")}</Label>
            <Input value={form.name} onChange={(e) => patchForm("name", e.target.value)} placeholder={t("placeholders.name")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("fields.description")}</Label>
            <Textarea value={form.description} onChange={(e) => patchForm("description", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>{t("fields.discipline")}</Label>
            <Input value={form.discipline} onChange={(e) => patchForm("discipline", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("fields.cohort")}</Label>
            <Input value={form.cohortName} onChange={(e) => patchForm("cohortName", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("fields.startDate")}</Label>
            <Input type="date" value={form.startDate} onChange={(e) => patchForm("startDate", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("fields.endDate")}</Label>
            <Input type="date" value={form.endDate} onChange={(e) => patchForm("endDate", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("fields.maxMembers")}</Label>
            <Input type="number" min={1} value={form.maxMembers} onChange={(e) => patchForm("maxMembers", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("fields.status")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.status}
              onChange={(e) => patchForm("status", e.target.value as ProgramStatus)}
            >
              <option value="draft">{t("status.draft")}</option>
              <option value="active">{t("status.active")}</option>
              <option value="archived">{t("status.archived")}</option>
            </select>
          </div>
          {collaborative && organizations.length > 0 && (
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("fields.organization")}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.organizationId}
                onChange={(e) => patchForm("organizationId", e.target.value)}
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.slug})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">{t("orgHint")}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button onClick={() => void create()} disabled={busy || !form.name.trim()}>
              {t("actions.create")}
            </Button>
            {collaborative && selected && (
              <Button variant="outline" onClick={() => void saveProgram()} disabled={busy}>
                {t("actions.save")}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setSelected("");
                setForm(emptyForm());
              }}
            >
              {t("actions.reset")}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("programList")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {displayedPrograms.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("emptyPrograms")}</p>
          )}
          {displayedPrograms.map((program) => (
            <Button
              key={program.id}
              variant={selected === program.id ? "default" : "outline"}
              className="gap-2"
              onClick={() => setSelected(program.id)}
            >
              {program.name}
              {program.status && (
                <Badge variant="secondary" className="text-[10px]">
                  {t(`status.${program.status}` as "status.draft")}
                </Badge>
              )}
            </Button>
          ))}
        </CardContent>
      </Card>

      {selected && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("classSummary")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t("memberCount", {
                count: displayedReport?.memberCount ?? activeCount,
              })}
              {isArchived && (
                <p className="mt-2 text-amber-500">{t("archivedHint")}</p>
              )}
            </CardContent>
          </Card>

          {collaborative && isStaffAccess && (
            <OrgMembersPanel organizations={organizations} />
          )}
          {collaborative && isStaffAccess && <TaskPacksPanel readOnly={false} />}
          {collaborative && <DueCalendarPanel />}
          {collaborative && <ClassReportPanel programId={selected} />}
          {collaborative && <ConsentAuditPanel programId={selected} />}
          {collaborative && (
            <ProgramExportPanel programId={selected} forceRedact={isTaAccess} />
          )}
          {collaborative && isStaffAccess && selected && (
            <LmsLinkPanel programId={selected} />
          )}
          {collaborative && (
            <ProgramTasksPanel programId={selected} readOnly={isTaAccess} />
          )}
          {collaborative && selected && isStaffAccess && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await fetch(
                      `/api/training/programs/${selected}/certificates`,
                      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
                    );
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      toast.error(String(json.error ?? t("certIssueFailed")));
                      return;
                    }
                    const issued = (json.data?.issued ?? []).length;
                    const skipped = (json.data?.skipped ?? []).length;
                    toast.success(t("certIssueResult", { issued, skipped }));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("actions.issueCerts")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { window.location.href = "/training/analytics"; }}>
                {t("actions.openAnalytics")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { window.location.href = "/training/verify"; }}>
                {t("actions.verifyCert")}
              </Button>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("membersTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isStaffAccess && (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={learner}
                      onChange={(e) => setLearner(e.target.value)}
                      placeholder={collaborative ? t("placeholders.email") : t("placeholders.localLearner")}
                      disabled={isArchived}
                    />
                    <Button onClick={() => void enroll()} disabled={busy || isArchived || !learner.trim()}>
                      {collaborative ? t("actions.invite") : t("actions.join")}
                    </Button>
                  </div>

                  {collaborative && (
                    <div className="space-y-2">
                      <Label>{t("batchInvite")}</Label>
                      <Textarea
                        value={batchEmails}
                        onChange={(e) => setBatchEmails(e.target.value)}
                        placeholder={t("placeholders.batch")}
                        rows={3}
                        disabled={isArchived}
                      />
                      <Button variant="outline" onClick={() => void enrollBatch()} disabled={busy || isArchived}>
                        {t("actions.batchInvite")}
                      </Button>
                    </div>
                  )}
                </>
              )}

              <div className="text-sm text-muted-foreground">
                {t("memberCount", { count: activeCount })}
              </div>

              <ul className="space-y-2">
                {displayedEnrollments.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{memberLabel(item)}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.email && <span className="mr-2">{item.email}</span>}
                        <Badge variant="outline" className="mr-1 text-[10px]">
                          {t(`role.${item.role ?? "learner"}` as "role.learner")}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {item.status}
                        </Badge>
                      </div>
                    </div>
                    {collaborative && isStaffAccess && (
                      <div className="flex flex-wrap gap-2">
                        <select
                          className="h-8 rounded border bg-background px-2 text-xs"
                          value={item.role ?? "learner"}
                          onChange={(e) =>
                            void setMemberRole(item.id, e.target.value as CampRole)
                          }
                        >
                          <option value="learner">{t("role.learner")}</option>
                          <option value="ta">{t("role.ta")}</option>
                        </select>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void removeMember(item.id)}
                          disabled={busy}
                        >
                          {t("actions.remove")}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
