import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const baseUrl = normalizeBaseUrl(process.env.WORKER_URL || process.argv[2]);
const teacherToken = process.env.TEACHER_TOKEN || "";
const roomId = normalizeRoomId(process.env.CLASSROOM_ROOM || process.env.WORKER_ROOM || "");
const expectedLevel = normalizeExpectedLevel(process.env.EXPECTED_FALSE_LEVEL || "");
const expectedPersona = String(process.env.EXPECTED_PERSONA || "").trim();
const applyExpectedConfig = process.env.APPLY_CLASSROOM_CONFIG === "true";
const requireOpenAI = process.env.REQUIRE_OPENAI !== "false";
const requireTeacherToken = process.env.REQUIRE_TEACHER_TOKEN !== "false";
const expectedOpenAIModel = String(process.env.EXPECTED_OPENAI_MODEL || "").trim();
const expectedOpenAITimeoutMs = normalizeExpectedTimeout(process.env.EXPECTED_OPENAI_TIMEOUT_MS || "");
const evidenceFile = String(process.env.CLASSROOM_CONFIG_EVIDENCE_FILE || "").trim();
const prHeadSha = String(process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || "").trim();

const failures = [];
if (!baseUrl) failures.push("WORKER_URL is required");
if (!teacherToken && requireTeacherToken) failures.push("TEACHER_TOKEN is required when REQUIRE_TEACHER_TOKEN is not false");
if (evidenceFile && !prHeadSha) failures.push("PR_HEAD_SHA or GITHUB_SHA is required when CLASSROOM_CONFIG_EVIDENCE_FILE is set");
if (!roomId) failures.push("CLASSROOM_ROOM is required");
if (roomId === "default-classroom" && process.env.ALLOW_DEFAULT_CLASSROOM !== "true") {
  failures.push("CLASSROOM_ROOM must not be default-classroom unless ALLOW_DEFAULT_CLASSROOM=true");
}
if (roomId === "deploy-verify" || roomId.startsWith("deploy-verify-")) {
  failures.push("CLASSROOM_ROOM must be a filming/rehearsal room, not deploy-verify");
}
if (!expectedLevel) failures.push("EXPECTED_FALSE_LEVEL must be 1, 2, 3, or 4");
if (!expectedPersona) failures.push("EXPECTED_PERSONA is required");
if (requireOpenAI && !expectedOpenAIModel) failures.push("EXPECTED_OPENAI_MODEL is required when REQUIRE_OPENAI=true");
if (requireOpenAI && !expectedOpenAITimeoutMs) failures.push("EXPECTED_OPENAI_TIMEOUT_MS is required when REQUIRE_OPENAI=true");

if (failures.length) exitWithFailures(failures);

const results = [];
let observedHealth = null;
const sharingUrls = buildSharingUrlEvidence();

await check("student URL loads for classroom room", async () => {
  const res = await fetchUrl("/");
  const body = await res.text();
  return res.status === 200 &&
    body.includes("질문의 온도") &&
    body.includes("교사용 대시보드에 기록됩니다") &&
    body.includes("이름 외 개인정보는 입력하지 마세요");
});

await check("teacher URL requires token", async () => {
  const res = await fetchUrl("/teacher");
  return teacherToken ? res.status === 401 : res.status === 200 || res.status === 401;
});

await check("teacher URL accepts token", async () => {
  if (!teacherToken) return true;
  const res = await fetchUrl("/teacher", { token: teacherToken });
  const body = await res.text();
  return res.status === 200 && body.includes("실시간 교실 관찰");
});

await check("health matches classroom requirements", async () => {
  const res = await fetchUrl("/api/health");
  const body = await res.json();
  observedHealth = {
    status: res.status,
    ok: body.ok === true,
    openaiConfigured: body.openaiConfigured === true,
    openaiModel: safeString(body.openaiModel),
    openaiTimeoutMs: Number.isFinite(body.openaiTimeoutMs) ? body.openaiTimeoutMs : null,
    teacherProtected: body.teacherProtected === true
  };
  return res.status === 200 &&
    body.ok === true &&
    (!requireOpenAI || body.openaiConfigured === true) &&
    (!expectedOpenAIModel || body.openaiModel === expectedOpenAIModel) &&
    (!expectedOpenAITimeoutMs || body.openaiTimeoutMs === expectedOpenAITimeoutMs) &&
    (!requireTeacherToken || body.teacherProtected === true) &&
    res.headers.get("cache-control") === "no-store" &&
    res.headers.get("x-robots-tag") === "noindex, nofollow";
});

