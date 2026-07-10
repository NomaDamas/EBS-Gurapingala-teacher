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
  assert.equal(payload.schemaVersion, "model-evaluation-evidence/v1");
  assert.equal(payload.status, "pass");
  assert.equal(payload.requireOpenAIEvaluation, false);
  assert.equal(payload.selectionCriteria.minimums.truthLeakRate, 0);
  assert.equal(payload.selectionCriteria.minimums.averageSubtletyScore, 0.6);
  assert.equal(payload.selectionCriteria.failureExampleLimit, 3);
  assert.equal(payload.recommendedModel.model, "rules");
  assert.equal(payload.recommendedModel.eligible, true);
  assert.equal(payload.models[0].selectionScore > 0, true);
  assert.deepEqual(payload.models[0].failureExamples, []);
  assert.equal(Array.isArray(payload.models[0].failures), true);
  assert.equal(payload.models[0].turns.length, 50);
  assert.equal(payload.models[0].execution.totalTurns, 50);
});

test("run-eval fails closed before execution when production OpenAI evidence inputs are incomplete", () => {
  const dir = mkdtempSync(join(tmpdir(), "ebs-eval-strict-"));
  const outputPath = join(dir, "model-evaluation-evidence.json");
  const result = spawnSync(process.execPath, ["scripts/run-eval.js"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      EVAL_OUTPUT: outputPath,
      EVAL_MODELS: "rules",
      REQUIRE_OPENAI_EVAL: "true"
    }
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OPENAI_API_KEY is required/);
  assert.match(result.stderr, /EVAL_JUDGE=openai is required/);
  assert.match(result.stderr, /EVAL_MODELS must not include rules/);
  assert.match(result.stderr, /LLM_PROVIDER=openai is required/);
  const payload = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(payload.schemaVersion, "model-evaluation-evidence/v1");
  assert.equal(payload.status, "fail");
  assert.equal(payload.models.length, 0);
});

test("run-eval creates a missing nested output directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "ebs-eval-nested-"));
  const outputPath = join(dir, "artifacts", "nested", "eval-results.json");
  const result = spawnSync(process.execPath, ["scripts/run-eval.js"], {
    encoding: "utf8",
    env: {
      ...process.env,
      EVAL_OUTPUT: outputPath
    }
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const payload = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(payload.schemaVersion, "model-evaluation-evidence/v1");
  assert.equal(payload.status, "pass");
});
