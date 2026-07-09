import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("review:evidence writes structured approval evidence tied to a PR head", async () => {
  const dir = await mkdtemp(join(tmpdir(), "external-review-"));
  const file = join(dir, "external-review.json");
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_FILE: file,
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    RELEASE_AUDIT_STATUS: "not-run",
    NON_BLOCKING_RISKS: "실제 촬영 전 학생 기기 리허설 필요"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /external review evidence written/);
  const evidence = JSON.parse(await readFile(file, "utf8"));
  assert.equal(evidence.schemaVersion, "external-review-evidence/v1");
  assert.equal(evidence.decision, "APPROVE");
  assert.equal(evidence.reviewer, "GPT-5.5 xhigh equivalent");
  assert.equal(evidence.prHeadSha, "abc123");
  assert.equal(evidence.evidenceChecked.ciStatus, "success");
  assert.deepEqual(evidence.blockingFindings, []);
  assert.deepEqual(evidence.nonBlockingRisks, ["실제 촬영 전 학생 기기 리허설 필요"]);
});

test("review:evidence rejects approval with blocking findings", async () => {
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    BLOCKING_FINDINGS: "src/worker.js:1 학생에게 정답 누출 가능"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /APPROVE evidence cannot include BLOCKING_FINDINGS/);
});

test("review:evidence fails closed when required verification statuses are missing", async () => {
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /TESTS_STATUS=pass or success is required/);
  assert.match(result.stderr, /EVAL_STATUS=pass or success is required/);
  assert.match(result.stderr, /READINESS_STATUS=pass or success is required/);
  assert.match(result.stderr, /SMOKE_STATUS=pass or success is required/);
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
