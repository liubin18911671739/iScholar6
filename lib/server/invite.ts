/**
 * Training invite helper (lib/server/invite.ts)
 *
 * Functionality:
 * - Resolves or creates a web-owned `users` row for an invited email.
 * - Mints a signed invite token and emails an accept link.
 *
 * Notes:
 * - Server-only. Email delivery is best-effort: `sent` is false when SMTP is
 *   unconfigured, but the user row and invite link are still created.
 */

import { findOrCreateUserByEmail } from "@/lib/auth/users";
import { createInviteToken } from "@/lib/server/invite-token";
import { sendMail } from "@/lib/server/smtp";

/** Result of an invite attempt. */
export interface InviteResult {
  ok: boolean;
  error?: string;
  userId?: string;
  created?: boolean;
  sent?: boolean;
  inviteUrl?: string;
}

/** Find/create a user and send them an invite link. */
export async function inviteUserByEmail(email: string): Promise<InviteResult> {
  const normalized = email.trim().toLowerCase();
  const user = await findOrCreateUserByEmail(normalized);
  if (!user) return { ok: false, error: "AUTH_DB_UNAVAILABLE" };

  const token = createInviteToken(normalized);
  if (!token) return { ok: false, error: "INVITE_TOKEN_UNAVAILABLE" };

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const inviteUrl = `${base}/accept-invite?token=${encodeURIComponent(token)}`;

  let sent = false;
  try {
    sent = await sendMail({
      to: normalized,
      subject: "You're invited to iScholar",
      text: [
        "You have been invited to iScholar — the AI-native research platform.",
        "",
        "Set your password to activate your account:",
        inviteUrl,
        "",
        "This link expires in 7 days. If you did not expect this email, ignore it.",
      ].join("\n"),
    });
  } catch (error) {
    console.error("[invite] failed to send invite email", error);
  }

  return { ok: true, userId: user.id, created: user.created, sent, inviteUrl };
}
