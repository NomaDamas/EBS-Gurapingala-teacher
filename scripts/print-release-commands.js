const workerUrl = normalizeBaseUrl(process.env.WORKER_URL || process.env.WORKER_HEALTH_URL || "");
const prHeadSha = String(process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || "").trim();
const expectedOpenAIModel = String(process.env.EXPECTED_OPENAI_MODEL || "gpt-5.5").trim();
const expectedOpenAITimeoutMs = String(process.env.EXPECTED_OPENAI_TIMEOUT_MS || "15000").trim();
const classroomChatProof = process.env.CLASSROOM_CHAT_PROOF === "true";
const teacherToken = process.env.TEACHER_TOKEN ? "$TEACHER_TOKEN" : "<TEACHER_TOKEN>";
const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID ? "$CLOUDFLARE_ACCOUNT_ID" : "<CLOUDFLARE_ACCOUNT_ID>";
const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN ? "$CLOUDFLARE_API_TOKEN" : "<CLOUDFLARE_API_TOKEN>";
const reviewer = shellQuote(process.env.EXTERNAL_REVIEWER || "GPT-5.5 xhigh equivalent");
const reviewSource = process.env.EXTERNAL_REVIEW_SOURCE_URL
  ? `EXTERNAL_REVIEW_SOURCE_URL=${shellQuote(process.env.EXTERNAL_REVIEW_SOURCE_URL)}`
  : "EXTERNAL_REVIEW_TRANSCRIPT_FILE=artifacts/external-review-transcript.md";
const plans = validateUniqueRoomPlans(parseRoomPlans(process.env.CLASSROOM_PLANS || ""));

if (!workerUrl) {
  console.error("FAIL WORKER_URL or WORKER_HEALTH_URL is required");
  process.exit(1);
}

if (!prHeadSha) {
  console.error("FAIL PR_HEAD_SHA or GITHUB_SHA is required so every release evidence command is tied to an exact commit");
  process.exit(1);
}

if (plans.length === 0) {
  console.error("FAIL CLASSROOM_PLANS is required, e.g. 2026-07-13-3-5:2:이순신 장군처럼 친절하게 설명한다.;;2026-07-16-3-1:2:이순신 장군처럼 친절하게 설명한다.");
  process.exit(1);
}

const classroomEvidenceFiles = plans.map((plan) => `artifacts/${plan.roomId}-config.json`);
const expectedRooms = plans.map((plan) => plan.roomId).join(",");

