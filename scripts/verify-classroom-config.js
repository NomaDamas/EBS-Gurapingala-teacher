import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isVerifierPolicyApproved } from "../src/domain/verifier-policy.js";

const baseUrl = normalizeBaseUrl(process.env.WORKER_URL || process.argv[2]);
const teacherToken = process.env.TEACHER_TOKEN || "";
const roomId = normalizeRoomId(process.env.CLASSROOM_ROOM || process.env.WORKER_ROOM || "");
const expectedLevel = normalizeExpectedLevel(process.env.EXPECTED_FALSE_LEVEL || "");
const expectedPersona = String(process.env.EXPECTED_PERSONA || "").trim();
const expectedResponseMode = normalizeExpectedResponseMode(process.env.EXPECTED_RESPONSE_MODE || "");
const applyExpectedConfig = process.env.APPLY_CLASSROOM_CONFIG === "true";
const requireOpenAI = process.env.REQUIRE_OPENAI !== "false";
const requireTeacherToken = process.env.REQUIRE_TEACHER_TOKEN !== "false";
const expectedOpenAIModel = String(process.env.EXPECTED_OPENAI_MODEL || "").trim();
const expectedOpenAIVerifierModel = String(process.env.EXPECTED_OPENAI_VERIFIER_MODEL || expectedOpenAIModel).trim();
const expectedOpenAITimeoutMs = normalizeExpectedTimeout(process.env.EXPECTED_OPENAI_TIMEOUT_MS || "");
const verifyClassroomChat = process.env.VERIFY_CLASSROOM_CHAT === "true";
const evidenceFile = String(process.env.CLASSROOM_CONFIG_EVIDENCE_FILE || "").trim();
const prHeadSha = String(process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || "").trim();
const teacherAuthRetryDelayMs = normalizeRetryDelay(process.env.VERIFY_AUTH_RETRY_DELAY_MS || "1000");

const failures = [];
if (!baseUrl) failures.push("WORKER_URL is required");
if (!teacherToken && requireTeacherToken) failures.push("TEACHER_TOKEN is required when REQUIRE_TEACHER_TOKEN is not false");
if (verifyClassroomChat && !teacherToken) failures.push("TEACHER_TOKEN is required when VERIFY_CLASSROOM_CHAT=true so chat audit can be exported");
if (evidenceFile && !prHeadSha) failures.push("PR_HEAD_SHA or GITHUB_SHA is required when CLASSROOM_CONFIG_EVIDENCE_FILE is set");
if (!roomId) failures.push("CLASSROOM_ROOM is required");
if (roomId === "default-classroom" && process.env.ALLOW_DEFAULT_CLASSROOM !== "true") {
  failures.push("CLASSROOM_ROOM must not be default-classroom unless ALLOW_DEFAULT_CLASSROOM=true");
}
if (roomId === "deploy-verify" || roomId.startsWith("deploy-verify-")) {
  failures.push("CLASSROOM_ROOM must be a filming/rehearsal room, not deploy-verify");
}
if (!expectedLevel) failures.push("EXPECTED_FALSE_LEVEL must be 1, 2, 3, 4, or 5 (Combination)");
if (!expectedPersona) failures.push("EXPECTED_PERSONA is required");
if (process.env.EXPECTED_RESPONSE_MODE && !expectedResponseMode) {
  failures.push("EXPECTED_RESPONSE_MODE must be experiment or truth");
}
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
    body.includes("EBS with") &&
    body.includes("수업 기록으로 저장됩니다") &&
    body.includes("이름 외 개인정보는 입력하지 마세요");
});

await check("teacher URL requires token", async () => {
  const res = await fetchUrl("/teacher");
  return teacherToken ? res.status === 401 : res.status === 200 || res.status === 401;
});

await check("teacher URL accepts token", async () => {
  if (!teacherToken) return true;
  const res = await fetchWithTeacherAuthRetry(() => fetchUrl("/teacher", { token: teacherToken }));
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
    openaiVerifierModel: safeString(body.openaiVerifierModel),
    openaiTimeoutMs: Number.isFinite(body.openaiTimeoutMs) ? body.openaiTimeoutMs : null,
    teacherProtected: body.teacherProtected === true
  };
  return res.status === 200 &&
    body.ok === true &&
    (!requireOpenAI || body.openaiConfigured === true) &&
    (!expectedOpenAIModel || body.openaiModel === expectedOpenAIModel) &&
    (!expectedOpenAIVerifierModel || body.openaiVerifierModel === expectedOpenAIVerifierModel) &&
    (!expectedOpenAITimeoutMs || body.openaiTimeoutMs === expectedOpenAITimeoutMs) &&
    (!requireTeacherToken || body.teacherProtected === true) &&
    res.headers.get("cache-control") === "no-store" &&
    res.headers.get("x-robots-tag") === "noindex, nofollow";
});

