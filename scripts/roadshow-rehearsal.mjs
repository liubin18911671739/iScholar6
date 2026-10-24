#!/usr/bin/env node

/** Run a real browser rehearsal of the research-plan workflow and save evidence. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import bcrypt from "bcryptjs";
import pg from "pg";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const { Pool } = pg;
const root = resolve(import.meta.dirname, "..");
const demoMode = process.argv[2] === "--demo";
const evidenceDir = resolve(root, demoMode ? "doc/roadshow-demo-playback" : "doc/roadshow-evidence");
const baseURL = "http://127.0.0.1:3110";
const now = new Date();
const startedAt = now.toISOString();
const projectName = `iScholar 路演预演 ${startedAt.slice(0, 16).replace(/[:T]/g, "-")}`;
const researchInput = {
  researchGoal: "探讨生成式 AI 辅助反馈对大学生学术写作修订质量的影响",
  discipline: "教育技术",
  keywords: "生成式 AI, 反馈, 学术写作",
};
const staff = {
  email: "e2e-staff@ischolar.test",
  password: "TestPass1",
  name: "E2E Staff",
  role: "librarian",
};

function parseEnv(source) {
  const values = {};
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[line.slice(0, eq).trim()] = value;
  }
  return values;
}

function hostAuthUrl(env) {
  const raw = env.E2E_AUTH_DATABASE_URL || env.AUTH_DATABASE_URL;
  if (!raw) throw new Error("AUTH_DATABASE_URL is missing from .env");
  const url = new URL(raw);
  if (["postgres", "localhost"].includes(url.hostname)) {
    url.hostname = "127.0.0.1";
    if (env.POSTGRES_PORT) url.port = env.POSTGRES_PORT;
  }
  return url.toString();
}

async function seedDemoStaff(connectionString) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const hash = await bcrypt.hash(staff.password, 12);
    await pool.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role, name = EXCLUDED.name`,
      [staff.email, staff.name, hash, staff.role],
    );
  } finally {
    await pool.end();
  }
}

async function waitForWebServer(server, logs) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited early (${server.exitCode}): ${logs.join("").slice(-4000)}`);
    try {
      const response = await fetch(`${baseURL}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Server is still booting.
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for Next.js: ${logs.join("").slice(-4000)}`);
}

async function waitForRunDetail(page, runId) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    const response = await page.request.get(`${baseURL}/api/agent/runs/${runId}`);
    if (response.ok()) {
      const payload = await response.json();
      return payload.data ?? payload;
    }
    lastError = `${response.status()} ${await response.text()}`;
    await delay(1000);
  }
  throw new Error(`Unable to fetch completed run ${runId}: ${lastError}`);
}

await mkdir(evidenceDir, { recursive: true });
const env = { ...process.env, ...parseEnv(await readFile(resolve(root, ".env"), "utf8")) };
env.AUTH_DATABASE_URL = hostAuthUrl(env);
env.AUTH_URL = baseURL;
env.AUTH_TRUST_HOST = "true";
env.BACKEND_INTERNAL_URL = "http://127.0.0.1:8000";
env.NODE_ENV = "development";

const databaseConnectionString = env.AUTH_DATABASE_URL;
await seedDemoStaff(databaseConnectionString);

const serverLogs = [];
const server = spawn("pnpm", ["exec", "next", "dev", "-H", "127.0.0.1", "-p", "3110"], {
  cwd: root,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => serverLogs.push(chunk.toString()));
server.stderr.on("data", (chunk) => serverLogs.push(chunk.toString()));

let browser;
const evidence = {
  schemaVersion: 1,
  startedAt,
  projectName,
  environment: "local Docker backend + local Next.js development server",
  demoAccount: staff.email,
  input: researchInput,
  checkpoints: [],
  run: null,
};

try {
  await waitForWebServer(server, serverLogs);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    if (dialog.type() === "confirm") await dialog.accept();
    else await dialog.dismiss();
  });

  await page.goto(`${baseURL}/login`);
  const csrfResponse = await page.request.get(`${baseURL}/api/auth/csrf`);
  const { csrfToken } = await csrfResponse.json();
  const loginResponse = await page.request.post(`${baseURL}/api/auth/callback/credentials`, {
    form: { email: staff.email, password: staff.password, csrfToken, callbackUrl: "/projects" },
    maxRedirects: 0,
  });
  if (![200, 302, 303].includes(loginResponse.status())) {
    throw new Error(`Demo account login failed with status ${loginResponse.status()}`);
  }
  await page.goto(`${baseURL}/projects`);
  await page.getByTestId("new-project").waitFor({ timeout: 20_000 });
  let projectId;
  let runId;
  const resumeRunId = demoMode ? process.argv[3] : process.argv[2];
  const resumeProjectId = demoMode ? process.argv[4] : process.argv[3];
  if (demoMode && (!resumeRunId || !resumeProjectId)) {
    throw new Error("Usage: pnpm roadshow:demo -- <completed-run-id> <project-id>");
  }
  if (resumeRunId && resumeProjectId) {
    runId = resumeRunId;
    projectId = resumeProjectId;
    evidence.projectId = projectId;
    if (demoMode) {
      evidence.projectName = "已完成运行快速演示";
    } else {
      const previous = JSON.parse(await readFile(resolve(evidenceDir, "rehearsal-data.json"), "utf8"));
      if (previous.projectId === projectId) {
        evidence.projectName = previous.projectName;
        evidence.input = previous.input ?? researchInput;
        evidence.checkpoints = (previous.checkpoints ?? []).filter((checkpoint) =>
          ["00-project-created.png", "01-research-input.png", "02-topic-approval.png", "03-final-approval.png"].includes(checkpoint.screenshot)
        );
      }
    }
    const current = await waitForRunDetail(page, runId);
    evidence.input = current.input ?? evidence.input;
    if (demoMode && current.status !== "succeeded") {
      throw new Error(`Quick demo requires a completed run; current status=${current.status}`);
    }
    await page.goto(`${baseURL}/projects/${projectId}/research-plan?runId=${encodeURIComponent(runId)}`);
    if (current.status === "succeeded") {
      await page.getByText("协作完成，产物已入库。", { exact: true }).waitFor({ timeout: 60_000 });
    } else {
      await page.waitForSelector('[data-testid="workflow-approve-final"]', { timeout: 60_000 });
      await page.screenshot({ path: resolve(evidenceDir, "03-final-approval.png"), fullPage: false });
      evidence.checkpoints.push({ name: "最终方案终审", screenshot: "03-final-approval.png", url: page.url() });
    }
  } else {
    await page.getByTestId("new-project").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /社科|social sciences/i }).first().click();
    await dialog.getByRole("button", { name: /^下一步$|^next$/i }).click();
    await dialog.getByRole("button", { name: /定性|qualitative/i }).first().click();
    await dialog.getByRole("button", { name: /^下一步$|^next$/i }).click();
    await dialog.getByRole("button", { name: /^下一步$|^next$/i }).click();
    await dialog.getByTestId("project-name").fill(projectName);
    await dialog.getByTestId("create-project").click();
    await page.waitForURL(/\/projects\/[^/]+\/topic/, { timeout: 20_000 });
    projectId = page.url().match(/\/projects\/([^/]+)/)?.[1];
    if (!projectId) throw new Error("Project id missing after project creation");
    evidence.projectId = projectId;
    await page.screenshot({ path: resolve(evidenceDir, "00-project-created.png"), fullPage: false });
    evidence.checkpoints.push({ name: "项目已创建", screenshot: "00-project-created.png", url: page.url() });

    await page.goto(`${baseURL}/projects/${projectId}/research-plan`);
    await page.locator("#researchGoal").fill(researchInput.researchGoal);
    await page.locator("#discipline").fill(researchInput.discipline);
    await page.locator("#keywords").fill(researchInput.keywords);
    await page.screenshot({ path: resolve(evidenceDir, "01-research-input.png"), fullPage: false });
    evidence.checkpoints.push({ name: "研究输入就绪", screenshot: "01-research-input.png", url: page.url() });

    await page.getByRole("button", { name: /启动协作方案|run research plan/i }).click();
    await page.waitForSelector('[data-testid="workflow-select-topic"]', { timeout: 360_000 });
    await page.locator('[data-testid="workflow-select-topic"]').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(evidenceDir, "02-topic-approval.png"), fullPage: false });
    evidence.checkpoints.push({ name: "选题人工确认", screenshot: "02-topic-approval.png", url: page.url() });

    await page.locator('[data-testid="workflow-select-topic"]').first().click();
    await page.waitForSelector('[data-testid="workflow-approve-final"]', { timeout: 360_000 });
    await page.locator('[data-testid="workflow-approve-final"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(evidenceDir, "03-final-approval.png"), fullPage: false });
    evidence.checkpoints.push({ name: "最终方案终审", screenshot: "03-final-approval.png", url: page.url() });

    runId = await page.evaluate(() => document.querySelector("[data-run-id]")?.getAttribute("data-run-id") ?? null);
    if (!runId) {
      const detailResponse = await page.request.get(`${baseURL}/api/agent/runs?projectId=${encodeURIComponent(projectId)}&limit=10`);
      if (detailResponse.ok()) {
        const payload = await detailResponse.json();
        const runs = payload.data ?? payload;
        runId = runs.find((run) => run.agent === "research-plan")?.id ?? null;
      }
    }
    if (!runId) throw new Error("Could not locate research-plan run for this project");
  }

  const beforeApproval = await waitForRunDetail(page, runId);
  if (beforeApproval.status !== "succeeded") {
    await page.locator('[data-testid="workflow-approve-final"]').click();
    const deadline = Date.now() + 60_000;
    let detail = beforeApproval;
    while (Date.now() < deadline && detail.status !== "succeeded") {
      await delay(1000);
      detail = await waitForRunDetail(page, runId);
      if (["failed", "cancelled"].includes(detail.status)) {
        throw new Error(`Run ended in ${detail.status}: ${detail.error ?? "no error message"}`);
      }
    }
    if (detail.status !== "succeeded") throw new Error(`Run did not finish approval; current status=${detail.status}`);
  }
  await page.getByText("协作完成，产物已入库。", { exact: true }).waitFor({ timeout: 60_000 });
  await page.screenshot({ path: resolve(evidenceDir, "04-workflow-complete.png"), fullPage: false });
  evidence.checkpoints.push({ name: "协作完成并保存产物", screenshot: "04-workflow-complete.png", url: page.url() });

  const detail = await waitForRunDetail(page, runId);
  evidence.run = {
    id: detail.id,
    status: detail.status,
    createdAt: detail.createdAt,
    startedAt: detail.startedAt,
    completedAt: detail.completedAt,
    agent: detail.agent,
    goal: detail.goal,
    input: detail.input,
    result: detail.result,
    artifacts: detail.artifacts,
  };
  evidence.dialogs = dialogs;
  evidence.completedAt = new Date().toISOString();
  evidence.screenshotFiles = evidence.checkpoints.map((checkpoint) => checkpoint.screenshot);
  await writeFile(resolve(evidenceDir, "rehearsal-data.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({
    status: detail.status,
    projectId,
    runId,
    artifactCount: detail.artifacts?.length ?? 0,
    screenshots: evidence.screenshotFiles,
    evidenceFile: "doc/roadshow-evidence/rehearsal-data.json",
  }, null, 2));
} catch (error) {
  evidence.failedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? error.message : String(error);
  evidence.serverLogTail = serverLogs.join("").slice(-5000);
  await writeFile(resolve(evidenceDir, "rehearsal-data.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