console.log("# EBS classroom release evidence commands");
console.log("# Run these after GitHub CI is green and the real Cloudflare Worker is deployed.");
console.log("");
console.log("## 1. Fail closed on production deploy prerequisites");
console.log([
  "DEPLOY_ENVIRONMENT=production",
  `CLOUDFLARE_ACCOUNT_ID=${cloudflareAccountId}`,
  `CLOUDFLARE_API_TOKEN=${cloudflareApiToken}`,
  `WORKER_HEALTH_URL=${shellQuote(workerUrl)}`,
  `TEACHER_TOKEN=${teacherToken}`,
  "VERIFY_ROOM=deploy-verify",
  "REQUIRE_OPENAI=true",
  "REQUIRE_TEACHER_TOKEN=true",
  "REQUIRE_CLOUDFLARE_EDGE=true",
  `EXPECTED_OPENAI_MODEL=${shellQuote(expectedOpenAIModel)}`,
  `EXPECTED_OPENAI_TIMEOUT_MS=${shellQuote(expectedOpenAITimeoutMs)}`,
  "npm run preflight:deploy"
].join(" "));
console.log("");
console.log("## 2. Verify latest PR CI");
console.log([
  "PR_URL=https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1",
  `PR_HEAD_SHA=${shellQuote(prHeadSha)}`,
  "CI_EVIDENCE_FILE=artifacts/ci-evidence.json",
  "npm run verify:ci"
].join(" "));
console.log("");
console.log("## 3. Verify deployed Worker");
console.log([
  `WORKER_URL=${shellQuote(workerUrl)}`,
  `TEACHER_TOKEN=${teacherToken}`,
  "VERIFY_ROOM=deploy-verify",
  "REQUIRE_OPENAI=true",
  "REQUIRE_TEACHER_TOKEN=true",
  "REQUIRE_CLOUDFLARE_EDGE=true",
  `EXPECTED_OPENAI_MODEL=${shellQuote(expectedOpenAIModel)}`,
  `EXPECTED_OPENAI_TIMEOUT_MS=${shellQuote(expectedOpenAITimeoutMs)}`,
  `PR_HEAD_SHA=${shellQuote(prHeadSha)}`,
  "VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json",
  "npm run verify:deploy"
].join(" "));
console.log("");
console.log("## 4. Verify each filming classroom room");
if (classroomChatProof) {
  console.log("# CLASSROOM_CHAT_PROOF=true adds one setting-validation chat turn to each room.");
}
for (const [index, plan] of plans.entries()) {
  console.log(`# Room ${index + 1}: ${plan.roomId}`);
  const command = [
    `WORKER_URL=${shellQuote(workerUrl)}`,
    `TEACHER_TOKEN=${teacherToken}`,
    `CLASSROOM_ROOM=${shellQuote(plan.roomId)}`,
    `EXPECTED_FALSE_LEVEL=${plan.level}`,
    `EXPECTED_PERSONA=${shellQuote(plan.persona)}`,
    "REQUIRE_OPENAI=true",
    "REQUIRE_TEACHER_TOKEN=true",
    `EXPECTED_OPENAI_MODEL=${shellQuote(expectedOpenAIModel)}`,
    `EXPECTED_OPENAI_TIMEOUT_MS=${shellQuote(expectedOpenAITimeoutMs)}`,
    `PR_HEAD_SHA=${shellQuote(prHeadSha)}`,
    `CLASSROOM_CONFIG_EVIDENCE_FILE=${shellQuote(classroomEvidenceFiles[index])}`,
    classroomChatProof ? "VERIFY_CLASSROOM_CHAT=true" : "",
    "npm run rehearsal:config"
  ].filter(Boolean);
  console.log(command.join(" "));
}
console.log("");
console.log("## 5. Write structured external review evidence after APPROVE");
console.log([
  "EXTERNAL_REVIEW_DECISION=APPROVE",
  `EXTERNAL_REVIEWER=${reviewer}`,
  reviewSource,
  `PR_HEAD_SHA=${shellQuote(prHeadSha)}`,
  "CI_STATUS=success",
  "TESTS_STATUS=pass",
  "EVAL_STATUS=pass",
  "READINESS_STATUS=pass",
  "SMOKE_STATUS=pass",
  "VERIFY_DEPLOY_STATUS=pass",
  "CLASSROOM_CONFIG_STATUS=pass",
  classroomChatProof ? "REQUIRE_CLASSROOM_CHAT_PROOF=true" : "",
  "CI_EVIDENCE_FILE=artifacts/ci-evidence.json",
  "VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json",
  `CLASSROOM_CONFIG_EVIDENCE_FILES=${shellQuote(classroomEvidenceFiles.join(","))}`,
  `EXPECTED_CLASSROOM_ROOMS=${shellQuote(expectedRooms)}`,
  "EXTERNAL_REVIEW_FILE=artifacts/external-review.json",
  "npm run review:evidence"
].filter(Boolean).join(" "));
console.log("");
console.log("## 6. Final release audit");
console.log([
  "EXTERNAL_REVIEW_DECISION=APPROVE",
  "VERIFY_DEPLOY_STATUS=pass",
  `WORKER_URL=${shellQuote(workerUrl)}`,
  `PR_HEAD_SHA=${shellQuote(prHeadSha)}`,
  `EXPECTED_PR_HEAD_SHA=${shellQuote(prHeadSha)}`,
  "CI_STATUS=success",
  `CI_HEAD_SHA=${shellQuote(prHeadSha)}`,
  "CI_EVIDENCE_FILE=artifacts/ci-evidence.json",
  "REQUIRE_OPENAI=true",
  "REQUIRE_TEACHER_TOKEN=true",
  "REQUIRE_CLASSROOM_CONFIG=true",
  "REQUIRE_CLOUDFLARE_EDGE=true",
  classroomChatProof ? "REQUIRE_CLASSROOM_CHAT_PROOF=true" : "",
  "EXTERNAL_REVIEW_FILE=artifacts/external-review.json",
  "VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json",
  `CLASSROOM_CONFIG_EVIDENCE_FILES=${shellQuote(classroomEvidenceFiles.join(","))}`,
  `EXPECTED_CLASSROOM_ROOMS=${shellQuote(expectedRooms)}`,
  "npm run release:audit"
].filter(Boolean).join(" "));

function parseRoomPlans(value) {
  return String(value || "")
    .split(";;")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseRoomPlan);
}

function parseRoomPlan(value) {
  const parts = value.split(":");
  const roomId = normalizeRoomId(parts.shift());
  const level = Number(parts.shift());
  const persona = parts.join(":").trim();
  const failures = [];
  if (!roomId || roomId === "default-classroom" || roomId.startsWith("deploy-verify")) failures.push("roomId must be a filming room");
  if (!Number.isInteger(level) || level < 1 || level > 4) failures.push("level must be 1, 2, 3, or 4");
  if (!persona) failures.push("persona is required");
  if (failures.length) {
    console.error(`FAIL invalid CLASSROOM_PLANS entry "${value}": ${failures.join("; ")}`);
    process.exit(1);
  }
  return { roomId, level, persona };
}

function validateUniqueRoomPlans(plans) {
  const seen = new Set();
  for (const plan of plans) {
    if (seen.has(plan.roomId)) {
      console.error(`FAIL duplicate CLASSROOM_PLANS room "${plan.roomId}" would overwrite classroom evidence`);
      process.exit(1);
    }
    seen.add(plan.roomId);
  }
  return plans;
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

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@,%+=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}
