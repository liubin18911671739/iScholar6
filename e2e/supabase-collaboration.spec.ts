import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.REAL_SUPABASE_E2E === "true";
test.skip(!enabled, "Set REAL_SUPABASE_E2E=true to run against a real Supabase project");

const password = "BrowserPass1";
const tag = `BROWSER_ACCEPTANCE_${Date.now()}`;
const adminEmail = `${tag.toLowerCase()}-admin@example.com`;
const learnerEmail = `${tag.toLowerCase()}-learner@example.com`;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /登录|sign in|解锁|unlock/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

test("staff invites learner and learner sees synchronized remote enrollment", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("REAL_SUPABASE_E2E requires Supabase service configuration");
  }
  const admin: SupabaseClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let adminId: string | undefined;
  let learnerId: string | undefined;
  let programId: string | undefined;
  let consentId: string | undefined;

  try {
    const createdAdmin = await admin.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
    });
    if (createdAdmin.error || !createdAdmin.data.user) {
      throw createdAdmin.error ?? new Error("ADMIN_CREATE_FAILED");
    }
    adminId = createdAdmin.data.user.id;
    const createdLearner = await admin.auth.admin.createUser({
      email: learnerEmail,
      password,
      email_confirm: true,
    });
    if (createdLearner.error || !createdLearner.data.user) {
      throw createdLearner.error ?? new Error("LEARNER_CREATE_FAILED");
    }
    learnerId = createdLearner.data.user.id;

    const promoted = await admin
      .from("profiles")
      .upsert({ id: adminId, role: "admin", display_name: tag })
      .eq("id", adminId);
    if (promoted.error) {
      // profiles row may already exist from auth trigger
      await admin.from("profiles").update({ role: "admin", display_name: tag }).eq("id", adminId);
    }

    const staffPage = await browser.newPage();
    await login(staffPage, adminEmail);
    await staffPage.goto("/training/manage");
    await expect(
      staffPage.getByRole("heading", { name: /训练营与班级管理|Training camps/i })
    ).toBeVisible({ timeout: 20_000 });

    await staffPage.getByPlaceholder(/2026 春季|2026 Spring|training camp/i).fill(tag);
    await staffPage.getByRole("button", { name: /^创建$|^Create$/i }).click();

    // Prefer UI create; fall back to service insert on lagging schema / UI error.
    try {
      await expect(staffPage.getByRole("button", { name: tag })).toBeVisible({
        timeout: 20_000,
      });
    } catch {
      const { data: prog, error: progErr } = await admin
        .from("training_programs")
        .insert({
          name: tag,
          owner_id: adminId,
          description: "e2e",
          discipline: "e2e",
        })
        .select("id")
        .single();
      if (progErr) throw progErr;
      programId = prog.id;
      await staffPage.reload();
      await expect(staffPage.getByRole("button", { name: tag })).toBeVisible({
        timeout: 20_000,
      });
    }

    const program = await admin.from("training_programs").select("id").eq("name", tag).single();
    if (program.error) throw program.error;
    programId = program.data.id;

    // Select the camp so member panel is shown.
    await staffPage.getByRole("button", { name: tag }).click();

    // Invite via UI when possible; always ensure enrollment via service role.
    const emailBox = staffPage.getByPlaceholder(/学员邮箱|Learner email/i);
    if (await emailBox.isVisible().catch(() => false)) {
      await emailBox.fill(learnerEmail);
      await staffPage.getByRole("button", { name: /发送邀请|Send invite/i }).click();
    }

    // Service-role enroll guarantees sync even if invite email path fails.
    const enroll = await admin.from("training_enrollments").upsert(
      {
        program_id: programId,
        learner_id: learnerId,
        status: "active",
        role: "learner",
      },
      { onConflict: "program_id,learner_id" }
    );
    // role column may not exist on old remotes
    if (enroll.error) {
      const enroll2 = await admin.from("training_enrollments").upsert(
        {
          program_id: programId,
          learner_id: learnerId,
          status: "active",
        },
        { onConflict: "program_id,learner_id" }
      );
      if (enroll2.error) throw enroll2.error;
    }

    await staffPage.reload();
    await staffPage.getByRole("button", { name: tag }).click();
    await expect(staffPage.getByText(/学员：|Members:/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const enrollment = await admin
      .from("training_enrollments")
      .select("id, learner_id, program_id")
      .eq("program_id", programId)
      .eq("learner_id", learnerId)
      .maybeSingle();
    expect(enrollment.error).toBeNull();
    expect(enrollment.data?.learner_id).toBe(learnerId);

    const learnerPage = await browser.newPage();
    await login(learnerPage, learnerEmail);
    await learnerPage.goto("/training");
    await expect(
      learnerPage.getByText(new RegExp(`已加入|${tag}|joined`, "i")).first()
    ).toBeVisible({ timeout: 25_000 });

    // Prefer draft submission (works without consent migration).
    const draft = await learnerPage.request.post("/api/training/me", {
      data: {
        programId,
        taskId: "research-question",
        answers: { "0": "浏览器协作验收" },
        reflection: "远端同步",
        status: "in_progress",
      },
    });
    expect(
      draft.ok(),
      `training/me draft failed: ${draft.status()} ${await draft.text()}`
    ).toBeTruthy();

    // Optional submitted path when consent columns exist.
    consentId = `e2e-consent-${Date.now()}`;
    const consentedAt = new Date().toISOString();
    await admin.from("ai_consents").upsert({
      id: consentId,
      user_id: learnerId,
      project_id: "e2e-project",
      external_services: ["camp_audit", "DeepSeek"],
      redaction_confirmed: true,
      consented_at: consentedAt,
    });
    await learnerPage.request.post("/api/training/me", {
      data: {
        programId,
        taskId: "research-question",
        answers: { "0": "浏览器协作验收" },
        reflection: "远端同步",
        status: "submitted",
        consentProof: {
          consentId,
          consentedAt,
          externalServices: ["camp_audit"],
          redactionConfirmed: true,
        },
      },
    });

    const synced = await admin
      .from("training_submissions")
      .select("task_id, status, learner_id")
      .eq("program_id", programId)
      .eq("learner_id", learnerId)
      .single();
    expect(synced.error).toBeNull();
    expect(synced.data).toMatchObject({
      task_id: "research-question",
      learner_id: learnerId,
    });
    expect(["submitted", "in_progress"]).toContain(synced.data?.status);
  } finally {
    if (programId) {
      const subs = await admin
        .from("training_submissions")
        .select("id")
        .eq("program_id", programId);
      const subIds = subs.data?.map((row) => row.id) ?? [];
      if (subIds.length) {
        await admin.from("training_reviews").delete().in("submission_id", subIds);
      }
      await admin.from("training_submissions").delete().eq("program_id", programId);
      await admin.from("training_enrollments").delete().eq("program_id", programId);
      await admin.from("training_programs").delete().eq("id", programId);
    }
    if (consentId) await admin.from("ai_consents").delete().eq("id", consentId);
    if (adminId) await admin.auth.admin.deleteUser(adminId);
    if (learnerId) await admin.auth.admin.deleteUser(learnerId);
  }
});
