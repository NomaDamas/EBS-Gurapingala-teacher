import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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
    REQUIRE_CLOUDFLARE_EDGE: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /release audit passed/);
  assert.match(result.stdout, /prHeadSha=abc123/);
  assert.match(result.stdout, /ciEvidenceFile=/);
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

test("release audit requires CI success to be tied to the latest PR head", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/"
  });
  const missing = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    CI_HEAD_SHA: "",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });
  const mismatch = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    CI_HEAD_SHA: "old-sha",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /CI_HEAD_SHA is required/);
  assert.notEqual(mismatch.code, 0);
  assert.match(mismatch.stderr, /CI_HEAD_SHA must match PR_HEAD_SHA/);
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

test("release audit rejects review evidence generated before deploy or classroom evidence", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    externalReviewOverrides: {
      generatedAt: "2026-07-10T00:00:00.000Z"
    },
    deployOverrides: {
      generatedAt: "2026-07-10T00:01:00.000Z"
    },
    classroomOverrides: {
      generatedAt: "2026-07-10T00:02:00.000Z"
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
  assert.match(result.stderr, /EXTERNAL_REVIEW_FILE generatedAt must be after VERIFY_DEPLOY_EVIDENCE_FILE generatedAt/);
  assert.match(result.stderr, /EXTERNAL_REVIEW_FILE generatedAt must be after CLASSROOM_CONFIG_EVIDENCE_FILE .* generatedAt/);
});

test("release audit rejects review evidence generated before CI evidence", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    externalReviewOverrides: {
      generatedAt: "2026-07-10T00:03:00.000Z"
    },
    ciOverrides: {
      generatedAt: "2026-07-10T00:04:00.000Z"
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
  assert.match(result.stderr, /EXTERNAL_REVIEW_FILE generatedAt must be after CI_EVIDENCE_FILE generatedAt/);
});

