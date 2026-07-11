import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { EVALUATION_SET_50 } from "../src/domain/evaluation-set.js";
import {
  TRUSTED_MODEL_EVALUATION_REPOSITORY,
  TRUSTED_MODEL_EVALUATION_WORKFLOW,
  verifyModelEvaluationAttestation
} from "../src/domain/model-evidence-attestation.js";

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
const evaluationSetEvidenceFile = String(process.env.EVALUATION_SET_EVIDENCE_FILE || "").trim();
const modelEvaluationEvidenceFile = String(process.env.MODEL_EVALUATION_EVIDENCE_FILE || "").trim();
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
if (decision === "approve" && !evaluationSetEvidenceFile) {
  failures.push("EVALUATION_SET_EVIDENCE_FILE is required for APPROVE evidence so the review is tied to the 50-turn teacher-review set");
}
if (decision === "approve" && !modelEvaluationEvidenceFile) {
  failures.push("MODEL_EVALUATION_EVIDENCE_FILE is required for APPROVE evidence so the review is tied to the real OpenAI 50-turn run");
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
if (decision === "approve") {
  const attestation = verifyModelEvaluationAttestation({
    evidenceFile: modelEvaluationEvidenceFile,
    expectedHeadSha: prHeadSha
  });
  if (!attestation.ok) {
    failures.push(...attestation.failures.map((failure) => `MODEL_EVALUATION_EVIDENCE_FILE ${failure}`));
  } else {
    evidenceArtifacts.modelEvaluation.attestation = attestation;
  }
}
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
    evaluationSet: evaluationSetEvidenceFile ? await hashEvidenceFile(evaluationSetEvidenceFile) : null,
    modelEvaluation: modelEvaluationEvidenceFile ? await hashEvidenceFile(modelEvaluationEvidenceFile) : null,
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
  validateArtifact(artifacts.evaluationSet, {
    label: "EVALUATION_SET_EVIDENCE_FILE",
    schemaVersion: "evaluation-set-evidence/v1",
    requireRoom: false
  });
  validateEvaluationSetEvidenceArtifact(artifacts.evaluationSet);
  validateArtifact(artifacts.modelEvaluation, {
    label: "MODEL_EVALUATION_EVIDENCE_FILE",
    schemaVersion: "model-evaluation-evidence/v1",
    requireRoom: false
  });
  validateModelEvaluationEvidenceArtifact(artifacts.modelEvaluation);
  validateModelEvaluationAttestation(artifacts.modelEvaluation);
  validateArtifact(artifacts.deployVerification, {
    label: "VERIFY_DEPLOY_EVIDENCE_FILE",
    schemaVersion: "deploy-verification-evidence/v1",
    requireRoom: false
  });
  validateDeployEvidenceArtifact(artifacts.deployVerification);
  validateModelDeploymentConsistency(artifacts.modelEvaluation, artifacts.deployVerification);
  for (const artifact of artifacts.classroomConfigs) {
    validateArtifact(artifact, {
      label: `CLASSROOM_CONFIG_EVIDENCE_FILE ${artifact?.file || ""}`.trim(),
      schemaVersion: "classroom-config-evidence/v1",
      requireRoom: true
    });
    validateClassroomEvidenceArtifact(artifact, artifacts.deployVerification?.workerUrl);
    validateClassroomModelConsistency(artifact, artifacts.modelEvaluation, artifacts.deployVerification);
  }
  validateExpectedClassroomRooms(artifacts.classroomConfigs);
}

function validateModelEvaluationAttestation(artifact) {
  const attestation = artifact?.attestation;
  if (attestation?.ok !== true ||
    attestation.schemaVersion !== "model-evaluation-attestation/v1" ||
    attestation.prHeadSha !== prHeadSha ||
    attestation.evidenceSha256 !== artifact.sha256 ||
    attestation.repository !== TRUSTED_MODEL_EVALUATION_REPOSITORY ||
    attestation.workflowPath !== TRUSTED_MODEL_EVALUATION_WORKFLOW) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE must have a verified GitHub Actions attestation for the current evidence SHA-256 and PR_HEAD_SHA");
  }
}

function validateModelDeploymentConsistency(modelEvaluation, deployVerification) {
  if (!modelEvaluation || !deployVerification) return;
  if (deployVerification.expectedOpenAIModel !== modelEvaluation.expectedGeneratorModel) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE expectedOpenAIModel must match MODEL_EVALUATION_EVIDENCE_FILE expectedGeneratorModel");
  }
  if (deployVerification.expectedOpenAIVerifierModel !== modelEvaluation.expectedVerifierModel) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE expectedOpenAIVerifierModel must match MODEL_EVALUATION_EVIDENCE_FILE expectedVerifierModel");
  }
}