if (applyExpectedConfig) {
  await check("expected classroom Level/persona can be applied", async () => {
    const res = await fetchTeacherUrl("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: expectedLevel, persona: expectedPersona })
    });
    const body = await res.json();
    return res.status === 200 &&
      Number(body.level) === expectedLevel &&
      body.persona === expectedPersona;
  });
}

let observedConfig = null;
await check("classroom Level/persona matches expected config", async () => {
  const res = await fetchTeacherUrl("/api/config");
  observedConfig = await res.json();
  return res.status === 200 &&
    Number(observedConfig.level) === expectedLevel &&
    observedConfig.persona === expectedPersona;
});

const passed = results.every((result) => result.passed);
if (evidenceFile) await writeEvidence(passed);

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
  if (result.error) console.error(`  ${result.error}`);
}

if (!passed) {
  const failed = results.filter((result) => !result.passed).length;
  console.error(`classroom config verification failed: ${failed}/${results.length}`);
  process.exit(1);
}

console.log(`classroom config verification passed: ${results.length}/${results.length}`);
console.log(`roomId=${roomId}`);
console.log(`expectedLevel=${expectedLevel}`);

async function check(name, run) {
  try {
    results.push({ name, passed: Boolean(await run()) });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function writeEvidence(passed) {
  const payload = {
    schemaVersion: "classroom-config-evidence/v1",
    generatedAt: new Date().toISOString(),
    status: passed ? "pass" : "fail",
    workerUrl: baseUrl,
    roomId,
    prHeadSha,
    expectedLevel,
    expectedPersona,
    applyExpectedConfig,
    requireOpenAI,
    requireTeacherToken,
    expectedOpenAIModel,
    expectedOpenAITimeoutMs: expectedOpenAITimeoutMs || null,
    sharingUrls,
    observedHealth,
    observedConfig,
    checks: results
  };
  await mkdir(dirname(evidenceFile), { recursive: true });
  await writeFile(evidenceFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`classroom config evidence written: ${evidenceFile}`);
}

function fetchUrl(path, query = {}, init) {
  const url = new URL(path, baseUrl);
  url.searchParams.set("room", roomId);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  return fetch(url, init);
}

function fetchTeacherUrl(path, init = {}) {
  return fetchUrl(path, {}, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "x-teacher-token": teacherToken
    }
  });
}

function buildSharingUrlEvidence() {
  const studentUrl = buildShareUrl("/", "");
  const teacherUrlTemplate = buildShareUrl("/teacher", "<TEACHER_TOKEN>");
  return {
    studentUrl,
    teacherUrlTemplate,
    studentUrlHasToken: new URL(studentUrl).searchParams.has("token"),
    teacherUrlRequiresToken: new URL(teacherUrlTemplate).searchParams.get("token") === "<TEACHER_TOKEN>"
  };
}

function buildShareUrl(pathname, tokenPlaceholder) {
  const url = new URL(baseUrl);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", roomId);
  if (tokenPlaceholder) url.searchParams.set("token", tokenPlaceholder);
  return url.toString().replace("%3CTEACHER_TOKEN%3E", "<TEACHER_TOKEN>");
}

function normalizeBaseUrl(value) {
  if (!value) return "";
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function normalizeRoomId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeExpectedLevel(value) {
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 4 ? level : 0;
}

function normalizeExpectedTimeout(value) {
  if (!value) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1000 || n > 60000) {
    console.error("EXPECTED_OPENAI_TIMEOUT_MS must be between 1000 and 60000.");
    process.exit(1);
  }
  return Math.round(n);
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function exitWithFailures(items) {
  for (const failure of items) console.error(`FAIL ${failure}`);
  console.error(`classroom config verification failed: ${items.length} setup issue(s)`);
  process.exit(1);
}
