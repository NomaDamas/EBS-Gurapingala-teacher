import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("review:evidence writes structured approval evidence tied to a PR head", async () => {
  const dir = await mkdtemp(join(tmpdir(), "external-review-"));
  const file = join(dir, "external-review.json");
  const transcript = join(dir, "review.md");
  const ciEvidence = join(dir, "ci-evidence.json");
  const deployEvidence = join(dir, "deploy-evidence.json");
  const classroomEvidence = join(dir, "classroom-config.json");
  await writeFile(transcript, "Review decision: APPROVE\nEvidence checked: all gates pass\n");
  await writeFile(ciEvidence, JSON.stringify(buildCiEvidence()));
  await writeFile(deployEvidence, JSON.stringify({ schemaVersion: "deploy-verification-evidence/v1", generatedAt: "2026-07-10T00:01:00.000Z", status: "pass", prHeadSha: "abc123" }));
  await writeFile(classroomEvidence, JSON.stringify({ schemaVersion: "classroom-config-evidence/v1", generatedAt: "2026-07-10T00:02:00.000Z", status: "pass", prHeadSha: "abc123", roomId: "2026-07-13-3-5" }));
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_FILE: file,
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_TRANSCRIPT_FILE: transcript,
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: ciEvidence,
    VERIFY_DEPLOY_EVIDENCE_FILE: deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: classroomEvidence,
    RELEASE_AUDIT_STATUS: "not-run",
    NON_BLOCKING_RISKS: "실제 촬영 전 학생 기기 리허설 필요"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /external review evidence written/);
  const evidence = JSON.parse(await readFile(file, "utf8"));
  assert.equal(evidence.schemaVersion, "external-review-evidence/v1");
  assert.equal(evidence.decision, "APPROVE");
  assert.equal(evidence.reviewer, "GPT-5.5 xhigh equivalent");
  assert.equal(evidence.source.transcriptFile, transcript);
  assert.match(evidence.source.transcriptSha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.source.transcriptBytes, 58);
  assert.equal(evidence.prHeadSha, "abc123");
  assert.equal(evidence.evidenceArtifacts.ci.file, ciEvidence);
  assert.match(evidence.evidenceArtifacts.ci.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.evidenceArtifacts.deployVerification.file, deployEvidence);
  assert.match(evidence.evidenceArtifacts.deployVerification.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.evidenceArtifacts.classroomConfigs[0].file, classroomEvidence);
  assert.equal(evidence.evidenceArtifacts.classroomConfigs[0].roomId, "2026-07-13-3-5");
  assert.equal(evidence.evidenceChecked.ciStatus, "success");
  assert.equal(evidence.evidenceChecked.classroomConfigStatus, "pass");
  assert.deepEqual(evidence.blockingFindings, []);
  assert.deepEqual(evidence.nonBlockingRisks, ["실제 촬영 전 학생 기기 리허설 필요"]);
});

test("review:evidence rejects approval with blocking findings", async () => {
  const artifacts = await writeGateArtifacts();
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "https://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: artifacts.ciEvidence,
    VERIFY_DEPLOY_EVIDENCE_FILE: artifacts.deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidence,
    BLOCKING_FINDINGS: "src/worker.js:1 학생에게 정답 누출 가능"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /APPROVE evidence cannot include BLOCKING_FINDINGS/);
});

test("review:evidence fails closed when required verification statuses are missing", async () => {
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "https://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /TESTS_STATUS=pass or success is required/);
  assert.match(result.stderr, /EVAL_STATUS=pass or success is required/);
  assert.match(result.stderr, /READINESS_STATUS=pass or success is required/);
  assert.match(result.stderr, /SMOKE_STATUS=pass or success is required/);
  assert.match(result.stderr, /VERIFY_DEPLOY_STATUS=pass or success is required/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_STATUS=pass or success is required/);
});

