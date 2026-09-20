/**
 * Pricing Page (/(marketing)/pricing)
 *
 * Functionality:
 * - Public pricing page rendering free, pro, and team plan cards.
 * - Pulls plan names, features, and CTAs from localized messages.
 * - Highlights the popular plan and shows a token-pricing note and FAQ.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ArrowRight, Sparkles } from "lucide-react";

/** Public pricing page with plan cards, token note, and FAQ section. */
export default function PricingPage() {
  const t = useTranslations("landing.pricing");

  // Plan keys plus the accent/border classes applied to each card.
  const plans = [
    { key: "free" as const, accent: "border-border", bg: "" },
    { key: "pro" as const, accent: "border-blue-400/50 ring-1 ring-blue-400/30", bg: "bg-blue-500/5" },
    { key: "team" as const, accent: "border-violet-400/50", bg: "" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Plans */}
      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {plans.map(({ key, accent, bg }) => {
          // Assemble localized copy and feature list for each plan card.
          const plan = {
            name: t(`${key}.name`),
            price: t(`${key}.price`),
            period: t(`${key}.period`),
            desc: t(`${key}.desc`),
            features: t.raw(`${key}.features`) as string[],
            cta: t(`${key}.cta`),
            popular: key === "pro",
          };
          return (
            <div
              key={key}
              className={cn(
                "cosmic-panel relative flex flex-col rounded-2xl p-6 transition-all hover:-translate-y-1",
                accent,
                bg
              )}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full border border-blue-400/30 bg-blue-500/15 px-3 py-1 text-[11px] font-medium text-blue-200">
                  <Sparkles className="h-3 w-3" />
                  最受欢迎
                </span>
              )}
              <div className="mt-2">
                <h3 className="text-lg font-bold">{plan.name}</h3>
                <p className="mt-1 text-[12px] text-muted-foreground">{plan.desc}</p>
              </div>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className={cn(
                  "mt-8 w-full gap-1.5",
                  plan.popular
                    ? "bg-blue-500 text-white hover:bg-blue-400"
                    : "bg-muted text-foreground hover:bg-muted/80"
                )}
                variant={plan.popular ? "default" : "secondary"}
              >
                <Link href="/login">
                  {plan.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>

      {/* Token pricing note */}
      <div className="mt-10 text-center">
        <p className="mx-auto max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
          {t("tokenNote")}
        </p>
      </div>

      {/* FAQ */}
      <section className="mt-16">
        <h2 className="text-center text-xl font-semibold">{t("faq.title")}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(["q1", "q2", "q3"] as const).map((q) => (
            <div key={q} className="cosmic-panel rounded-xl p-5">
              <h3 className="text-sm font-semibold">{t(`faq.${q}`)}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{t(`faq.a${q.slice(1)}`)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
