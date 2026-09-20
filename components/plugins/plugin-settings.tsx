/**
 * Plugin Settings (components/plugins/plugin-settings.tsx)
 *
 * Functionality:
 * - Lets users install plugins from a pasted or uploaded JSON manifest and lists installed plugins.
 * - Supports enabling/disabling and uninstalling plugins, and selecting prompt packs per built-in agent.
 * - Bootstraps/subscribes to the plugin registry and displays available MCP tools.
 *
 * Notes:
 * - Backed by the local plugins install/registry modules and Dexie `LocalPluginInstall` records.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  installPlugin,
  uninstallPlugin,
  setPluginEnabled,
  setActivePromptPack,
  getActivePromptPack,
  listInstalledPlugins,
  listPacksForAgent,
} from "@/lib/plugins/install";
import { ensurePluginsBootstrapped } from "@/lib/plugins/bootstrap";
import {
  listPluginAgents,
  subscribePluginRegistry,
  getInstalledSnapshot,
} from "@/lib/plugins/registry";
import { listTools } from "@/lib/mcp/gateway";
import { BUILTIN_AGENT_IDS } from "@/lib/ai/agents/registry";
import type { LocalPluginInstall } from "@/lib/local/db";
import { Puzzle, Trash2, Upload } from "lucide-react";

/** Settings panel for installing, toggling, and configuring plugins. */
export function PluginSettings() {
  const t = useTranslations("settings.plugins");
  const [manifestText, setManifestText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [installs, setInstalls] = useState<LocalPluginInstall[]>([]);
  const [packByAgent, setPackByAgent] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reload installs, active prompt packs, and force a re-render.
  const refresh = useCallback(async () => {
    await ensurePluginsBootstrapped();
    const rows = await listInstalledPlugins();
    setInstalls(rows);
    const packs: Record<string, string> = {};
    for (const id of BUILTIN_AGENT_IDS) {
      packs[id] = await getActivePromptPack(id);
    }
    setPackByAgent(packs);
    setTick((n) => n + 1);
  }, []);

  // Subscribe to registry changes so the list stays in sync after install/enable/disable.
  useEffect(() => {
    void refresh();
    return subscribePluginRegistry(() => {
      setInstalls(getInstalledSnapshot());
      setTick((n) => n + 1);
    });
  }, [refresh]);

  // Re-read when tick changes after install/enable/disable
  void tick;
  const pluginAgents = listPluginAgents();
  const tools = listTools();

  // Validate and install the manifest currently in the textarea.
  async function handleInstall() {
    setMessage("");
    setError("");
    const result = await installPlugin(manifestText);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(t("installSuccess", { id: result.pluginId }));
    setManifestText("");
    await refresh();
  }

  // Load an uploaded manifest file into the textarea.
  async function handleFile(file: File) {
    const text = await file.text();
    setManifestText(text);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Puzzle className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold">{t("title")}</h3>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="plugin-manifest">{t("manifestLabel")}</Label>
        <Textarea
          id="plugin-manifest"
          value={manifestText}
          onChange={(e) => setManifestText(e.target.value)}
          placeholder={t("manifestPlaceholder")}
          rows={8}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void handleInstall()} disabled={!manifestText.trim()}>
            {t("install")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" />
            {t("upload")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>
        {message && <p className="text-sm text-emerald-400">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium">{t("installed")}</h4>
        {installs.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="space-y-3">
            {installs.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-border/60 bg-card/50 p-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {row.manifest.name}{" "}
                      <span className="text-xs text-muted-foreground">v{row.version}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <code>{row.id}</code>
                      {row.manifest.description ? ` — ${row.manifest.description}` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(row.manifest.agents?.length ?? 0) > 0 && (
                        <Badge variant="outline">{t("badgeAgents", { n: row.manifest.agents!.length })}</Badge>
                      )}
                      {(row.manifest.promptPacks?.length ?? 0) > 0 && (
                        <Badge variant="outline">{t("badgePacks", { n: row.manifest.promptPacks!.length })}</Badge>
                      )}
                      {(row.manifest.mcpTools?.length ?? 0) > 0 && (
                        <Badge variant="outline">{t("badgeTools", { n: row.manifest.mcpTools!.length })}</Badge>
                      )}
                      <Badge variant={row.enabled ? "default" : "secondary"}>
                        {row.enabled ? t("enabled") : t("disabled")}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void setPluginEnabled(row.id, !row.enabled).then(refresh)}
                    >
                      {row.enabled ? t("disable") : t("enable")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1"
                      onClick={() => void uninstallPlugin(row.id).then(refresh)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("uninstall")}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pluginAgents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">{t("customAgents")}</h4>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {pluginAgents.map((agent) => (
              <li key={agent.fullId}>
                <span className="font-medium text-foreground">{agent.name}</span>{" "}
                <code className="rounded bg-muted px-1">{agent.fullId}</code>
                <span className="ml-1">
                  → /projects/&#123;projectId&#125;/{agent.fullId}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t("promptPacks")}</h4>
        <p className="text-xs text-muted-foreground">{t("promptPacksHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {BUILTIN_AGENT_IDS.map((agentId) => {
            const options = listPacksForAgent(agentId);
            return (
              <div key={agentId} className="space-y-1">
                <Label className="text-xs">{agentId}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  value={packByAgent[agentId] ?? "builtin"}
                  onChange={(e) => {
                    const value = e.target.value;
                    void setActivePromptPack(agentId, value as "builtin" | string)
                      .then(refresh)
                      .catch((err: unknown) =>
                        setError(err instanceof Error ? err.message : String(err))
                      );
                  }}
                >
                  <option value="builtin">{t("builtinPack")}</option>
                  {options.map((opt) => (
                    <option key={opt.packRef} value={opt.packRef}>
                      {opt.name} ({opt.pluginId})
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t("mcpTools")}</h4>
        <ul className="flex flex-wrap gap-1.5">
          {tools.map((tool) => (
            <Badge key={tool.name} variant={tool.source === "plugin" ? "default" : "outline"}>
              {tool.name}
              {tool.source === "plugin" ? ` · ${tool.pluginId}` : ""}
            </Badge>
          ))}
        </ul>
      </div>
    </div>
  );
}
