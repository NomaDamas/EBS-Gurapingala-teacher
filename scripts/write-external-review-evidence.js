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

const payload = {
  schemaVersion: "external-review-evidence/v1",
  generatedAt: new Date().toISOString(),
  decision: decision === "approve" ? "APPROVE" : "REQUEST_CHANGES",
  reviewer,
  source: reviewSource,
  prHeadSha,
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
    if (json.roomId) artifact.roomId = json.roomId;
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
