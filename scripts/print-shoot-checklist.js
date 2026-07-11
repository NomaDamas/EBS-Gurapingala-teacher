const prUrl = String(process.env.PR_URL || "https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1").trim();
const workerUrl = normalizeBaseUrl(process.env.WORKER_URL || process.env.WORKER_HEALTH_URL || "");
const prHeadSha = String(process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || "").trim();
const classroomPlans = parsePlans(process.env.CLASSROOM_PLANS || "");
const expectedOpenAIModel = String(process.env.EXPECTED_OPENAI_MODEL || "gpt-5.6-terra").trim();
const expectedOpenAIVerifierModel = String(process.env.EXPECTED_OPENAI_VERIFIER_MODEL || expectedOpenAIModel).trim();
const evalJudgeModel = String(process.env.EVAL_JUDGE_MODEL || expectedOpenAIVerifierModel).trim();
const expectedOpenAITimeoutMs = String(process.env.EXPECTED_OPENAI_TIMEOUT_MS || "15000").trim();
const classroomChatProof = process.env.CLASSROOM_CHAT_PROOF === "true";

const failures = [];
if (!isUrl(prUrl)) failures.push("PR_URL must be an https GitHub PR URL");
if (!workerUrl) failures.push("WORKER_URL or WORKER_HEALTH_URL is required");
if (!prHeadSha) failures.push("PR_HEAD_SHA or GITHUB_SHA is required");
if (classroomPlans.length === 0) failures.push("CLASSROOM_PLANS is required");
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`shoot checklist failed: ${failures.length} setup issue(s)`);
  process.exit(1);
}

const rooms = classroomPlans.map((plan) => plan.roomId).join(",");

console.log(`# EBS <생각의 멸종> shoot checklist

## Target
- PR: ${prUrl}
- PR head SHA: ${prHeadSha}
- Worker URL: ${workerUrl}
- OpenAI model: ${expectedOpenAIModel}
- OpenAI verifier model: ${expectedOpenAIVerifierModel}
- Evaluation judge model: ${evalJudgeModel}
- OpenAI timeout ms: ${expectedOpenAITimeoutMs}
- Filming rooms: ${rooms}

## Stop Conditions
- Do not merge without actual external GPT-5.5 xhigh/equivalent APPROVE review.
- Do not merge without real Cloudflare verify:deploy evidence.
- Do not merge without model-evaluation-evidence/v1 proving 50 OpenAI generator/verifier/judge turns and zero fallback.
- Do not merge without rehearsal:config evidence for every filming room.
- If classroom chat proof is required, do not merge unless every room evidence includes valid sampleChat.
- Do not share teacherUrl or TEACHER_TOKEN with students.
- Do not use deploy-verify as a filming room.

## 1. Local Product Gates
npm test
npm run eval
npm run readiness
npm run smoke

## 2. Student/Teacher URLs
WORKER_URL=${shellQuote(workerUrl)} CLASSROOM_ROOMS=${shellQuote(rooms)} npm run classroom:urls

## 3. External Review Request
${[
  `PR_URL=${shellQuote(prUrl)}`,
  `PR_HEAD_SHA=${shellQuote(prHeadSha)}`,
  `WORKER_URL=${shellQuote(workerUrl)}`,
  `EXPECTED_CLASSROOM_ROOMS=${shellQuote(rooms)}`,
  classroomChatProof ? "CLASSROOM_CHAT_PROOF=true" : "",
  "npm run review:packet"
].filter(Boolean).join(" ")}

## 4. Release Evidence Commands
${[
  `WORKER_URL=${shellQuote(workerUrl)}`,
  `PR_HEAD_SHA=${shellQuote(prHeadSha)}`,
  `EXPECTED_OPENAI_MODEL=${shellQuote(expectedOpenAIModel)}`,
  `EXPECTED_OPENAI_VERIFIER_MODEL=${shellQuote(expectedOpenAIVerifierModel)}`,
  `EVAL_JUDGE_MODEL=${shellQuote(evalJudgeModel)}`,
  `EXPECTED_OPENAI_TIMEOUT_MS=${shellQuote(expectedOpenAITimeoutMs)}`,
  `CLASSROOM_PLANS=${shellQuote(process.env.CLASSROOM_PLANS)}`,
  classroomChatProof ? "CLASSROOM_CHAT_PROOF=true" : "",
  "npm run release:commands"
].filter(Boolean).join(" ")}

## 5. Final Gate
Run the release:commands output in order, then run release:audit only with evidence files generated from this same SHA.

## 6. Debrief Requirement
After filming, export /api/debrief.csv and correct every student-visible falsehood before the class ends.`);

function parsePlans(value) {
  return String(value || "")
    .split(";;")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parsePlan);
}

function parsePlan(value) {
  const parts = value.split(":");
  const roomId = normalizeRoomId(parts.shift());
  const level = Number(parts.shift());
  const persona = parts.join(":").trim();
  const failures = [];
  if (!isFilmingRoom(roomId)) failures.push("roomId must be a filming room");
  if (!Number.isInteger(level) || level < 1 || level > 5) failures.push("level must be 1, 2, 3, 4, or 5 (Combination)");
  if (!persona) failures.push("persona is required");
  if (failures.length) {
    console.error(`FAIL invalid CLASSROOM_PLANS entry "${value}": ${failures.join("; ")}`);
    process.exit(1);
  }
  return { roomId, level, persona };
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

function isFilmingRoom(value) {
  const room = String(value || "").trim();
  return Boolean(room) &&
    room !== "default-classroom" &&
    room !== "deploy-verify" &&
    !room.startsWith("deploy-verify-");
}

function isUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@,%+=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}
