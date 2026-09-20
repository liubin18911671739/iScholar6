/**
 * Settings (/settings)
 *
 * Functionality:
 * - Displays browser storage usage/quota, agent language selection, and enabled MCP tools.
 * - Reads/writes agent language via the zustand locale store.
 * - Estimates storage with navigator.storage.estimate on mount.
 * - Conditionally renders plugin settings when the plugin system flag is enabled.
 *
 * Notes:
 * - Imports "@/lib/mcp" for its registration side effect before listing tools.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { HardDrive, Globe } from "lucide-react";
import { listTools } from "@/lib/mcp/gateway";
import { useLocaleStore, type AgentLanguage } from "@/lib/stores/locale-store";
import { isPluginSystemEnabled } from "@/lib/plugins/flags";
import { PluginSettings } from "@/components/plugins/plugin-settings";
// Ensure MCP tools are registered (side-effect import)
import "@/lib/mcp";

/** MCP tools captured at module load after the registration side-effect import. */
const MCP_TOOLS = listTools();

/** Settings screen for storage, agent language, plugins, and MCP tools. */
export default function SettingsPage() {
  const t = useTranslations("settings");

  // Agent language from zustand store
  const agentLanguage = useLocaleStore((s) => s.agentLanguage);
  const setAgentLanguage = useLocaleStore((s) => s.setAgentLanguage);

  // Storage state
  const [storageUsed, setStorageUsed] = useState<string>("...");
  const [storageQuota, setStorageQuota] = useState<string>("...");

  useEffect(() => {
    async function loadStorage() {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        setStorageUsed(formatBytes(est.usage ?? 0));
        setStorageQuota(formatBytes(est.quota ?? 0));
      }
    }
    loadStorage();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Storage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              {t("storage")}
            </CardTitle>
            <CardDescription>{t("storageUsage")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("used")}</span>
              <Badge variant="outline">{storageUsed}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("quota")}</span>
              <Badge variant="outline">{storageQuota}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("storageNote")}
            </p>
          </CardContent>
        </Card>

        {/* Agent Language */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {t("agentLanguage")}
            </CardTitle>
            <CardDescription>{t("agentLanguageHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {(["auto", "zh", "en"] as AgentLanguage[]).map((lang) => (
                <Button
                  key={lang}
                  variant={agentLanguage === lang ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAgentLanguage(lang)}
                  className="flex-1"
                >
                  {t(`lang${lang.charAt(0).toUpperCase() + lang.slice(1)}` as "langAuto")}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {isPluginSystemEnabled() && (
        <Card>
          <CardHeader>
            <CardTitle>{t("plugins.title")}</CardTitle>
            <CardDescription>{t("plugins.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <PluginSettings />
          </CardContent>
        </Card>
      )}

      {isPluginSystemEnabled() && <Separator />}

      {/* MCP Tools */}
      <Card>
        <CardHeader>
          <CardTitle>{t("mcpTools")}</CardTitle>
          <CardDescription>{t("mcpHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {MCP_TOOLS.map((tool) => (
              <div key={tool.name} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{tool.name}</p>
                  <p className="text-xs text-muted-foreground">{tool.description}</p>
                </div>
                <Badge variant="outline" className="text-green-600">{t("enabled")}</Badge>
              </div>
            ))}
            {MCP_TOOLS.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("noMcpTools")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Formats a byte count into a human-readable size string. */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
