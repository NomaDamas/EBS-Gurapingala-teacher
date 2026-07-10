import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("review:packet prints current PR target, review criteria, and evidence command", async () => {
  const result = await runReviewPacket({
    PR_URL: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1",
    PR_HEAD_SHA: "abc123",
    WORKER_URL: "https://worker.example.com",
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_SUMMARY: "50/50 pass, falsehood=100%, levelFit=100%, truthLeak=0%, subtlety=0.84",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /GPT-5\.5 xhigh/);
  assert.match(result.stdout, /Latest PR head SHA: abc123/);
  assert.match(result.stdout, /Expected filming rooms: 2026-07-13-3-5,2026-07-16-3-1/);
  assert.match(result.stdout, /학생 화면에는 Level에 맞춘 거짓 답변만/);
  assert.match(result.stdout, /release:commands가 TEACHER_TOKEN 원문을 출력하지 않고/);
  assert.match(result.stdout, /Review decision: APPROVE \| REQUEST_CHANGES/);
  assert.match(result.stdout, /Approval stop condition/);
  assert.match(result.stdout, /Do not return APPROVE if verify:deploy is not pass\/success/);
  assert.match(result.stdout, /Do not generate external-review-evidence\/v1 until those deploy and classroom statuses are pass\/success/);
  assert.match(result.stdout, /EXTERNAL_REVIEW_DECISION=APPROVE/);
  assert.match(result.stdout, /EXTERNAL_REVIEW_TRANSCRIPT_FILE=artifacts\/external-review-transcript\.md/);
  assert.match(result.stdout, /PR_HEAD_SHA=abc123/);
  assert.match(result.stdout, /npm run review:evidence/);
});

test("review:packet fails closed without PR URL or SHA", async () => {
  const missing = await runReviewPacket({});

  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /PR_URL is required/);
  assert.match(missing.stderr, /PR_HEAD_SHA or GITHUB_SHA is required/);

  const invalid = await runReviewPacket({
    PR_URL: "not-a-url",
    PR_HEAD_SHA: "abc123"
  });

  assert.notEqual(invalid.code, 0);
  assert.match(invalid.stderr, /PR_URL is required/);
});

function runReviewPacket(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/print-external-review-packet.js"], {
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
