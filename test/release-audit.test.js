import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("release audit passes only with review, deploy verification, CI, and commit evidence", async () => {
  const result = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "abc123",
    EXPECTED_PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /release audit passed/);
  assert.match(result.stdout, /prHeadSha=abc123/);
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
});

test("release audit rejects stale review or deploy evidence from an older commit", async () => {
  const result = await runReleaseAudit({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    VERIFY_DEPLOY_STATUS: "pass",
    WORKER_URL: "https://ebs-gurapingala-teacher.example.workers.dev",
    PR_HEAD_SHA: "new-sha",
    EXPECTED_PR_HEAD_SHA: "old-sha",
    CI_STATUS: "success",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /EXPECTED_PR_HEAD_SHA does not match PR_HEAD_SHA/);
});

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
