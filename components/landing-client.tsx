/**
 * Landing Client (components/landing-client.tsx)
 *
 * Functionality:
 * - Renders the public marketing landing page: top nav, hero, agent grid, and footer.
 * - Draws the Big Dipper constellation that links each of the seven AI agents to the login entry point.
 * - Pulls localized copy from the next-intl `landing` namespace and highlights DataPilot as the featured agent.
 *
 * Notes:
 * - All calls to action route to `/login`; star coordinates are hard-coded for the 800x420 viewBox.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  ArrowRight,
  ArrowUpRight,
  Search,
  BookOpen,
  FlaskConical,
  Database,
  FileText,
  Send,
  MessageSquare,
  Sparkles,
} from "lucide-react";

/** Union of the seven built-in agent keys showcased on the landing page. */
type AgentKey = "topic" | "litreview" | "design" | "data" | "write" | "submit" | "rebuttal";

// Ordered agent metadata (key, icon, Chinese/English star names) reused by the constellation and grid.
const AGENTS: {
  key: AgentKey;
  Icon: React.ComponentType<{ className?: string }>;
  star: string;
  starEn: string;
}[] = [
  { key: "topic", Icon: Search, star: "摇光", starEn: "Alkaid η" },
  { key: "litreview", Icon: BookOpen, star: "开阳", starEn: "Mizar ζ" },
  { key: "design", Icon: FlaskConical, star: "玉衡", starEn: "Alioth ε" },
  { key: "data", Icon: Database, star: "天权", starEn: "Megrez δ" },
  { key: "write", Icon: FileText, star: "天玑", starEn: "Phecda γ" },
  { key: "submit", Icon: Send, star: "天璇", starEn: "Merak β" },
  { key: "rebuttal", Icon: MessageSquare, star: "天枢", starEn: "Dubhe α" },
];

// Big Dipper star positions along the workflow (handle → bowl), viewBox 0 0 800 420
const STAR_POINTS: Record<AgentKey, { x: number; y: number }> = {
  topic: { x: 110, y: 330 },
  litreview: { x: 225, y: 255 },
  design: { x: 340, y: 200 },
  data: { x: 445, y: 150 },
  write: { x: 470, y: 275 },
  submit: { x: 620, y: 300 },
  rebuttal: { x: 665, y: 160 },
};

// Handle edges of the Big Dipper connecting adjacent stars along the workflow.
const HANDLE_LINES: [AgentKey, AgentKey][] = [
  ["topic", "litreview"],
  ["litreview", "design"],
  ["design", "data"],
];
// Bowl edges of the Big Dipper closing the constellation loop.
const BOWL_LINES: [AgentKey, AgentKey][] = [
  ["data", "write"],
  ["write", "submit"],
  ["submit", "rebuttal"],
  ["rebuttal", "data"],
];

// Shared accent class names for the IBM-styled agent chips and links.
const IBM_AGENT_ACCENT = {
  text: "text-blue-200",
  chip: "border border-blue-400/35 bg-blue-500/20 text-blue-100",
};

/** Renders the interactive SVG Big Dipper linking the seven agents to login. */
function Constellation() {
  const allLines = [...HANDLE_LINES, ...BOWL_LINES];
  return (
    <svg
      viewBox="0 0 800 420"
      className="h-full w-full"
      role="img"
      aria-label="Big Dipper constellation of 7 AI agents"
    >
      <defs>
        <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="45%" stopColor="rgba(15,98,254,0.62)" />
          <stop offset="100%" stopColor="rgba(15,98,254,0)" />
        </radialGradient>
      </defs>

      {/* connecting lines */}
      {allLines.map(([a, b], i) => (
        <line
          key={i}
          x1={STAR_POINTS[a].x}
          y1={STAR_POINTS[a].y}
          x2={STAR_POINTS[b].x}
          y2={STAR_POINTS[b].y}
          stroke="rgba(141,191,255,0.48)"
          strokeWidth={1.5}
          strokeDasharray={i >= HANDLE_LINES.length ? "0" : "0"}
        />
      ))}

      {/* stars */}
      {AGENTS.map(({ key, star, starEn }) => {
        const { x, y } = STAR_POINTS[key];
        return (
          <Link key={key} href="/login" className="group">
            <g className="cursor-pointer">
              <circle cx={x} cy={y} r={26} fill="url(#starGlow)" opacity={0.55} className="transition-opacity group-hover:opacity-90" />
              <circle cx={x} cy={y} r={5.5} fill="#0f62fe" className="transition-all group-hover:r-[7]" />
              <circle cx={x} cy={y} r={2.2} fill="#fff" />
              <text
                x={x}
                y={y - 18}
                textAnchor="middle"
                className="fill-foreground/90 text-[13px] font-semibold transition-opacity opacity-0 group-hover:opacity-100"
                style={{ fontFamily: "ui-sans-serif, system-ui" }}
              >
                {star}
              </text>
              <text
                x={x}
                y={y + 30}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
                style={{ fontFamily: "ui-sans-serif, system-ui" }}
              >
                {starEn}
              </text>
            </g>
          </Link>
        );
      })}
    </svg>
  );
}

