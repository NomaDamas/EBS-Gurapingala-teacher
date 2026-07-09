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
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /release audit passed/);
  assert.match(result.stdout, /prHeadSha=abc123/);
  assert.match(result.stdout, /externalReviewFile=/);
  assert.match(result.stdout, /verifyDeployEvidenceFile=/);
});

test("release audit fails closed without external review and real deploy verification", async () => {
  const result = await runReleaseAudit({
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /EXTERNAL_REVIEW_DECISION=APPROVE is required/);
  assert.match(result.stderr, /VERIFY_DEPLOY_STATUS=pass is required/);
  assert.match(result.stderr, /real https Cloudflare Worker URL/);
  assert.match(result.stderr, /EXTERNAL_REVIEW_FILE is required/);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE is required/);
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
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /EXTERNAL_REVIEW_FILE prHeadSha must match PR_HEAD_SHA/);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE prHeadSha must match PR_HEAD_SHA/);
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
    EXTERNAL_REVIEW_FILE: evidence.externalReviewFile,
    VERIFY_DEPLOY_EVIDENCE_FILE: evidence.deployEvidenceFile
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE must record requireOpenAI=true/);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE must record requireTeacherToken=true/);
});

async function writeEvidenceFiles({ prHeadSha, workerUrl, deployOverrides = {} }) {
  const dir = await mkdtemp(join(tmpdir(), "release-audit-"));
  const externalReviewFile = join(dir, "external-review.json");
  const deployEvidenceFile = join(dir, "deploy-evidence.json");
  await writeFile(externalReviewFile, JSON.stringify({
    decision: "APPROVE",
    reviewer: "GPT-5.5 xhigh equivalent",
    prHeadSha
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
  return { externalReviewFile, deployEvidenceFile };
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
