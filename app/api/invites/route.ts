/**
 * Training Invites (/api/invites)
 *
 * Staff-only: resolves/creates a web-owned user and emails a signed accept link.
 */

import { auth } from "@/lib/auth";
import { inviteUserByEmail } from "@/lib/server/invite";

/** POST { email } — invite a learner/staff by email (staff only). */
export async function POST(req: Request) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id) {
    return Response.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (role !== "admin" && role !== "librarian") {
    return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ ok: false, error: "INVALID_EMAIL" }, { status: 400 });
  }

  const result = await inviteUserByEmail(email);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 503 });
  }
  return Response.json({
    ok: true,
    userId: result.userId,
    invited: result.created,
    sent: result.sent,
  });
}
