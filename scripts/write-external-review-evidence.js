import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

const outputFile = String(process.env.EXTERNAL_REVIEW_FILE || "artifacts/external-review.json").trim();
const decision = normalizeDecision(process.env.EXTERNAL_REVIEW_DECISION);
const reviewer = String(process.env.EXTERNAL_REVIEWER || process.env.EXTERNAL_REVIEW_MODEL || "").trim();
const reviewSourceUrl = String(process.env.EXTERNAL_REVIEW_SOURCE_URL || "").trim();
const reviewTranscriptFile = String(process.env.EXTERNAL_REVIEW_TRANSCRIPT_FILE || "").trim();
const prHeadSha = String(process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || "").trim();
const ciStatus = normalizeStatus(process.env.CI_STATUS || process.env.GITHUB_CI_STATUS);
const testsStatus = normalizeStatus(process.env.TESTS_STATUS || process.env.NPM_TEST_STATUS);
const evalStatus = normalizeStatus(process.env.EVAL_STATUS || process.env.NPM_EVAL_STATUS);
const readinessStatus = normalizeStatus(process.env.READINESS_STATUS || process.env.NPM_READINESS_STATUS);
const smokeStatus = normalizeStatus(process.env.SMOKE_STATUS || process.env.NPM_SMOKE_STATUS);
const verifyDeployStatus = normalizeStatus(process.env.VERIFY_DEPLOY_STATUS || "not-run");
const classroomConfigStatus = normalizeStatus(process.env.CLASSROOM_CONFIG_STATUS || process.env.REHEARSAL_CONFIG_STATUS);
const releaseAuditStatus = normalizeStatus(process.env.RELEASE_AUDIT_STATUS || "not-run");
const ciEvidenceFile = String(process.env.CI_EVIDENCE_FILE || "").trim();
const verifyDeployEvidenceFile = String(process.env.VERIFY_DEPLOY_EVIDENCE_FILE || "").trim();
const classroomConfigEvidenceFiles = parseFileList(process.env.CLASSROOM_CONFIG_EVIDENCE_FILES || process.env.CLASSROOM_CONFIG_EVIDENCE_FILE);
const expectedClassroomRooms = parseFileList(process.env.EXPECTED_CLASSROOM_ROOMS);
const requireClassroomChatProof = process.env.REQUIRE_CLASSROOM_CHAT_PROOF === "true";
const blockingFindings = parseList(process.env.BLOCKING_FINDINGS);
const nonBlockingRisks = parseList(process.env.NON_BLOCKING_RISKS);

const failures = [];
if (decision !== "approve" && decision !== "request_changes") {
  failures.push("EXTERNAL_REVIEW_DECISION must be APPROVE or REQUEST_CHANGES");
}
if (!reviewer) failures.push("EXTERNAL_REVIEWER or EXTERNAL_REVIEW_MODEL is required");
if (!reviewSourceUrl && !reviewTranscriptFile) {
  failures.push("EXTERNAL_REVIEW_SOURCE_URL or EXTERNAL_REVIEW_TRANSCRIPT_FILE is required so APPROVE evidence is tied to an actual external review artifact");
}
if (reviewSourceUrl && !isHttpsUrl(reviewSourceUrl)) {
  failures.push("EXTERNAL_REVIEW_SOURCE_URL must be an https URL");
}
if (!prHeadSha) failures.push("PR_HEAD_SHA or GITHUB_SHA is required");
if (decision === "approve" && blockingFindings.length) {
  failures.push("APPROVE evidence cannot include BLOCKING_FINDINGS");
}
if (decision === "approve" && !verifyDeployEvidenceFile) {
  failures.push("VERIFY_DEPLOY_EVIDENCE_FILE is required for APPROVE evidence so the review is tied to deployed Worker evidence");
}
if (decision === "approve" && !ciEvidenceFile) {
  failures.push("CI_EVIDENCE_FILE is required for APPROVE evidence so the review is tied to latest PR CI evidence");
}
if (decision === "approve" && classroomConfigEvidenceFiles.length === 0) {
  failures.push("CLASSROOM_CONFIG_EVIDENCE_FILES or CLASSROOM_CONFIG_EVIDENCE_FILE is required for APPROVE evidence so the review is tied to every filming room");
}
if (decision === "approve" && expectedClassroomRooms.length === 0) {
  failures.push("EXPECTED_CLASSROOM_ROOMS is required for APPROVE evidence so every filming room is reviewed");
}
for (const [label, value] of [
  ["CI_STATUS", ciStatus],
  ["TESTS_STATUS", testsStatus],
  ["EVAL_STATUS", evalStatus],
  ["READINESS_STATUS", readinessStatus],
  ["SMOKE_STATUS", smokeStatus],
  ["VERIFY_DEPLOY_STATUS", verifyDeployStatus],
  ["CLASSROOM_CONFIG_STATUS", classroomConfigStatus]
]) {
  if (!isPass(value)) failures.push(`${label}=pass or success is required for external review evidence`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`external review evidence failed: ${failures.length} issue(s)`);
  process.exit(1);
}

