/**
 * Top Bar (components/layouts/top-bar.tsx)
 *
 * Functionality:
 * - Renders the app header with a mobile menu toggle, language switcher, logout, and user menu.
 * - Switches the active locale through the locale store and lists supported locales.
 * - Signs out via the Supabase browser client and redirects to `/login`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, User, LogOut, Settings, Globe } from "lucide-react";
import Link from "next/link";
import { useLocaleStore } from "@/lib/stores/locale-store";
import type { Locale } from "@/lib/i18n/config";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";

/** Props for the top bar, exposing the mobile menu toggle handler. */
interface TopBarProps {
  onMenuToggle?: () => void;
}

// Human-readable labels for each supported locale code.
const LOCALE_LABELS: Record<string, string> = {
  "zh-CN": "中文",
  "en-US": "English",
};

/** Application top bar with locale switching, logout, and user settings access. */
export function TopBar({ onMenuToggle }: TopBarProps) {
  const router = useRouter();
  const t = useTranslations("topbar");
  const tNav = useTranslations("nav");
  const { locale, setLocale } = useLocaleStore();

  // Sign out of Supabase (when configured) and return to the login screen.
  function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMenuToggle}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" title="Language">
              <Globe className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {SUPPORTED_LOCALES.map((loc) => (
              <DropdownMenuItem
                key={loc}
                onClick={() => setLocale(loc as Locale)}
                className={locale === loc ? "bg-accent" : ""}
              >
                {LOCALE_LABELS[loc]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" onClick={handleLogout} title={t("lock")} aria-label={t("lock")}>
          <LogOut className="h-5 w-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <User className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{t("localUser")}</p>
              <p className="text-xs text-muted-foreground">
                {t("browserOnly")}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="mr-2 h-4 w-4" />
                {tNav("settings")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              {t("lock")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
