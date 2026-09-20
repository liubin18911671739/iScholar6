/**
 * Docs Page (/(marketing)/docs)
 *
 * Functionality:
 * - Public documentation landing page with a quick-start section and cards.
 * - Renders localized doc card links plus an architecture highlight and CTA.
 *
 * Notes:
 * - Content strings come from the landing.docs / landing message namespaces.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Code,
  Rocket,
  FileText,
  Shapes,
  ArrowRight,
  Zap,
} from "lucide-react";

/** Static table of documentation cards mapping icons and i18n keys to links. */
const DOC_CARDS = [
  { icon: Zap, key: "quickStart" as const, href: "/login" },
  { icon: BookOpen, key: "userGuide" as const, href: "/login" },
  { icon: Code, key: "devGuide" as const, href: "/login" },
  { icon: Rocket, key: "deployGuide" as const, href: "/login" },
  { icon: FileText, key: "examples" as const, href: "/login" },
];

/** Public documentation page composed of quick-start, doc cards, and CTA sections. */
export default function DocsPage() {
  const t = useTranslations("landing.docs");
  const tLanding = useTranslations("landing");

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Quick start */}
      <section className="mt-12">
        <div className="cosmic-panel rounded-2xl p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300">
              <Zap className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{t("quickStart")}</h2>
              <p className="text-sm text-muted-foreground">{t("quickStartDesc")}</p>
            </div>
          </div>
          <ol className="mt-6 space-y-3">
            {(t.raw("quickStartSteps") as string[]).map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[11px] font-bold text-blue-300">
                  {i + 1}
                </span>
                <span className="text-muted-foreground pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Doc cards */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOC_CARDS.map(({ icon: Icon, key, href }) => (
          <Link
            key={key}
            href={href}
            className="cosmic-panel group rounded-xl p-5 transition-all hover:-translate-y-1 hover:border-blue-400/30"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300 group-hover:bg-blue-500/20 transition-colors">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-3.5 text-sm font-semibold">{t(key)}</h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              {t(`${key}Desc`)}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-[11px] text-blue-300 opacity-0 transition-opacity group-hover:opacity-100">
              {t("readDocs")}
              <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        ))}

        {/* Architecture card */}
        <div className="cosmic-panel rounded-xl p-5 sm:col-span-2 lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
              <Shapes className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">{t("architecture")}</h3>
              <p className="text-[12px] text-muted-foreground">{t("architectureDesc")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mt-14 text-center">
        <div className="cosmic-panel mx-auto max-w-xl rounded-2xl bg-gradient-to-br from-blue-500/10 to-violet-500/10 p-8">
          <h2 className="text-lg font-semibold">{tLanding("ctaCard")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {tLanding("introDetail")}
          </p>
          <Button asChild size="lg" className="mt-5 gap-2 bg-blue-500 text-white hover:bg-blue-400 glow-cyan">
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
