/**
 * TaskPacksPanel (components/training/task-packs-panel.tsx)
 *
 * Functionality:
 * - Staff tool for viewing and uploading curriculum task packs, plus a visual builder to compose a pack from registry tasks.
 * - Loads available packs and builtin counts from `/api/training/task-packs` and uploads parsed JSON packs via POST.
 * - Supports selecting, reordering, and generating pack JSON from chosen task ids.
 *
 * Notes:
 * - Uses `buildCurriculumPackJson`, `MVP_TRAINING_TASKS`, `sonner` toasts, and the `training.manage` namespace.
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MVP_TRAINING_TASKS } from "@/lib/training/registry";
import { buildCurriculumPackJson } from "@/lib/training/task-pack-schema";

/** A stored task-pack summary row. */
type PackRow = {
  id: string;
  pack_key: string;
  name: string;
  version: string;
  source: string;
};

/** Sample pack JSON shown in the editable textarea. */
const SAMPLE = `{
  "schemaVersion": 1,
  "key": "demo-pack",
  "name": "Demo task pack",
  "version": "1.0.0",
  "tasks": [
    {
      "id": "lit-note",
      "title": "文献笔记",
      "description": "整理三篇核心文献的观点与方法。",
      "agent": "litreview",
      "dimension": "critical-evaluation",
      "steps": ["选文献", "摘录观点", "对比方法", "写短评"],
      "requiresReview": true,
      "peerReview": true
    }
  ]
}`;

/** Panel for viewing, building, and uploading curriculum task packs. */
export function TaskPacksPanel({ readOnly = false }: { readOnly?: boolean }) {
  const t = useTranslations("training.manage");
  const [json, setJson] = useState(SAMPLE);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [builtinCount, setBuiltinCount] = useState(8);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    MVP_TRAINING_TASKS.slice(0, 5).map((task) => task.id)
  );
  const [packKey, setPackKey] = useState("spring-camp");
  const [packName, setPackName] = useState("春季训练营课表");

  // Load stored packs and the builtin pack count.
  const load = useCallback(async () => {
    const res = await fetch("/api/training/task-packs");
    if (!res.ok) return;
    const body = await res.json();
    setPacks(body.data?.packs ?? []);
    setBuiltinCount((body.data?.builtin ?? []).length || 8);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Toggle a task's inclusion in the pack selection.
  function toggleTask(id: string) {
    setSelectedIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  // Swap a selected task with its neighbor to reorder the pack.
  function moveTask(id: string, dir: -1 | 1) {
    setSelectedIds((cur) => {
      const i = cur.indexOf(id);
      if (i < 0) return cur;
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  // Build pack JSON from the current selection and ordering.
  function generateJson() {
    if (selectedIds.length === 0) {
      toast.error(t("packInvalidJson"));
      return;
    }
    const pack = buildCurriculumPackJson({
      key: packKey || "camp-pack",
      name: packName || "Camp pack",
      taskIds: selectedIds,
    });
    setJson(JSON.stringify(pack, null, 2));
    toast.success(t("packsGenerateJson"));
  }

  // Parse and POST the edited pack JSON, then reload the list.
  async function upload() {
    setBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        toast.error(t("packInvalidJson"));
        return;
      }
      const res = await fetch("/api/training/task-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(body.error ?? t("packUploadFailed")));
        return;
      }
      toast.success(t("packUploadSuccess"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("packsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("packsHint")}</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{t("packsBuiltin", { count: builtinCount })}</Badge>
          <Badge variant="outline">{t("packsCustom", { count: packs.length })}</Badge>
        </div>
        <ul className="space-y-1 text-sm">
          {packs.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded border px-2 py-1">
              <span>
                {p.name}{" "}
                <span className="text-xs text-muted-foreground">
                  ({p.pack_key} v{p.version})
                </span>
              </span>
              <Badge variant="outline">{p.source}</Badge>
            </li>
          ))}
        </ul>

        {!readOnly && (
          <div className="space-y-3 rounded border p-3">
            <p className="text-sm font-medium">{t("packsVisualTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("packsVisualHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={packKey}
                onChange={(e) => setPackKey(e.target.value)}
                placeholder="pack-key"
                className="h-8 text-xs"
              />
              <Input
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
                placeholder="name"
                className="h-8 text-xs"
              />
            </div>
            <p className="text-xs font-medium">{t("packsSelectTasks")}</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {MVP_TRAINING_TASKS.map((task) => {
                const checked = selectedIds.includes(task.id);
                const order = selectedIds.indexOf(task.id);
                return (
                  <li
                    key={task.id}
                    className="flex items-center gap-2 rounded border px-2 py-1"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTask(task.id)}
                    />
                    <span className="flex-1">
                      {checked ? `${order + 1}. ` : ""}
                      {task.title}
                    </span>
                    {checked && (
                      <span className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1"
                          onClick={() => moveTask(task.id, -1)}
                        >
                          {t("packsApplyOrder")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1"
                          onClick={() => moveTask(task.id, 1)}
                        >
                          {t("packsApplyDown")}
                        </Button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button type="button" size="sm" variant="secondary" onClick={generateJson}>
              {t("packsGenerateJson")}
            </Button>
          </div>
        )}

        {!readOnly && (
          <>
            <Textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
            <Button onClick={() => void upload()} disabled={busy}>
              {t("actions.uploadPack")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
