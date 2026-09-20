/**
 * Features Page (/(marketing)/features)
 *
 * Functionality:
 * - Public marketing page listing the seven research agents and capabilities.
 * - Derives per-agent accent styling from the shared stage config.
 * - Renders platform capability cards, a tech-stack section, and a CTA.
 *
 * Notes:
 * - Agent metadata comes from @/lib/ai/agents/registry and @/components/module/stages.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Search,
  BookOpen,
  FlaskConical,
  Database,
  FileText,
  Send,
  MessageSquare,
  Shield,
  Cpu,
  Globe,
  HardDrive,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStage, primaryStageForAgent } from "@/components/module/stages";
import type { AgentId } from "@/lib/ai/agents/registry";

/** Ordered list of agent IDs paired with their display icons. */
const AGENTS: { key: AgentId; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "topic", Icon: Search },
  { key: "litreview", Icon: BookOpen },
  { key: "design", Icon: FlaskConical },
  { key: "data", Icon: Database },
  { key: "write", Icon: FileText },
  { key: "submit", Icon: Send },
  { key: "rebuttal", Icon: MessageSquare },
];

/** Platform capability cards keyed to landing.features translations. */
const CAPABILITIES = [
  { icon: HardDrive, key: "localFirst" as const },
  { icon: Cpu, key: "vectorSearch" as const },
  { icon: Shield, key: "auditTrail" as const },
  { icon: Sparkles, key: "streamingAI" as const },
  { icon: Globe, key: "i18nTheme" as const },
  { icon: HardDrive, key: "exportImport" as const },
];

/** Public features page showing agents, platform capabilities, and tech stack. */
export default function FeaturesPage() {
  const t = useTranslations("landing.features");
  const tLanding = useTranslations("landing");

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Agent features */}
      <section className="mt-14">
        <h2 className="text-center text-xl font-semibold">{t("agents")}</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">{t("agentsDesc")}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {AGENTS.map(({ key, Icon }) => {
            // Look up the stage accent chip class for the agent's primary stage.
            const accent = getStage(primaryStageForAgent(key))!.accent;
            return (
              <div key={key} className="cosmic-panel group rounded-xl p-5 transition-all hover:-translate-y-1">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", accent.chip)}>
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">{tLanding(`agentName.${key}` as "landing.agentName.topic")}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {tLanding(`agentDesc.${key}` as "landing.agentDesc.topic")}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Platform capabilities */}
      <section className="mt-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, key }) => (
            <div key={key} className="cosmic-panel rounded-xl p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{t(key)}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{t(`${key}Desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech stack */}
      <section className="mt-16 text-center">
        <div className="cosmic-panel mx-auto max-w-2xl rounded-2xl p-8">
          <h2 className="text-lg font-semibold">{t("techStack")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("techStackDesc")}</p>
          <Button asChild className="mt-5 gap-1.5 bg-blue-500 text-white hover:bg-blue-400">
            <Link href="/login">
              {tLanding("freeStart")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