const reviewSource = await buildReviewSource();
const evidenceArtifacts = await buildEvidenceArtifacts();
validateApprovalEvidenceArtifacts(evidenceArtifacts);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`external review evidence failed: ${failures.length} issue(s)`);
  process.exit(1);
}

const payload = {
  schemaVersion: "external-review-evidence/v1",
  generatedAt: new Date().toISOString(),
  decision: decision === "approve" ? "APPROVE" : "REQUEST_CHANGES",
  reviewer,
  source: reviewSource,
  prHeadSha,
  requireClassroomChatProof,
  evidenceArtifacts,
  evidenceChecked: {
    ciStatus,
    testsStatus,
    evalStatus,
    readinessStatus,
    smokeStatus,
    verifyDeployStatus,
    classroomConfigStatus,
    releaseAuditStatus
  },
  blockingFindings,
  nonBlockingRisks
};

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`external review evidence written: ${outputFile}`);

async function buildEvidenceArtifacts() {
  return {
    ci: ciEvidenceFile ? await hashEvidenceFile(ciEvidenceFile) : null,
    deployVerification: verifyDeployEvidenceFile ? await hashEvidenceFile(verifyDeployEvidenceFile) : null,
    classroomConfigs: await Promise.all(classroomConfigEvidenceFiles.map(hashEvidenceFile))
  };
}

function validateApprovalEvidenceArtifacts(artifacts) {
  if (decision !== "approve") return;
  validateArtifact(artifacts.ci, {
    label: "CI_EVIDENCE_FILE",
    schemaVersion: "ci-evidence/v1",
    requireRoom: false
  });
  validateCiEvidenceArtifact(artifacts.ci);
  validateArtifact(artifacts.deployVerification, {
    label: "VERIFY_DEPLOY_EVIDENCE_FILE",
    schemaVersion: "deploy-verification-evidence/v1",
    requireRoom: false
  });
  validateDeployEvidenceArtifact(artifacts.deployVerification);
  for (const artifact of artifacts.classroomConfigs) {
    validateArtifact(artifact, {
      label: `CLASSROOM_CONFIG_EVIDENCE_FILE ${artifact?.file || ""}`.trim(),
      schemaVersion: "classroom-config-evidence/v1",
      requireRoom: true
    });
    validateClassroomEvidenceArtifact(artifact, artifacts.deployVerification?.workerUrl);
  }
  validateExpectedClassroomRooms(artifacts.classroomConfigs);
}

function validateArtifact(artifact, { label, schemaVersion, requireRoom }) {
  if (!artifact || typeof artifact !== "object") {
    failures.push(`${label} artifact is required for APPROVE evidence`);
    return;
  }
  if (artifact.schemaVersion !== schemaVersion) {
    failures.push(`${label} schemaVersion must be ${schemaVersion}`);
  }
  if (!isPass(normalizeStatus(artifact.status))) {
    failures.push(`${label} status must be pass`);
  }
  if (artifact.prHeadSha !== prHeadSha) {
    failures.push(`${label} prHeadSha must match PR_HEAD_SHA`);
  }
  if (!isIsoTimestamp(artifact.generatedAt)) {
    failures.push(`${label} generatedAt must be a valid timestamp`);
  }
  if (requireRoom && !isFilmingRoom(artifact.roomId)) {
    failures.push(`${label} roomId must be a filming/rehearsal room, not default-classroom or deploy-verify`);
  }
}

function validateDeployEvidenceArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") return;
  if (!isHttpsUrl(artifact.workerUrl)) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE workerUrl must be an https URL");
  }
  if (artifact.requireOpenAI !== true) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE must record requireOpenAI=true");
  }
  if (artifact.requireTeacherToken !== true) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE must record requireTeacherToken=true");
  }
  if (artifact.requireCloudflareEdge !== true) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE must record requireCloudflareEdge=true");
  }
  if (artifact.cloudflareEdge?.present !== true) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE must prove Cloudflare edge headers were present");
  }
  if (!hasCloudflareEdgeHeaderEvidence(artifact.cloudflareEdge?.headers)) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE cloudflareEdge.headers must include Cloudflare response header evidence");
  }
  if (!hasValidDeployHealthEvidence(artifact.health)) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE must include a sanitized /api/health evidence snapshot");
  }
  if (!isSafeDeployVerifyRoom(artifact.verifyRoom)) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE verifyRoom must be a deploy verification room, not a filming room");
  }
  if (!hasValidClassroomSharingUrls(artifact.sharingUrls, artifact.verifyRoom, artifact.workerUrl)) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE must include student/teacher sharing URL evidence with no student token");
  }
  if (!String(artifact.expectedOpenAIModel || "").trim()) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE must record expectedOpenAIModel");
  } else if (artifact.health?.openaiModel !== artifact.expectedOpenAIModel) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE health.openaiModel must match expectedOpenAIModel");
  }
  if (!Number.isFinite(artifact.expectedOpenAITimeoutMs)) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE must record expectedOpenAITimeoutMs");
  } else if (artifact.health?.openaiTimeoutMs !== artifact.expectedOpenAITimeoutMs) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE health.openaiTimeoutMs must match expectedOpenAITimeoutMs");
  }
  if (!Number.isFinite(artifact.totalChecks) || artifact.totalChecks < 18) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE must include all deploy verification checks");
  }
  if (artifact.passedChecks !== artifact.totalChecks) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE passedChecks must equal totalChecks");
  }
}

function validateCiEvidenceArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") return;
  if (!artifact.checkRun || typeof artifact.checkRun !== "object") {
    failures.push("CI_EVIDENCE_FILE checkRun is required");
    return;
  }
  if (artifact.checkRun.name !== "Verify product gates") {
    failures.push("CI_EVIDENCE_FILE checkRun.name must be Verify product gates");
  }
  if (artifact.checkRun.status !== "completed" || artifact.checkRun.conclusion !== "success") {
    failures.push("CI_EVIDENCE_FILE checkRun must be completed with conclusion=success");
  }
  const generatedAt = parseEvidenceTimestamp(artifact.generatedAt);
  const startedAt = parseEvidenceTimestamp(artifact.checkRun.startedAt);
  const completedAt = parseEvidenceTimestamp(artifact.checkRun.completedAt);
  if (!startedAt) {
    failures.push("CI_EVIDENCE_FILE checkRun.startedAt must be a valid timestamp");
  }
  if (!completedAt) {
    failures.push("CI_EVIDENCE_FILE checkRun.completedAt must be a valid timestamp");
  }
  if (startedAt && completedAt && completedAt < startedAt) {
    failures.push("CI_EVIDENCE_FILE checkRun.completedAt must be after checkRun.startedAt");
  }
  if (generatedAt && completedAt && generatedAt < completedAt) {
    failures.push("CI_EVIDENCE_FILE generatedAt must be after checkRun.completedAt");
  }
}