if (applyExpectedConfig) {
  await check("expected classroom Level/persona/response mode can be applied", async () => {
    const expectedConfig = {
      level: expectedLevel,
      persona: expectedPersona,
      ...(expectedResponseMode ? { responseMode: expectedResponseMode } : {})
    };
    const res = await fetchTeacherUrl("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(expectedConfig)
    });
    const body = await res.json();
    return res.status === 200 &&
      Number(body.level) === expectedLevel &&
      body.persona === expectedPersona &&
      (!expectedResponseMode || body.responseMode === expectedResponseMode);
  });
}

let observedConfig = null;
await check("classroom Level/persona/response mode matches expected config", async () => {
  const res = await fetchTeacherUrl("/api/config");
  observedConfig = await res.json();
  return res.status === 200 &&
    Number(observedConfig.level) === expectedLevel &&
    observedConfig.persona === expectedPersona &&
    (!expectedResponseMode || observedConfig.responseMode === expectedResponseMode);
});

let sampleChat = null;
if (verifyClassroomChat) {
  await check("classroom chat audit uses expected Level/persona", async () => {
    const sessionId = `classroom-config-${roomId}-${Date.now()}`;
    const sessionSecret = `${sessionId}-secret`;
    const studentName = "설정검증";
    const message = "명량해전에서 이순신은 배 몇 척으로 싸웠어?";
    const join = await fetchUrl("/api/join", {}, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, sessionSecret, studentName })
    });
    if (join.status !== 200) return false;
    const chat = await fetchUrl("/api/chat", {}, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, sessionSecret, studentName, message })
    });
    const chatBody = await chat.json();
    if (chat.status !== 200 || typeof chatBody.answer !== "string" || chatBody.roomId !== roomId) return false;
    const exported = await fetchTeacherUrl("/api/export");
    const exportBody = await exported.json();
    const event = Array.isArray(exportBody.events)
      ? exportBody.events.find((item) => item.type === "chat_turn" && item.sessionId === sessionId)
      : null;
    sampleChat = {
      sessionId,
      studentName,
      message,
      studentVisibleAnswerLength: String(event?.studentVisibleAnswer || chatBody.answer || "").length,
      blockedForStudent: event?.blockedForStudent === true,
      auditInput: {
        appliedLevel: event?.teacherAudit?.input?.appliedLevel ?? null,
        persona: event?.teacherAudit?.input?.persona || ""
      },
      preflightVerdict: event?.teacherAudit?.preflight?.verdict || "",
      verifier: {
        name: event?.teacherAudit?.provider?.verifier?.name || "",
        model: event?.teacherAudit?.provider?.verifier?.model || "",
        approved: isVerifierPolicyApproved(event?.teacherAudit?.preflight)
      },
      debriefRequired: Boolean(event) && event.blockedForStudent !== true
    };
    return exported.status === 200 &&
      sampleChat.studentVisibleAnswerLength > 0 &&
      sampleChat.auditInput.appliedLevel === expectedLevel &&
      sampleChat.auditInput.persona === expectedPersona &&
      (!requireOpenAI || (
        sampleChat.verifier.name === "openai" &&
        sampleChat.verifier.model === expectedOpenAIVerifierModel &&
        sampleChat.verifier.approved === true
      )) &&
      sampleChat.debriefRequired === true;
  });
}

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
if (expectedResponseMode) console.log(`expectedResponseMode=${expectedResponseMode}`);

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
    expectedResponseMode: expectedResponseMode || null,
    applyExpectedConfig,
    requireOpenAI,
    requireTeacherToken,
    expectedOpenAIModel,
    expectedOpenAIVerifierModel,
    expectedOpenAITimeoutMs: expectedOpenAITimeoutMs || null,
    verifyClassroomChat,
    sharingUrls,
    observedHealth,
    observedConfig,
    sampleChat,
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
  return fetchWithTeacherAuthRetry(() => fetchUrl(path, {}, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "x-teacher-token": teacherToken
    }
  }));
}

async function fetchWithTeacherAuthRetry(run, attempts = 6) {
  let response = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    response = await run();
    if (response.status !== 401 && response.status !== 403) return response;
    if (attempt < attempts) await delay(teacherAuthRetryDelayMs);
  }
  return response;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return Number.isInteger(level) && level >= 1 && level <= 5 ? level : 0;
}

function normalizeExpectedResponseMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return mode === "experiment" || mode === "truth" ? mode : "";
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

function normalizeRetryDelay(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10000) return 1000;
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