function validateClassroomModelConsistency(classroom, modelEvaluation, deployVerification) {
  if (!classroom) return;
  const label = `CLASSROOM_CONFIG_EVIDENCE_FILE ${classroom.file || ""}`.trim();
  if (deployVerification &&
    classroom.expectedOpenAIModel !== deployVerification.expectedOpenAIModel) {
    failures.push(`${label} expectedOpenAIModel must match VERIFY_DEPLOY_EVIDENCE_FILE expectedOpenAIModel`);
  }
  if (deployVerification &&
    classroom.expectedOpenAIVerifierModel !== deployVerification.expectedOpenAIVerifierModel) {
    failures.push(`${label} expectedOpenAIVerifierModel must match VERIFY_DEPLOY_EVIDENCE_FILE expectedOpenAIVerifierModel`);
  }
  if (modelEvaluation &&
    classroom.expectedOpenAIModel !== modelEvaluation.expectedGeneratorModel) {
    failures.push(`${label} expectedOpenAIModel must match MODEL_EVALUATION_EVIDENCE_FILE expectedGeneratorModel`);
  }
  if (modelEvaluation &&
    classroom.expectedOpenAIVerifierModel !== modelEvaluation.expectedVerifierModel) {
    failures.push(`${label} expectedOpenAIVerifierModel must match MODEL_EVALUATION_EVIDENCE_FILE expectedVerifierModel`);
  }
}

function validateEvaluationSetEvidenceArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") return;
  if (artifact.totalTurns !== 50) {
    failures.push("EVALUATION_SET_EVIDENCE_FILE totalTurns must be 50");
  }
  if (artifact.teacherAuditIncluded !== true) {
    failures.push("EVALUATION_SET_EVIDENCE_FILE must include teacher audit fields");
  }
  if (artifact.pressureTurnCount !== 10) {
    failures.push("EVALUATION_SET_EVIDENCE_FILE pressureTurnCount must be 10");
  }
  if (artifact.publicProjection?.exposesTeacherAudit !== false) {
    failures.push("EVALUATION_SET_EVIDENCE_FILE publicProjection must not expose teacher audit fields");
  }
  if (!Array.isArray(artifact.teacherReviewItems) || artifact.teacherReviewItems.length !== 50) {
    failures.push("EVALUATION_SET_EVIDENCE_FILE teacherReviewItems must contain 50 turns");
  }
  for (const level of ["1", "2", "3", "4"]) {
    const bucket = artifact.byLevel?.[level];
    if (!bucket || !Number.isFinite(bucket.total) || bucket.total <= 0 || bucket.passedPreflight !== bucket.total) {
      failures.push(`EVALUATION_SET_EVIDENCE_FILE byLevel.${level} must have all turns passing preflight`);
    }
  }
}

function validateModelEvaluationEvidenceArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") return;
  if (artifact.requireOpenAIEvaluation !== true) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE must record requireOpenAIEvaluation=true");
  }
  if (artifact.totalTurnsPerModel !== 50) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE totalTurnsPerModel must be 50");
  }
  if (artifact.pressureTurnCount !== 10) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE pressureTurnCount must be 10");
  }
  const expectedSetSha256 = createHash("sha256")
    .update(JSON.stringify(EVALUATION_SET_50))
    .digest("hex");
  if (artifact.evaluationSetSha256 !== expectedSetSha256) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE evaluationSetSha256 must match the current 50-turn set");
  }
  const startedAt = parseEvidenceTimestamp(artifact.startedAt);
  const completedAt = parseEvidenceTimestamp(artifact.completedAt);
  const generatedAt = parseEvidenceTimestamp(artifact.generatedAt);
  if (!startedAt || !completedAt || !generatedAt ||
    completedAt < startedAt ||
    generatedAt < completedAt) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE timestamps must be valid and ordered startedAt <= completedAt <= generatedAt");
  }
  const generatorModel = String(artifact.expectedGeneratorModel || "").trim();
  const verifierModel = String(artifact.expectedVerifierModel || "").trim();
  const judgeModel = String(artifact.expectedJudgeModel || "").trim();
  if (!generatorModel || !verifierModel || !judgeModel) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE must record expected generator, verifier, and judge models");
  }
  if (artifact.recommendedModel?.model !== generatorModel ||
    artifact.recommendedModel?.eligible !== true) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE recommendedModel must be the eligible expectedGeneratorModel");
  }
  const result = Array.isArray(artifact.models)
    ? artifact.models.find((item) => item?.model === generatorModel)
    : null;
  if (!result) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE must include the expected generator model result");
    return;
  }
  if (result.total !== 50 || result.passed !== 50 || result.failed !== 0) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE expected model must pass all 50 turns");
  }
  if (result.execution?.openaiGeneratedTurns !== 50 ||
    result.execution?.openaiVerifiedTurns !== 50 ||
    result.execution?.openaiJudgedTurns !== 50 ||
    result.execution?.fallbackTurns !== 0 ||
    result.execution?.blockedTurns !== 0) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE must prove 50 OpenAI generator/verifier/judge turns with zero fallback or blocked turns");
  }
  if (result.metrics?.falsehoodRate !== 1 ||
    result.metrics?.levelFitRate !== 1 ||
    result.metrics?.truthLeakRate !== 0 ||
    Number(result.metrics?.averageSubtletyScore) < Number(artifact.selectionCriteria?.minimums?.averageSubtletyScore) ||
    Number(result.metrics?.averageTeacherAuditQuality) < 0.75) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE metrics must satisfy production selection minimums");
  }
  if (!Array.isArray(result.turns) || result.turns.length !== 50 ||
    result.turns.some((turn) =>
      turn?.shouldSendToStudent !== true ||
      turn?.provider?.name !== "openai" ||
      turn?.provider?.model !== generatorModel ||
      turn?.provider?.verifier?.name !== "openai" ||
      turn?.provider?.verifier?.model !== verifierModel ||
      turn?.preflight?.approvedForStudent !== true ||
      turn?.preflight?.verifierApproved !== true ||
      turn?.judge?.provider !== "openai" ||
      turn?.judge?.model !== judgeModel ||
      turn?.judge?.pass !== true
  )) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE every turn must prove expected OpenAI generator/verifier/judge approval");
  }
  if (!Array.isArray(result.turns)) return;
  const expectedByTurn = new Map(EVALUATION_SET_50.map((item) => [item.turn, item.expectedLevel]));
  if (new Set(result.turns.map((turn) => turn?.turn)).size !== 50 ||
    result.turns.some((turn) => expectedByTurn.get(turn?.turn) !== turn?.expectedLevel)) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE must preserve all 50 unique turn numbers and expected levels");
  }
  const responseIds = result.turns.flatMap((turn) => [
    turn?.provider?.responseId,
    turn?.provider?.verifier?.responseId,
    turn?.judge?.responseId
  ]);
  const responseModels = result.turns.flatMap((turn) => [
    turn?.provider?.responseModel,
    turn?.provider?.verifier?.responseModel,
    turn?.judge?.responseModel
  ]);
  if (responseIds.some((value) => !String(value || "").trim()) ||
    new Set(responseIds).size !== 150) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE must contain 150 unique OpenAI response IDs");
  }
  if (responseModels.some((value) => !String(value || "").trim())) {
    failures.push("MODEL_EVALUATION_EVIDENCE_FILE every API call must record the observed response model");
  }
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
  if (!String(artifact.expectedOpenAIVerifierModel || "").trim()) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE must record expectedOpenAIVerifierModel");
  } else if (artifact.health?.openaiVerifierModel !== artifact.expectedOpenAIVerifierModel) {
    failures.push("VERIFY_DEPLOY_EVIDENCE_FILE health.openaiVerifierModel must match expectedOpenAIVerifierModel");
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
  if (!Number.isInteger(artifact.expectedLevel) || artifact.expectedLevel < 1 || artifact.expectedLevel > 5) {
    failures.push(`${label} expectedLevel must be 1, 2, 3, 4, or 5 (Combination)`);
  }
  if (!String(artifact.expectedPersona || "").trim()) {
    failures.push(`${label} expectedPersona is required`);
  }
  if (!["experiment", "truth"].includes(artifact.expectedResponseMode)) {
    failures.push(`${label} expectedResponseMode must be experiment or truth`);
  }
  if (!hasValidClassroomHealthEvidence(artifact.observedHealth)) {
    failures.push(`${label} must include a sanitized /api/health evidence snapshot`);
  }
  if (!String(artifact.expectedOpenAIModel || "").trim()) {
    failures.push(`${label} must record expectedOpenAIModel`);
  } else if (artifact.observedHealth?.openaiModel !== artifact.expectedOpenAIModel) {
    failures.push(`${label} observedHealth.openaiModel must match expectedOpenAIModel`);
  }
  if (!String(artifact.expectedOpenAIVerifierModel || "").trim()) {
    failures.push(`${label} must record expectedOpenAIVerifierModel`);
  } else if (artifact.observedHealth?.openaiVerifierModel !== artifact.expectedOpenAIVerifierModel) {
    failures.push(`${label} observedHealth.openaiVerifierModel must match expectedOpenAIVerifierModel`);
  }
  if (!Number.isFinite(artifact.expectedOpenAITimeoutMs)) {
    failures.push(`${label} must record expectedOpenAITimeoutMs`);
  } else if (artifact.observedHealth?.openaiTimeoutMs !== artifact.expectedOpenAITimeoutMs) {
    failures.push(`${label} observedHealth.openaiTimeoutMs must match expectedOpenAITimeoutMs`);
  }
  if (Number(artifact.observedConfig?.level) !== artifact.expectedLevel ||
    artifact.observedConfig?.persona !== artifact.expectedPersona ||
    artifact.observedConfig?.responseMode !== artifact.expectedResponseMode) {
    failures.push(`${label} observedConfig must match expected Level/persona/response mode`);
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
    !hasValidSampleClassroomChat(artifact.sampleChat, artifact.expectedLevel, artifact.expectedPersona, artifact.expectedOpenAIVerifierModel)) {
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
    if (json.expectedOpenAIVerifierModel !== undefined) artifact.expectedOpenAIVerifierModel = json.expectedOpenAIVerifierModel;
    if (json.expectedOpenAITimeoutMs !== undefined) artifact.expectedOpenAITimeoutMs = json.expectedOpenAITimeoutMs;
    if (json.passedChecks !== undefined) artifact.passedChecks = json.passedChecks;
    if (json.totalChecks !== undefined) artifact.totalChecks = json.totalChecks;
    if (json.checkRun) artifact.checkRun = json.checkRun;
    if (json.totalTurns !== undefined) artifact.totalTurns = json.totalTurns;
    if (json.requireOpenAIEvaluation !== undefined) artifact.requireOpenAIEvaluation = json.requireOpenAIEvaluation;
    if (json.startedAt !== undefined) artifact.startedAt = json.startedAt;
    if (json.completedAt !== undefined) artifact.completedAt = json.completedAt;
    if (json.totalTurnsPerModel !== undefined) artifact.totalTurnsPerModel = json.totalTurnsPerModel;
    if (json.pressureTurnCount !== undefined) artifact.pressureTurnCount = json.pressureTurnCount;
    if (json.evaluationSetSha256 !== undefined) artifact.evaluationSetSha256 = json.evaluationSetSha256;
    if (json.expectedGeneratorModel !== undefined) artifact.expectedGeneratorModel = json.expectedGeneratorModel;
    if (json.expectedVerifierModel !== undefined) artifact.expectedVerifierModel = json.expectedVerifierModel;
    if (json.expectedJudgeModel !== undefined) artifact.expectedJudgeModel = json.expectedJudgeModel;
    if (json.selectionCriteria) artifact.selectionCriteria = json.selectionCriteria;
    if (json.recommendedModel) artifact.recommendedModel = json.recommendedModel;
    if (json.models) artifact.models = json.models;
    if (json.teacherAuditIncluded !== undefined) artifact.teacherAuditIncluded = json.teacherAuditIncluded;
    if (json.pressureTurnCount !== undefined) artifact.pressureTurnCount = json.pressureTurnCount;
    if (json.publicProjection) artifact.publicProjection = json.publicProjection;
    if (json.teacherReviewItems) artifact.teacherReviewItems = json.teacherReviewItems;
    if (json.byLevel) artifact.byLevel = json.byLevel;
    if (json.roomId) artifact.roomId = json.roomId;
    if (json.verifyRoom) artifact.verifyRoom = json.verifyRoom;
    if (json.expectedLevel !== undefined) artifact.expectedLevel = json.expectedLevel;
    if (json.expectedPersona !== undefined) artifact.expectedPersona = json.expectedPersona;
    if (json.expectedResponseMode !== undefined) artifact.expectedResponseMode = json.expectedResponseMode;
    if (json.expectedOpenAIModel !== undefined) artifact.expectedOpenAIModel = json.expectedOpenAIModel;
    if (json.expectedOpenAIVerifierModel !== undefined) artifact.expectedOpenAIVerifierModel = json.expectedOpenAIVerifierModel;
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
  if (typeof health.openaiVerifierModel !== "string") return false;
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
  if (typeof health.openaiVerifierModel !== "string") return false;
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

function hasValidSampleClassroomChat(sampleChat, expectedLevel, expectedPersona, expectedVerifierModel) {
  if (!sampleChat || typeof sampleChat !== "object") return false;
  if (!String(sampleChat.sessionId || "").startsWith("classroom-config-")) return false;
  if (!Number.isFinite(sampleChat.studentVisibleAnswerLength) || sampleChat.studentVisibleAnswerLength <= 0) return false;
  if (sampleChat.auditInput?.appliedLevel !== expectedLevel) return false;
  if (sampleChat.auditInput?.persona !== expectedPersona) return false;
  if (typeof sampleChat.preflightVerdict !== "string" || !sampleChat.preflightVerdict) return false;
  if (sampleChat.verifier?.name !== "openai") return false;
  if (sampleChat.verifier?.model !== expectedVerifierModel) return false;
  if (sampleChat.verifier?.approved !== true) return false;
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
