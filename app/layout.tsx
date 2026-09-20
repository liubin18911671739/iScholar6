/**
 * Root Layout (app/layout.tsx)
 *
 * Functionality:
 * - Wraps every route with the global provider stack: service-worker
 *   registration, tooltip, theme, and i18n.
 * - Server-loads the full locale catalog so client training/peer namespaces
 *   always resolve, then exposes it through I18nProvider.
 * - Declares site metadata (title/description) and mounts the global Toaster.
 *
 * Notes:
 * - `locale` is fixed to DEFAULT_LOCALE here; client-side locale switching is
 *   handled by I18nProvider / locale store.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { ServiceWorkerRegister } from "@/components/providers/sw-register";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getMessages } from "@/lib/i18n/get-messages";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import type { AbstractIntlMessages } from "next-intl";
import "./globals.css";

/** Default Next.js document metadata (browser tab title + SEO description). */
export const metadata: Metadata = {
  title: "iScholar · AI科研平台",
  description:
    "AI原生学术科研平台，配备七大专业智能体",
};

/** Applies the global provider shell and injects locale messages into the tree. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-load full catalogs so client training/peer namespaces always resolve.
  // (Avoid relying solely on client JSON import interop.)
  const locale = DEFAULT_LOCALE;
  const messages = getMessages(locale) as AbstractIntlMessages;

  return (
    <html lang={locale} data-theme="dark" className="dark" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ServiceWorkerRegister />
        <TooltipProvider delayDuration={300}>
          <ThemeProvider>
            <I18nProvider initialLocale={locale} initialMessages={messages}>
              {children}
              <Toaster richColors position="top-right" />
            </I18nProvider>
          </ThemeProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
