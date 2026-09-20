import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) throw new Error("Supabase service configuration is missing");
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const tag = `E2E_SIMULATION_${Date.now()}`;
const adminEmail = `${tag.toLowerCase()}-admin@example.com`;
const learnerEmail = `${tag.toLowerCase()}-learner@example.com`;
let adminId; let learnerId; let programId; let submissionId;

try {
  let result = await admin.auth.admin.createUser({ email: adminEmail, password: "SimulationPass1", email_confirm: true });
  if (result.error) throw result.error;
  adminId = result.data.user.id;
  result = await admin.auth.admin.createUser({ email: learnerEmail, password: "SimulationPass1", email_confirm: true });
  if (result.error) throw result.error;
  learnerId = result.data.user.id;
  result = await admin.from("profiles").update({ role: "admin", display_name: `${tag} admin` }).eq("id", adminId);
  if (result.error) throw result.error;
  result = await admin.from("training_programs").insert({ name: tag, discipline: "simulation", owner_id: adminId }).select().single();
  if (result.error) throw result.error;
  programId = result.data.id;
  result = await admin.from("training_enrollments").insert({ program_id: programId, learner_id: learnerId }).select().single();
  if (result.error) throw result.error;
  result = await admin.from("training_submissions").insert({ program_id: programId, task_id: tag, learner_id: learnerId, answers: { answer: "simulated evidence" }, reflection: "simulated reflection", status: "submitted" }).select().single();
  if (result.error) throw result.error;
  submissionId = result.data.id;
  const authClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  result = await authClient.auth.signInWithPassword({ email: adminEmail, password: "SimulationPass1" });
  if (result.error) throw result.error;
  result = await authClient.rpc("review_training_submission", { p_submission_id: submissionId, p_decision: "needs_revision", p_feedback: "simulated review", p_score: 80 });
  if (result.error) throw result.error;
  console.log(JSON.stringify({ supabase: { auth: true, users: 2, program: true, enrollment: true, submission: true, atomicReview: true }, tag }));

  if (!process.env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is missing");
  const response = await fetch(process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }, body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat", stream: false, max_tokens: 32, messages: [{ role: "user", content: "Reply with exactly: SIMULATION_OK" }] }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`DeepSeek request failed: ${response.status}`);
  console.log(JSON.stringify({ deepseek: { ok: true, response: payload.choices?.[0]?.message?.content ?? "", usage: payload.usage ?? null } }));
} finally {
  if (submissionId) await admin.from("training_reviews").delete().eq("submission_id", submissionId);
  if (programId) { await admin.from("training_submissions").delete().eq("program_id", programId); await admin.from("training_enrollments").delete().eq("program_id", programId); await admin.from("training_programs").delete().eq("id", programId); }
  if (adminId) await admin.auth.admin.deleteUser(adminId);
  if (learnerId) await admin.auth.admin.deleteUser(learnerId);
}