function validateClassroomEvidenceArtifact(artifact, expectedWorkerUrl) {
  if (!artifact || typeof artifact !== "object") return;
  const label = `CLASSROOM_CONFIG_EVIDENCE_FILE ${artifact.file || ""}`.trim();
  if (!isHttpsUrl(artifact.workerUrl)) {
    failures.push(`${label} workerUrl must be an https URL`);
  }
  if (expectedWorkerUrl && normalizeBaseUrl(artifact.workerUrl) !== normalizeBaseUrl(expectedWorkerUrl)) {
    failures.push(`${label} workerUrl must match VERIFY_DEPLOY_EVIDENCE_FILE workerUrl`);
  }
  if (artifact.requireOpenAI !== true) {
    failures.push(`${label} must record requireOpenAI=true`);
  }
  if (artifact.requireTeacherToken !== true) {
    failures.push(`${label} must record requireTeacherToken=true`);
  }
  if (!Number.isInteger(artifact.expectedLevel) || artifact.expectedLevel < 1 || artifact.expectedLevel > 4) {
    failures.push(`${label} expectedLevel must be 1, 2, 3, or 4`);
  }
  if (!String(artifact.expectedPersona || "").trim()) {
    failures.push(`${label} expectedPersona is required`);
  }
  if (!hasValidClassroomHealthEvidence(artifact.observedHealth)) {
    failures.push(`${label} must include a sanitized /api/health evidence snapshot`);
  }
  if (!String(artifact.expectedOpenAIModel || "").trim()) {
    failures.push(`${label} must record expectedOpenAIModel`);
  } else if (artifact.observedHealth?.openaiModel !== artifact.expectedOpenAIModel) {
    failures.push(`${label} observedHealth.openaiModel must match expectedOpenAIModel`);
  }
  if (!Number.isFinite(artifact.expectedOpenAITimeoutMs)) {
    failures.push(`${label} must record expectedOpenAITimeoutMs`);
  } else if (artifact.observedHealth?.openaiTimeoutMs !== artifact.expectedOpenAITimeoutMs) {
    failures.push(`${label} observedHealth.openaiTimeoutMs must match expectedOpenAITimeoutMs`);
  }
  if (Number(artifact.observedConfig?.level) !== artifact.expectedLevel ||
    artifact.observedConfig?.persona !== artifact.expectedPersona) {
    failures.push(`${label} observedConfig must match expected Level/persona`);
  }
  if (!hasValidClassroomSharingUrls(artifact.sharingUrls, artifact.roomId, artifact.workerUrl)) {
    failures.push(`${label} must include student/teacher sharing URL evidence with no student token`);
  }
  if (!Array.isArray(artifact.checks) || artifact.checks.length === 0 || artifact.checks.some((check) => check?.passed !== true)) {
    failures.push(`${label} checks must all pass`);
  }
  if (requireClassroomChatProof && artifact.verifyClassroomChat !== true) {
    failures.push(`${label} must record verifyClassroomChat=true when REQUIRE_CLASSROOM_CHAT_PROOF=true`);
  }
  if (artifact.verifyClassroomChat === true &&
    !hasValidSampleClassroomChat(artifact.sampleChat, artifact.expectedLevel, artifact.expectedPersona)) {
    failures.push(`${label} sampleChat must prove /api/chat audit used expected Level/persona`);
  }
}

function validateExpectedClassroomRooms(classroomArtifacts) {
  const seenRooms = new Set();
  for (const artifact of classroomArtifacts) {
    if (!artifact?.roomId || !isFilmingRoom(artifact.roomId)) continue;
    if (seenRooms.has(artifact.roomId)) {
      failures.push(`CLASSROOM_CONFIG_EVIDENCE_FILES contains duplicate filming room ${artifact.roomId}`);
    }
    seenRooms.add(artifact.roomId);
  }
  const expectedRooms = new Set(expectedClassroomRooms);
  for (const room of expectedRooms) {
    if (!isFilmingRoom(room)) {
      failures.push(`EXPECTED_CLASSROOM_ROOMS contains non-filming room ${room}`);
    }
    if (!seenRooms.has(room)) {
      failures.push(`CLASSROOM_CONFIG_EVIDENCE_FILES missing expected filming room ${room}`);
    }
  }
  for (const room of seenRooms) {
    if (!expectedRooms.has(room)) {
      failures.push(`CLASSROOM_CONFIG_EVIDENCE_FILES contains unexpected filming room ${room}`);
    }
  }
}

