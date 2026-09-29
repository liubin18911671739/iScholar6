/**
 * Accept Invite (/api/invites/accept)
 *
 * Verifies a signed invite token and sets the user's password.
 */

import { setUserPassword } from "@/lib/auth/users";
import { verifyInviteToken } from "@/lib/server/invite-token";

/** POST { token, password } — activate an invited account. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 8) {
    return Response.json({ ok: false, error: "WEAK_PASSWORD" }, { status: 400 });
  }

  const verified = verifyInviteToken(token);
  if (!verified) {
    return Response.json({ ok: false, error: "INVALID_TOKEN" }, { status: 400 });
  }

  const updated = await setUserPassword(verified.email, password);
  if (!updated) {
    return Response.json({ ok: false, error: "USER_NOT_FOUND" }, { status: 404 });
  }
  return Response.json({ ok: true, email: verified.email });
}
