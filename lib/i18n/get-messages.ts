/**
 * Message Loader (lib/i18n/get-messages.ts)
 *
 * Functionality:
 * - Imports the zh-CN and en-US JSON message trees and caches them.
 * - Normalizes bundler-wrapped JSON into a plain message tree.
 * - Resolves a requested locale to its messages, falling back to the default.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { Locale } from "./config";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./config";
import zhCN from "@/messages/zh-CN.json";
import enUS from "@/messages/en-US.json";

// Plain nested key/value message tree.
type MessageTree = Record<string, unknown>;

// Unwrap bundler-wrapped JSON (e.g. `{ default: {...} }`) into a message tree.
function unwrapMessages(mod: unknown): MessageTree {
  if (!mod || typeof mod !== "object") return {};
  const record = mod as MessageTree & { default?: unknown };
  // Some bundlers expose JSON as `{ default: {...} }`.
  if (record.default && typeof record.default === "object") {
    return record.default as MessageTree;
  }
  return record as MessageTree;
}

// Pre-resolved message trees keyed by locale.
const messageCache: Record<Locale, MessageTree> = {
  "zh-CN": unwrapMessages(zhCN),
  "en-US": unwrapMessages(enUS),
};

// Type guard for supported locale identifiers.
function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Return the cached message tree for a locale, falling back to the default. */
export function getMessages(locale: string = DEFAULT_LOCALE): MessageTree {
  const resolved = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return messageCache[resolved] ?? messageCache[DEFAULT_LOCALE];
}
