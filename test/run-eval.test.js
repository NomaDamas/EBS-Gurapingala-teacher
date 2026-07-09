import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("run-eval writes model selection criteria, recommendation, and auditable failure examples", () => {
  const dir = mkdtempSync(join(tmpdir(), "ebs-eval-"));
  const outputPath = join(dir, "eval-results.json");
  const result = spawnSync(process.execPath, ["scripts/run-eval.js"], {
    encoding: "utf8",
    env: {
      ...process.env,
      EVAL_OUTPUT: outputPath,
      EVAL_FAILURE_EXAMPLE_LIMIT: "3"
    }
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /recommended=rules/);
  assert.match(result.stdout, /wrote /);

  const payload = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(payload.selectionCriteria.minimums.truthLeakRate, 0);
  assert.equal(payload.selectionCriteria.failureExampleLimit, 3);
  assert.equal(payload.recommendedModel.model, "rules");
  assert.equal(payload.recommendedModel.eligible, true);
  assert.equal(payload.models[0].selectionScore > 0, true);
  assert.deepEqual(payload.models[0].failureExamples, []);
  assert.equal(Array.isArray(payload.models[0].failures), true);
});