test("release audit rejects CI evidence with invalid check-run timestamps", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    ciOverrides: {
      checkRun: {
        id: 101,
        name: "Verify product gates",
        status: "completed",
        conclusion: "success",
        htmlUrl: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/actions/runs/1",
        detailsUrl: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/actions/runs/1/job/2",
        startedAt: "2026-07-10T00:00:20Z",
        completedAt: "2026-07-10T00:00:10Z"
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
  assert.match(result.stderr, /CI_EVIDENCE_FILE checkRun\.completedAt must be after checkRun\.startedAt/);
});

test("release audit rejects CI evidence generated before check-run completion", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    ciOverrides: {
      generatedAt: "2026-07-10T00:00:10.000Z",
      checkRun: {
        id: 101,
        name: "Verify product gates",
        status: "completed",
        conclusion: "success",
        htmlUrl: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/actions/runs/1",
        detailsUrl: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/actions/runs/1/job/2",
        startedAt: "2026-07-10T00:00:00Z",
        completedAt: "2026-07-10T00:00:20Z"
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
  assert.match(result.stderr, /CI_EVIDENCE_FILE generatedAt must be after checkRun\.completedAt/);
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

test("release audit rejects external review evidence without a source artifact", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    externalReviewOverrides: {
      source: {}
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
  assert.match(result.stderr, /EXTERNAL_REVIEW_FILE source must include an https review URL or transcriptSha256/);
});

test("release audit rejects external review evidence not bound to current deploy artifacts", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    externalReviewOverrides: {
      evidenceArtifacts: {
        deployVerification: {
          file: "artifacts/old-deploy-evidence.json",
          sha256: "0".repeat(64),
          bytes: 10
        },
        classroomConfigs: []
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
  assert.match(result.stderr, /evidenceArtifacts\.deployVerification\.file must match/);
  assert.match(result.stderr, /evidenceArtifacts\.deployVerification\.sha256 must match the current evidence file/);
  assert.match(result.stderr, /evidenceArtifacts\.classroomConfigs must include every CLASSROOM_CONFIG_EVIDENCE_FILES entry/);
});

test("release audit rejects external review evidence not bound to current CI artifact", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/"
  });
  const review = JSON.parse(await readFile(evidence.externalReviewFile, "utf8"));
  review.evidenceArtifacts.ci = {
    file: "artifacts/old-ci-evidence.json",
    sha256: "0".repeat(64),
    bytes: 10
  };
  await writeFile(evidence.externalReviewFile, `${JSON.stringify(review, null, 2)}\n`);

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
  assert.match(result.stderr, /evidenceArtifacts\.ci\.file must match/);
  assert.match(result.stderr, /evidenceArtifacts\.ci\.sha256 must match the current evidence file/);
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

test("release audit rejects deploy evidence without Cloudflare edge proof when required", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    deployOverrides: {
      requireCloudflareEdge: false,
      cloudflareEdge: {
        present: false,
        headers: {}
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
    REQUIRE_CLOUDFLARE_EDGE: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE must record requireCloudflareEdge=true/);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE must prove Cloudflare edge headers were present/);
});

test("release audit rejects Cloudflare edge proof without response headers", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    deployOverrides: {
      cloudflareEdge: {
        present: true,
        headers: {}
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
    REQUIRE_CLOUDFLARE_EDGE: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /cloudflareEdge\.headers must include Cloudflare response header evidence/);
});

test("release audit rejects deploy evidence without sanitized health snapshot", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    deployOverrides: {
      health: undefined
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
    REQUIRE_CLOUDFLARE_EDGE: "true",
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: evidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /sanitized \/api\/health evidence snapshot/);
});

test("release audit rejects deploy evidence with mismatched expected OpenAI model or timeout", async () => {
  const modelEvidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    deployOverrides: {
      expectedOpenAIModel: "gpt-other"
    }
  });
  const modelResult = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: modelEvidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: modelEvidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: modelEvidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(modelResult.code, 0);
  assert.match(modelResult.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE health\.openaiModel must match expectedOpenAIModel/);

  const timeoutEvidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    deployOverrides: {
      expectedOpenAITimeoutMs: 30000
    }
  });
  const timeoutResult = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    EXTERNAL_REVIEW_FILE: timeoutEvidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: timeoutEvidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: timeoutEvidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(timeoutResult.code, 0);
  assert.match(timeoutResult.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE health\.openaiTimeoutMs must match expectedOpenAITimeoutMs/);
});

test("release audit rejects deploy evidence without safe sharing URLs", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    deployOverrides: {
      sharingUrls: {
        studentUrl: "https://ebs-gurapingala-teacher.example.workers.dev/?room=deploy-verify&token=leaked",
        teacherUrlTemplate: "https://ebs-gurapingala-teacher.example.workers.dev/teacher?room=deploy-verify",
        studentUrlHasToken: true,
        teacherUrlRequiresToken: false
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
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE must include student\/teacher sharing URL evidence with no student token/);
});