async function hashEvidenceFile(file) {
  let bytes;
  try {
    bytes = await readFile(file);
  } catch (error) {
    console.error(`FAIL evidence artifact must be readable: ${file}: ${error instanceof Error ? error.message : String(error)}`);
    console.error("external review evidence failed: 1 issue(s)");
    process.exit(1);
  }
  const artifact = {
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length
  };
  try {
    const json = JSON.parse(bytes.toString("utf8"));
    artifact.schemaVersion = json.schemaVersion;
    artifact.generatedAt = json.generatedAt;
    artifact.prHeadSha = json.prHeadSha;
    artifact.status = json.status;
    if (json.workerUrl) artifact.workerUrl = json.workerUrl;
    if (json.requireOpenAI !== undefined) artifact.requireOpenAI = json.requireOpenAI;
    if (json.requireTeacherToken !== undefined) artifact.requireTeacherToken = json.requireTeacherToken;
    if (json.requireCloudflareEdge !== undefined) artifact.requireCloudflareEdge = json.requireCloudflareEdge;
    if (json.cloudflareEdge) artifact.cloudflareEdge = json.cloudflareEdge;
    if (json.health) artifact.health = json.health;
    if (json.expectedOpenAIModel !== undefined) artifact.expectedOpenAIModel = json.expectedOpenAIModel;
    if (json.expectedOpenAITimeoutMs !== undefined) artifact.expectedOpenAITimeoutMs = json.expectedOpenAITimeoutMs;
    if (json.passedChecks !== undefined) artifact.passedChecks = json.passedChecks;
    if (json.totalChecks !== undefined) artifact.totalChecks = json.totalChecks;
    if (json.checkRun) artifact.checkRun = json.checkRun;
    if (json.roomId) artifact.roomId = json.roomId;
    if (json.verifyRoom) artifact.verifyRoom = json.verifyRoom;
    if (json.expectedLevel !== undefined) artifact.expectedLevel = json.expectedLevel;
    if (json.expectedPersona !== undefined) artifact.expectedPersona = json.expectedPersona;
    if (json.expectedOpenAIModel !== undefined) artifact.expectedOpenAIModel = json.expectedOpenAIModel;
    if (json.expectedOpenAITimeoutMs !== undefined) artifact.expectedOpenAITimeoutMs = json.expectedOpenAITimeoutMs;
    if (json.sharingUrls) artifact.sharingUrls = json.sharingUrls;
    if (json.observedHealth) artifact.observedHealth = json.observedHealth;
    if (json.observedConfig) artifact.observedConfig = json.observedConfig;
    if (json.verifyClassroomChat !== undefined) artifact.verifyClassroomChat = json.verifyClassroomChat;
    if (json.sampleChat) artifact.sampleChat = json.sampleChat;
    if (json.checks) artifact.checks = json.checks;
  } catch {
    artifact.schemaVersion = "unreadable-json";
  }
  return artifact;
}

async function buildReviewSource() {
  const source = {};
  if (reviewSourceUrl) source.url = reviewSourceUrl;
  if (reviewTranscriptFile) {
    let transcript;
    try {
      transcript = await readFile(reviewTranscriptFile);
    } catch (error) {
      console.error(`FAIL EXTERNAL_REVIEW_TRANSCRIPT_FILE must be readable: ${error instanceof Error ? error.message : String(error)}`);
      console.error("external review evidence failed: 1 issue(s)");
      process.exit(1);
    }
    source.transcriptFile = reviewTranscriptFile;
    source.transcriptSha256 = createHash("sha256").update(transcript).digest("hex");
    source.transcriptBytes = transcript.length;
  }
  return source;
}

