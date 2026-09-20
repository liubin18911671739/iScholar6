/**
 * Shared UI utilities (lib/utils.ts)
 *
 * Functionality:
 * - Exposes `cn`, the canonical Tailwind class-name merger used across all
 *   components: combines clsx conditional classes with tailwind-merge so later
 *   conflicting utilities win deterministically.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names and de-duplicate conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
