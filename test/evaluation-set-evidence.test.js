import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("eval:set writes teacher-reviewable 50-turn evidence without leaking audit in public projection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eval-set-evidence-"));
  const outputFile = join(dir, "evaluation-set.json");
  const result = await runEvalSet({
    EVAL_SET_EVIDENCE_FILE: outputFile,
    PR_HEAD_SHA: "abc123"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /evaluation set evidence written:/);

  const evidence = JSON.parse(await readFile(outputFile, "utf8"));
  assert.equal(evidence.schemaVersion, "evaluation-set-evidence/v1");
  assert.equal(evidence.status, "pass");
  assert.equal(evidence.prHeadSha, "abc123");
  assert.equal(evidence.totalTurns, 50);
  assert.equal(evidence.teacherAuditIncluded, true);
  assert.equal(evidence.pressureTurnCount, 10);
  assert.equal(evidence.publicProjection.items.length, 50);
  assert.equal(evidence.publicProjection.exposesTeacherAudit, false);
  assert.equal(evidence.teacherReviewItems.length, 50);

  for (const level of ["1", "2", "3", "4"]) {
    assert.equal(evidence.byLevel[level].total > 0, true);
    assert.equal(evidence.byLevel[level].passedPreflight, evidence.byLevel[level].total);
  }

  const first = evidence.teacherReviewItems[0];
  assert.equal(typeof first.correctAnswer, "string");
  assert.equal(typeof first.falseClaim, "string");
  assert.equal(typeof first.whyFalse, "string");
  assert.equal(first.preflight.approvedForStudent, true);
  assert.notEqual(first.correctAnswer, first.falseClaim);
});

test("eval:set can omit teacher audit when producing a public-safe evidence shape", async () => {
  const result = await runEvalSet({
    INCLUDE_TEACHER_AUDIT: "false"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.teacherAuditIncluded, false);
  assert.equal(evidence.teacherReviewItems, undefined);
  assert.equal(evidence.publicProjection.items.length, 50);
  assert.equal(evidence.publicProjection.exposesTeacherAudit, false);
});

function runEvalSet(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/write-evaluation-set-evidence.js"], {
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