test("review:evidence requires a concrete external review source artifact", async () => {
  const artifacts = await writeGateArtifacts();
  const missing = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: artifacts.ciEvidence,
    VERIFY_DEPLOY_EVIDENCE_FILE: artifacts.deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidence
  });

  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /EXTERNAL_REVIEW_SOURCE_URL or EXTERNAL_REVIEW_TRANSCRIPT_FILE is required/);

  const invalidUrl = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "http://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: artifacts.ciEvidence,
    VERIFY_DEPLOY_EVIDENCE_FILE: artifacts.deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidence
  });

  assert.notEqual(invalidUrl.code, 0);
  assert.match(invalidUrl.stderr, /EXTERNAL_REVIEW_SOURCE_URL must be an https URL/);
});

test("review:evidence requires deployed and classroom evidence artifacts for approval", async () => {
  const artifacts = await writeGateArtifacts();
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "https://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: artifacts.ciEvidence
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE is required/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILES or CLASSROOM_CONFIG_EVIDENCE_FILE is required/);
});

test("review:evidence requires CI evidence artifact for approval", async () => {
  const artifacts = await writeGateArtifacts();
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "https://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    VERIFY_DEPLOY_EVIDENCE_FILE: artifacts.deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidence
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CI_EVIDENCE_FILE is required/);
});

test("review:evidence rejects approval when CI evidence did not pass", async () => {
  const artifacts = await writeGateArtifacts({
    ci: { status: "fail" }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CI_EVIDENCE_FILE status must be pass/);
});

test("review:evidence rejects approval when CI evidence timestamps are invalid", async () => {
  const artifacts = await writeGateArtifacts({
    ci: {
      generatedAt: "2026-07-10T00:00:10.000Z",
      checkRun: {
        id: 101,
        name: "Verify product gates",
        status: "completed",
        conclusion: "success",
        startedAt: "2026-07-10T00:00:00Z",
        completedAt: "2026-07-10T00:00:20Z"
      }
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CI_EVIDENCE_FILE generatedAt must be after checkRun\.completedAt/);
});

test("review:evidence rejects approval when deployed evidence is from a different PR head", async () => {
  const artifacts = await writeGateArtifacts({
    deploy: { prHeadSha: "old123" }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE prHeadSha must match PR_HEAD_SHA/);
});

test("review:evidence rejects approval when classroom evidence points to deploy verification room", async () => {
  const artifacts = await writeGateArtifacts({
    classroom: { roomId: "deploy-verify" }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* roomId must be a filming\/rehearsal room/);
});

function runReviewEvidence(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/write-external-review-evidence.js"], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        ...env
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function validApprovalEnv(artifacts) {
  return {
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "https://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: artifacts.ciEvidence,
    VERIFY_DEPLOY_EVIDENCE_FILE: artifacts.deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidence
  };
}

async function writeGateArtifacts(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "external-review-gates-"));
  const ciEvidence = join(dir, "ci-evidence.json");
  const deployEvidence = join(dir, "deploy-evidence.json");
  const classroomEvidence = join(dir, "classroom-config.json");
  await writeFile(ciEvidence, JSON.stringify(buildCiEvidence(overrides.ci)));
  await writeFile(deployEvidence, JSON.stringify({ schemaVersion: "deploy-verification-evidence/v1", generatedAt: "2026-07-10T00:01:00.000Z", status: "pass", prHeadSha: "abc123", ...(overrides.deploy || {}) }));
  await writeFile(classroomEvidence, JSON.stringify({ schemaVersion: "classroom-config-evidence/v1", generatedAt: "2026-07-10T00:02:00.000Z", status: "pass", prHeadSha: "abc123", roomId: "2026-07-13-3-5", ...(overrides.classroom || {}) }));
  return { ciEvidence, deployEvidence, classroomEvidence };
}

function buildCiEvidence(overrides = {}) {
  return {
    schemaVersion: "ci-evidence/v1",
    generatedAt: "2026-07-10T00:00:30.000Z",
    status: "pass",
    prHeadSha: "abc123",
    checkRun: {
      id: 101,
      name: "Verify product gates",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-07-10T00:00:00Z",
      completedAt: "2026-07-10T00:00:20Z"
    },
    ...overrides
  };
}
