import { getRequestConfig } from "next-intl/server";
import { getMessages } from "@/lib/i18n/get-messages";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import type { Locale } from "@/lib/i18n/config";

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = ((await requestLocale) ?? DEFAULT_LOCALE) as Locale;
  return {
    locale,
    messages: getMessages(locale),
  };
});