function normalizeDecision(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z_]/g, "");
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isPass(value) {
  return value === "pass" || value === "success";
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isIsoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function hasCloudflareEdgeHeaderEvidence(headers) {
  if (!headers || typeof headers !== "object") return false;
  const values = [
    headers.cfRay,
    headers.cfCacheStatus,
    headers.server,
    headers.reportTo
  ].map((value) => String(value || "").toLowerCase());
  return Boolean(values[0]) || values.some((value) => value.includes("cloudflare"));
}

function hasValidDeployHealthEvidence(health) {
  if (!health || typeof health !== "object") return false;
  if (Number(health.status) !== 200) return false;
  if (health.ok !== true) return false;
  if (health.provider !== "openai") return false;
  if (health.openaiConfigured !== true) return false;
  if (health.teacherProtected !== true) return false;
  if (typeof health.openaiModel !== "string") return false;
  if (!Number.isFinite(health.openaiTimeoutMs)) return false;
  return JSON.stringify(health).includes("OPENAI_API_KEY") === false;
}

function hasValidClassroomHealthEvidence(health) {
  if (!health || typeof health !== "object") return false;
  if (Number(health.status) !== 200) return false;
  if (health.ok !== true) return false;
  if (health.openaiConfigured !== true) return false;
  if (health.teacherProtected !== true) return false;
  if (typeof health.openaiModel !== "string") return false;
  if (!Number.isFinite(health.openaiTimeoutMs)) return false;
  return JSON.stringify(health).includes("OPENAI_API_KEY") === false;
}

function hasValidClassroomSharingUrls(sharingUrls, roomId, expectedWorkerUrl) {
  if (!sharingUrls || typeof sharingUrls !== "object") return false;
  if (sharingUrls.studentUrlHasToken !== false) return false;
  if (sharingUrls.teacherUrlRequiresToken !== true) return false;
  if (JSON.stringify(sharingUrls).includes("TEACHER_TOKEN=")) return false;
  let studentUrl;
  let teacherUrl;
  try {
    studentUrl = new URL(sharingUrls.studentUrl);
    teacherUrl = new URL(sharingUrls.teacherUrlTemplate);
  } catch {
    return false;
  }
  if (normalizeBaseUrl(studentUrl.toString()) !== normalizeBaseUrl(expectedWorkerUrl)) return false;
  if (normalizeBaseUrl(teacherUrl.toString()) !== normalizeBaseUrl(expectedWorkerUrl)) return false;
  if (studentUrl.pathname !== "/") return false;
  if (teacherUrl.pathname !== "/teacher") return false;
  if (studentUrl.searchParams.get("room") !== roomId) return false;
  if (teacherUrl.searchParams.get("room") !== roomId) return false;
  if (studentUrl.searchParams.has("token")) return false;
  return teacherUrl.searchParams.get("token") === "<TEACHER_TOKEN>";
}

function hasValidSampleClassroomChat(sampleChat, expectedLevel, expectedPersona) {
  if (!sampleChat || typeof sampleChat !== "object") return false;
  if (!String(sampleChat.sessionId || "").startsWith("classroom-config-")) return false;
  if (!Number.isFinite(sampleChat.studentVisibleAnswerLength) || sampleChat.studentVisibleAnswerLength <= 0) return false;
  if (sampleChat.auditInput?.appliedLevel !== expectedLevel) return false;
  if (sampleChat.auditInput?.persona !== expectedPersona) return false;
  if (typeof sampleChat.preflightVerdict !== "string" || !sampleChat.preflightVerdict) return false;
  return sampleChat.debriefRequired === true;
}

function normalizeBaseUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function parseEvidenceTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isFilmingRoom(value) {
  const room = String(value || "").trim();
  return Boolean(room) &&
    room !== "default-classroom" &&
    room !== "deploy-verify" &&
    !room.startsWith("deploy-verify-");
}

function isSafeDeployVerifyRoom(value) {
  const room = String(value || "").trim();
  return room === "deploy-verify" || room.startsWith("deploy-verify-");
}

function parseList(value) {
  return String(value || "")
    .split(/\r?\n|;;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFileList(value) {
  return String(value || "")
    .split(/[\n,]+/)
    .map((file) => file.trim())
    .filter(Boolean);
}