test("release audit rejects deploy evidence that purged a filming room", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    deployOverrides: {
      verifyRoom: "2026-07-13-3-5",
      sharingUrls: {
        studentUrl: "https://ebs-gurapingala-teacher.example.workers.dev/?room=2026-07-13-3-5",
        teacherUrlTemplate: "https://ebs-gurapingala-teacher.example.workers.dev/teacher?room=2026-07-13-3-5&token=<TEACHER_TOKEN>",
        studentUrlHasToken: false,
        teacherUrlRequiresToken: true
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
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE verifyRoom must be a deploy verification room/);
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

test("release audit rejects classroom config evidence with invalid optional chat audit sample", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    classroomOverrides: {
      verifyClassroomChat: true,
      sampleChat: {
        sessionId: "classroom-config-2026-07-13-3-5-test",
        studentVisibleAnswerLength: 42,
        auditInput: {
          appliedLevel: 1,
          persona: "다른 페르소나"
        },
        preflightVerdict: "PASS_LEVEL_CALIBRATED_FALSEHOOD",
        debriefRequired: true
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
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* sampleChat must prove \/api\/chat audit used expected Level\/persona/);
});

test("release audit can require classroom chat audit proof for every filming room", async () => {
  const missingEvidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/"
  });
  const missing = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    REQUIRE_CLASSROOM_CHAT_PROOF: "true",
    EXTERNAL_REVIEW_FILE: missingEvidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: missingEvidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: missingEvidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /must record verifyClassroomChat=true when REQUIRE_CLASSROOM_CHAT_PROOF=true/);

  const proofEvidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    externalReviewOverrides: {
      requireClassroomChatProof: true
    },
    classroomOverrides: {
      verifyClassroomChat: true,
      sampleChat: buildSampleChatEvidence(2, "이순신 장군처럼 친절하게 설명한다.")
    },
    classroomTwoOverrides: {
      verifyClassroomChat: true,
      sampleChat: buildSampleChatEvidence(3, "관점 왜곡 실험용 역사 도우미")
    }
  });
  const approved = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLASSROOM_CONFIG: "true",
    REQUIRE_CLASSROOM_CHAT_PROOF: "true",
    EXTERNAL_REVIEW_FILE: proofEvidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: proofEvidence.deployEvidenceFile,
    CLASSROOM_CONFIG_EVIDENCE_FILES: proofEvidence.classroomConfigEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.equal(approved.code, 0, approved.stdout + approved.stderr);
});

test("release audit rejects classroom config evidence without sanitized health snapshot", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    classroomOverrides: {
      observedHealth: undefined
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
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* sanitized \/api\/health evidence snapshot/);
});

test("release audit rejects classroom config evidence with mismatched OpenAI model", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    classroomOverrides: {
      observedHealth: {
        status: 200,
        ok: true,
        openaiConfigured: true,
        openaiModel: "gpt-other",
        teacherProtected: true
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
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* observedHealth\.openaiModel must match expectedOpenAIModel/);
});

test("release audit rejects classroom config evidence without expected OpenAI model", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    classroomOverrides: {
      expectedOpenAIModel: ""
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
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* must record expectedOpenAIModel/);
});

test("release audit rejects classroom config evidence with mismatched OpenAI timeout", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    classroomOverrides: {
      observedHealth: {
        status: 200,
        ok: true,
        openaiConfigured: true,
        openaiModel: "gpt-5.5",
        openaiTimeoutMs: 30000,
        teacherProtected: true
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
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* observedHealth\.openaiTimeoutMs must match expectedOpenAITimeoutMs/);
});

test("release audit rejects classroom config evidence without expected OpenAI timeout", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    classroomOverrides: {
      expectedOpenAITimeoutMs: null
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
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* must record expectedOpenAITimeoutMs/);
});