/** Public landing page composing the nav, hero constellation, agent grid, and footer. */
export function LandingClient() {
  const t = useTranslations("landing");
  const featured = AGENTS.find((a) => a.key === "data")!;

  const navLinks = [
    { label: t("nav.agents"), href: "/" },
    { label: t("nav.features"), href: "/features" },
    { label: t("nav.pricing"), href: "/pricing" },
    { label: t("nav.docs"), href: "/docs" },
  ];

  return (
    <div className="cosmic-bg relative min-h-screen overflow-hidden text-foreground">
      {/* Top nav */}
      <header className="relative z-20">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-baseline gap-2">
            <Rocket className="h-6 w-6 self-center text-blue-200" />
            <span className="text-xl font-bold tracking-tight">iScholar</span>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              scholar.yiyun.chat
            </span>
          </div>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {navLinks.map((l) => (
              <Link key={l.label} href={l.href} className="transition-colors hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              {t("login")}
            </Link>
            <Button asChild className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/login">
                {t("explore")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-10 pt-8 lg:pt-12">
        <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
          {/* Left: copy */}
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300/45 bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-100">
              <Sparkles className="h-3.5 w-3.5" />
              {t("aiPlatform")}
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {t("fromIdeaToPaper")}
              <span className="mt-2 block bg-gradient-to-r from-white via-blue-100 to-blue-300 bg-clip-text text-transparent">
                {t("sevenAgents")}
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground lg:mx-0">
              {t("intro")}
              <br />
              {t("introDetail")}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Button asChild size="lg" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan">
                <Link href="/login">
                  {t("freeStart")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-blue-300/45 bg-card/95 text-foreground hover:bg-accent hover:text-accent-foreground">
                <a href="#agents">{t("exploreAgents")}</a>
              </Button>
            </div>
          </div>

          {/* Right: constellation + featured panel */}
          <div className="relative">
            <div className="mx-auto aspect-[800/420] w-full max-w-2xl">
              <Constellation />
            </div>

            <div className="cosmic-panel glow-blue mx-auto mt-2 max-w-md rounded-2xl p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-400/35 bg-blue-500/20 text-blue-100">
                  <featured.Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {featured.star} · DataPilot
                  </p>
                  <p className="text-[11px] text-muted-foreground">{featured.starEn}</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 text-[12px] text-muted-foreground">
                {(t.raw("featured.bullets") as string[]).map((b, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-blue-200" />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <Button asChild size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                  <Link href="/login">
                    {t("enterAgent")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="border-blue-300/45 bg-card/95 text-foreground hover:bg-accent hover:text-accent-foreground">
                  <a href="#agents">{t("resetAgent")}</a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Agent grid */}
      <section id="agents" className="relative z-10 mx-auto max-w-7xl px-6 py-14">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("sevenProAgents")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("constellationHint")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {AGENTS.map(({ key, Icon, star, starEn }) => {
            return (
              <Link
                key={key}
                href="/login"
                className="cosmic-panel group rounded-xl p-5 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30"
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${IBM_AGENT_ACCENT.chip}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <ArrowUpRight className={`h-4 w-4 opacity-60 transition-opacity group-hover:opacity-100 ${IBM_AGENT_ACCENT.text}`} />
                </div>
                <h3 className="mt-3.5 text-sm font-semibold">{t(`agentName.${key}`)}</h3>
                <p className={`text-[11px] ${IBM_AGENT_ACCENT.text}`}>{star} · {starEn}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {t(`agentDesc.${key}`)}
                </p>
              </Link>
            );
          })}

          {/* CTA card */}
          <div className="cosmic-panel flex flex-col items-start justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-300/10 p-5">
            <Sparkles className="h-6 w-6 text-blue-200" />
            <p className="mt-3 text-sm font-semibold">{t("ctaCard")}</p>
            <Button asChild size="sm" className="mt-3 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/login">
                {t("freeStart")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-blue-200" />
            <span>iScholar v6.0 — AI-native academic research platform</span>
          </div>
          <span>© 2026 iScholar · 学伴智枢</span>
        </div>
      </footer>
    </div>
  );
}
