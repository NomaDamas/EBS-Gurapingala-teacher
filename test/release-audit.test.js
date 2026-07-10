import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("release audit passes only with review, deploy verification, CI, and commit evidence", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/"
  });
  const result = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /release audit passed/);
  assert.match(result.stdout, /prHeadSha=abc123/);
  assert.match(result.stdout, /externalReviewFile=/);
  assert.match(result.stdout, /verifyDeployEvidenceFile=/);
  assert.match(result.stdout, /classroomConfigEvidenceFiles=.*classroom-config-1\.json.*classroom-config-2\.json/);
  assert.match(result.stdout, /expectedClassroomRooms=2026-07-13-3-5,2026-07-16-3-1/);
});

test("release audit fails closed without external review and real deploy verification", async () => {
  const result = await runReleaseAudit({
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /EXTERNAL_REVIEW_DECISION=APPROVE is required/);
  assert.match(result.stderr, /VERIFY_DEPLOY_STATUS=pass is required/);
  assert.match(result.stderr, /real https Cloudflare Worker URL/);
  assert.match(result.stderr, /EXTERNAL_REVIEW_FILE is required/);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE is required/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE is required/);
});

test("release audit rejects stale review or deploy evidence from an older commit", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "old-sha",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/"
  });
  const result = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "new-sha",
    EXPECTED_PR_HEAD_SHA: "new-sha",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /EXTERNAL_REVIEW_FILE prHeadSha must match PR_HEAD_SHA/);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE prHeadSha must match PR_HEAD_SHA/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* prHeadSha must match PR_HEAD_SHA/);
});

test("release audit rejects unstructured external review evidence", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    externalReviewOverrides: {
      schemaVersion: "legacy-review-note",
      evidenceChecked: {
        ciStatus: "success",
        testsStatus: "pass",
        evalStatus: "pass",
        readinessStatus: "pass",
        smokeStatus: "pass",
        verifyDeployStatus: "pass",
        classroomConfigStatus: "not-run"
      },
      blockingFindings: ["학생에게 정답이 노출될 수 있음"]
    }
  });
  const result = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /schemaVersion must be external-review-evidence\/v1/);
  assert.match(result.stderr, /evidenceChecked\.classroomConfigStatus must be pass or success/);
  assert.match(result.stderr, /cannot include blockingFindings/);
});

test("release audit rejects deploy evidence that was not strict OpenAI teacher-token verification", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    deployOverrides: {
      requireOpenAI: false,
      requireTeacherToken: false
    }
  });
  const result = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE must record requireOpenAI=true/);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE must record requireTeacherToken=true/);
});

test("release audit rejects classroom config evidence from deploy-verify room", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    classroomOverrides: {
      roomId: "deploy-verify"
    }
  });
  const result = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* roomId must be a filming\/rehearsal room/);
});

test("release audit rejects classroom config evidence with mismatched observed config", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    classroomOverrides: {
      observedConfig: {
        level: 1,
        persona: "다른 페르소나"
      }
    }
  });
  const result = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* observedConfig must match expected Level\/persona/);
});

test("release audit rejects duplicate classroom config evidence rooms", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    classroomTwoOverrides: {
      roomId: "2026-07-13-3-5"
    }
  });
  const result = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /roomId must be unique across CLASSROOM_CONFIG_EVIDENCE_FILES/);
});

test("release audit rejects missing expected classroom room evidence", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/"
  });
  const result = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles[0],
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /missing expected filming room 2026-07-16-3-1/);
});

test("release audit rejects unexpected classroom room evidence", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/"
  });
  const result = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /contains unexpected filming room 2026-07-16-3-1/);
});

async function writeEvidenceFiles({ prHeadSha, workerUrl, externalReviewOverrides = {}, deployOverrides = {}, classroomOverrides = {}, classroomTwoOverrides = {} }) {
  const dir = await mkdtemp(join(tmpdir(), "release-audit-"));
  const externalReviewFile = join(dir, "external-review.json");
  const deployEvidenceFile = join(dir, "deploy-evidence.json");
  const classroomConfigEvidenceFile = join(dir, "classroom-config-1.json");
  const secondClassroomConfigEvidenceFile = join(dir, "classroom-config-2.json");
  await writeFile(externalReviewFile, JSON.stringify({
    schemaVersion: "external-review-evidence/v1",
    decision: "APPROVE",
    reviewer: "GPT-5.5 xhigh equivalent",
    prHeadSha,
    evidenceChecked: {
      ciStatus: "success",
      testsStatus: "pass",
      evalStatus: "pass",
      readinessStatus: "pass",
      smokeStatus: "pass",
      verifyDeployStatus: "pass",
      classroomConfigStatus: "pass",
      releaseAuditStatus: "not-run"
    },
    blockingFindings: [],
    nonBlockingRisks: [],
    ...externalReviewOverrides
  }, null, 2));
  await writeFile(deployEvidenceFile, JSON.stringify({
    schemaVersion: "deploy-verification-evidence/v1",
    status: "pass",
    workerUrl,
    prHeadSha,
    requireOpenAI: true,
    requireTeacherToken: true,
    passedChecks: 18,
    totalChecks: 18,
    checks: [],
    ...deployOverrides
  }, null, 2));
  await writeFile(classroomConfigEvidenceFile, JSON.stringify({
    schemaVersion: "classroom-config-evidence/v1",
    status: "pass",
    workerUrl,
    roomId: "2026-07-13-3-5",
    prHeadSha,
    expectedLevel: 2,
    expectedPersona: "이순신 장군처럼 친절하게 설명한다.",
    requireOpenAI: true,
    requireTeacherToken: true,
    observedConfig: {
      level: 2,
      persona: "이순신 장군처럼 친절하게 설명한다."
    },
    checks: [
      { name: "classroom Level/persona matches expected config", passed: true }
    ],
    ...classroomOverrides
  }, null, 2));
  await writeFile(secondClassroomConfigEvidenceFile, JSON.stringify({
    schemaVersion: "classroom-config-evidence/v1",
    status: "pass",
    workerUrl,
    roomId: "2026-07-16-3-1",
    prHeadSha,
    expectedLevel: 3,
    expectedPersona: "관점 왜곡 실험용 역사 도우미",
    requireOpenAI: true,
    requireTeacherToken: true,
    observedConfig: {
      level: 3,
      persona: "관점 왜곡 실험용 역사 도우미"
    },
    checks: [
      { name: "classroom Level/persona matches expected config", passed: true }
    ],
    ...classroomTwoOverrides
  }, null, 2));
  return {
    externalReviewFile,
    deployEvidenceFile,
    classroomConfigEvidenceFile,
    classroomConfigEvidenceFiles: [classroomConfigEvidenceFile, secondClassroomConfigEvidenceFile]
  };
}

function runReleaseAudit(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/release-audit.js"], {
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
