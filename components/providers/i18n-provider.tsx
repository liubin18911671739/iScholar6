/**
 * I18n Provider (components/providers/i18n-provider.tsx)
 *
 * Functionality:
 * - Wraps the app in next-intl's client provider for the active locale.
 * - Prefers server-resolved locale/messages on first paint and switches via the Zustand locale store.
 * - Syncs `document.documentElement.lang`, memoizes messages, and swallows missing key errors in production.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useEffect, useMemo } from "react";
import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import type { ReactNode } from "react";
import { useLocaleStore } from "@/lib/stores/locale-store";
import { getMessages } from "@/lib/i18n/get-messages";
import type { Locale } from "@/lib/i18n/config";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/i18n/config";

/** Props for the i18n provider, including optional server-resolved locale/messages. */
interface Props {
  children: ReactNode;
  /** Server-resolved locale (preferred on first paint). */
  initialLocale?: Locale;
  /** Server-loaded message tree (avoids client JSON interop edge cases). */
  initialMessages?: AbstractIntlMessages;
}

/** Coerces an arbitrary value to a supported locale, defaulting when unknown. */
function resolveLocale(value: string | undefined): Locale {
  if (value && (SUPPORTED_LOCALES as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Provides next-intl messages for the active locale.
 * Prefers server-passed messages for the initial locale; switches via Zustand.
 */
export function I18nProvider({ children, initialLocale, initialMessages }: Props) {
  const storedLocale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const locale = resolveLocale(storedLocale || initialLocale);

  useEffect(() => {
    if (initialLocale && storedLocale !== initialLocale && !storedLocale) {
      setLocale(initialLocale);
    }
    // Sync html lang with active locale.
    document.documentElement.lang = locale;
  }, [initialLocale, locale, setLocale, storedLocale]);

  const messages = useMemo(() => {
    // When user hasn't switched locale, prefer the server-serialized tree.
    if (initialMessages && locale === resolveLocale(initialLocale)) {
      return initialMessages;
    }
    return getMessages(locale) as AbstractIntlMessages;
  }, [initialLocale, initialMessages, locale]);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="Asia/Shanghai"
      onError={(error) => {
        // Surface missing keys in dev without crashing the tree.
        if (process.env.NODE_ENV !== "production") {
          console.warn("[i18n]", error.code, error.message);
        }
      }}
      getMessageFallback={({ namespace, key }) =>
        namespace ? `${namespace}.${key}` : key
      }
    >
      {children}
    </NextIntlClientProvider>
  );
}
