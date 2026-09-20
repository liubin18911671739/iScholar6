/**
 * Marketing Layout (/(marketing))
 *
 * Functionality:
 * - Client shell wrapping public marketing pages (features, pricing, docs).
 * - Renders the top navigation, page content slot, and site footer.
 * - Localizes nav labels and CTAs via next-intl.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Rocket, ArrowRight } from "lucide-react";

/** Public marketing shell with navigation header, content area, and footer. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("landing");

  // Top navigation entries shared between the header and footer.
  const navLinks = [
    { label: t("nav.agents"), href: "/" },
    { label: t("nav.features"), href: "/features" },
    { label: t("nav.pricing"), href: "/pricing" },
    { label: t("nav.docs"), href: "/docs" },
  ];

  return (
    <div className="cosmic-bg relative min-h-screen overflow-hidden text-foreground">
      {/* Top nav */}
      <header className="relative z-20 border-b border-border/30">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-baseline gap-2 hover:opacity-80 transition-opacity">
              <Rocket className="h-6 w-6 self-center text-blue-300" />
              <span className="text-xl font-bold tracking-tight">iScholar</span>
            </Link>
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
            <Button asChild className="gap-1.5 bg-blue-500 text-white hover:bg-blue-400">
              <Link href="/login">
                {t("freeStart")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="relative z-10">{children}</main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-blue-300" />
            <span>iScholar v6.0 — AI-native academic research platform</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/features" className="hover:text-foreground transition-colors">{t("nav.features")}</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">{t("nav.pricing")}</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">{t("nav.docs")}</Link>
            <span>© 2026 iScholar · 学伴智枢</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