test("release audit rejects classroom config evidence without safe sharing URLs", async () => {
  const evidence = await writeEvidenceFiles({
    prHeadSha: "abc123",
    workerUrl: "https://ebs-gurapingala-teacher.example.workers.dev/",
    classroomOverrides: {
      sharingUrls: {
        studentUrl: "https://ebs-gurapingala-teacher.example.workers.dev/?room=2026-07-13-3-5&token=leaked",
        teacherUrlTemplate: "https://ebs-gurapingala-teacher.example.workers.dev/teacher?room=2026-07-13-3-5",
        studentUrlHasToken: true,
        teacherUrlRequiresToken: false
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
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* sharing URL evidence with no student token/);
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

async function writeEvidenceFiles({ prHeadSha, workerUrl, externalReviewOverrides = {}, deployOverrides = {}, classroomOverrides = {}, classroomTwoOverrides = {}, ciOverrides = {} }) {
  const dir = await mkdtemp(join(tmpdir(), "release-audit-"));
  const externalReviewFile = join(dir, "external-review.json");
  const ciEvidenceFile = join(dir, "ci-evidence.json");
  const deployEvidenceFile = join(dir, "deploy-evidence.json");
  const classroomConfigEvidenceFile = join(dir, "classroom-config-1.json");
  const secondClassroomConfigEvidenceFile = join(dir, "classroom-config-2.json");
  const deployEvidenceJson = JSON.stringify({
    schemaVersion: "deploy-verification-evidence/v1",
    generatedAt: "2026-07-10T00:01:00.000Z",
    status: "pass",
    workerUrl,
    prHeadSha,
    verifyRoom: "deploy-verify",
    requireOpenAI: true,
    requireTeacherToken: true,
    requireCloudflareEdge: true,
    expectedOpenAIModel: "gpt-5.5",
    expectedOpenAITimeoutMs: 15000,
    cloudflareEdge: {
      present: true,
      headers: {
        cfRay: "test-ray"
      }
    },
    health: {
      status: 200,
      ok: true,
      provider: "openai",
      openaiConfigured: true,
      openaiModel: "gpt-5.5",
      openaiTimeoutMs: 15000,
      teacherProtected: true,
      chatRateLimitPerMinute: 60,
      eventTtlHours: 24
    },
    passedChecks: 19,
    totalChecks: 19,
    sharingUrls: {
      studentUrl: `${workerUrl}?room=deploy-verify`,
      teacherUrlTemplate: `${workerUrl.replace(/\/$/, "")}/teacher?room=deploy-verify&token=<TEACHER_TOKEN>`,
      studentUrlHasToken: false,
      teacherUrlRequiresToken: true
    },
    checks: [],
    ...deployOverrides
  }, null, 2);
  const classroomEvidenceJson = JSON.stringify({
    schemaVersion: "classroom-config-evidence/v1",
    generatedAt: "2026-07-10T00:02:00.000Z",
    status: "pass",
    workerUrl,
    roomId: "2026-07-13-3-5",
    prHeadSha,
    expectedLevel: 2,
    expectedPersona: "이순신 장군처럼 친절하게 설명한다.",
    requireOpenAI: true,
    requireTeacherToken: true,
    expectedOpenAIModel: "gpt-5.5",
    expectedOpenAITimeoutMs: 15000,
    sharingUrls: {
      studentUrl: `${workerUrl}?room=2026-07-13-3-5`,
      teacherUrlTemplate: `${workerUrl.replace(/\/$/, "")}/teacher?room=2026-07-13-3-5&token=<TEACHER_TOKEN>`,
      studentUrlHasToken: false,
      teacherUrlRequiresToken: true
    },
    observedHealth: {
      status: 200,
      ok: true,
      openaiConfigured: true,
      openaiModel: "gpt-5.5",
      openaiTimeoutMs: 15000,
      teacherProtected: true
    },
    observedConfig: {
      level: 2,
      persona: "이순신 장군처럼 친절하게 설명한다."
    },
    checks: [
      { name: "classroom Level/persona matches expected config", passed: true }
    ],
    ...classroomOverrides
  }, null, 2);
  const secondClassroomEvidenceJson = JSON.stringify({
    schemaVersion: "classroom-config-evidence/v1",
    generatedAt: "2026-07-10T00:02:30.000Z",
    status: "pass",
    workerUrl,
    roomId: "2026-07-16-3-1",
    prHeadSha,
    expectedLevel: 3,
    expectedPersona: "관점 왜곡 실험용 역사 도우미",
    requireOpenAI: true,
    requireTeacherToken: true,
    expectedOpenAIModel: "gpt-5.5",
    expectedOpenAITimeoutMs: 15000,
    sharingUrls: {
      studentUrl: `${workerUrl}?room=2026-07-16-3-1`,
      teacherUrlTemplate: `${workerUrl.replace(/\/$/, "")}/teacher?room=2026-07-16-3-1&token=<TEACHER_TOKEN>`,
      studentUrlHasToken: false,
      teacherUrlRequiresToken: true
    },
    observedHealth: {
      status: 200,
      ok: true,
      openaiConfigured: true,
      openaiModel: "gpt-5.5",
      openaiTimeoutMs: 15000,
      teacherProtected: true
    },
    observedConfig: {
      level: 3,
      persona: "관점 왜곡 실험용 역사 도우미"
    },
    checks: [
      { name: "classroom Level/persona matches expected config", passed: true }
    ],
    ...classroomTwoOverrides
  }, null, 2);
  await writeFile(deployEvidenceFile, deployEvidenceJson);
  await writeFile(classroomConfigEvidenceFile, classroomEvidenceJson);
  await writeFile(secondClassroomConfigEvidenceFile, secondClassroomEvidenceJson);
  const ciEvidenceJson = JSON.stringify({
    schemaVersion: "ci-evidence/v1",
    generatedAt: "2026-07-10T00:00:30.000Z",
    status: "pass",
    prUrl: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1",
    repository: "NomaDamas/EBS-Gurapingala-teacher",
    prNumber: 1,
    prHeadSha,
    actualPrHeadSha: prHeadSha,
    expectedCheckName: "Verify product gates",
    checkRun: {
      id: 101,
      name: "Verify product gates",
      status: "completed",
      conclusion: "success",
      htmlUrl: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/actions/runs/1",
      detailsUrl: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/actions/runs/1/job/2",
      startedAt: "2026-07-10T00:00:00Z",
      completedAt: "2026-07-10T00:00:20Z"
    },
    totalCheckRuns: 1,
    ...ciOverrides
  }, null, 2);
  await writeFile(ciEvidenceFile, ciEvidenceJson);
  await writeFile(externalReviewFile, JSON.stringify({
    schemaVersion: "external-review-evidence/v1",
    generatedAt: "2026-07-10T00:03:00.000Z",
    decision: "APPROVE",
    reviewer: "GPT-5.5 xhigh equivalent",
    source: {
      url: "https://reviews.example.com/ebs-gurapingala-teacher/pull-1"
    },
    prHeadSha,
    evidenceArtifacts: {
      ci: {
        file: ciEvidenceFile,
        sha256: sha256(ciEvidenceJson),
        bytes: Buffer.byteLength(ciEvidenceJson)
      },
      deployVerification: {
        file: deployEvidenceFile,
        sha256: sha256(deployEvidenceJson),
        bytes: Buffer.byteLength(deployEvidenceJson)
      },
      classroomConfigs: [
        {
          file: classroomConfigEvidenceFile,
          sha256: sha256(classroomEvidenceJson),
          bytes: Buffer.byteLength(classroomEvidenceJson),
          roomId: "2026-07-13-3-5"
        },
        {
          file: secondClassroomConfigEvidenceFile,
          sha256: sha256(secondClassroomEvidenceJson),
          bytes: Buffer.byteLength(secondClassroomEvidenceJson),
          roomId: "2026-07-16-3-1"
        }
      ]
    },
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
  return {
    externalReviewFile,
    ciEvidenceFile,
    deployEvidenceFile,
    classroomConfigEvidenceFile,
    classroomConfigEvidenceFiles: [classroomConfigEvidenceFile, secondClassroomConfigEvidenceFile]
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function buildSampleChatEvidence(level, persona) {
  return {
    sessionId: `classroom-config-${level}`,
    studentVisibleAnswerLength: 120,
    auditInput: {
      appliedLevel: level,
      persona
    },
    preflightVerdict: "PASS_LEVEL_CALIBRATED_FALSEHOOD",
    debriefRequired: true
  };
}

function runReleaseAudit(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/release-audit.js"], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        CI_HEAD_SHA: env.CI_HEAD_SHA ?? env.PR_HEAD_SHA,
        CI_EVIDENCE_FILE: env.CI_EVIDENCE_FILE ?? (env.EXTERNAL_REVIEW_FILE ? join(dirname(env.EXTERNAL_REVIEW_FILE), "ci-evidence.json") : undefined),
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
