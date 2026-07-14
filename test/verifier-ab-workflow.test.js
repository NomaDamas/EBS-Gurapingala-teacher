import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("verifier A-B workflow compares Luna and Spark without deploying production", async () => {
  const workflow = await readFile(".github/workflows/verifier-ab-evaluation.yml", "utf8");

  assert.match(workflow, /verifier: gpt-5\.6-luna/);
  assert.match(workflow, /verifier: gpt-5\.6-spark/);
  assert.match(workflow, /EVAL_MODELS: gpt-5\.6-terra/);
  assert.match(workflow, /EVAL_JUDGE_MODEL: gpt-5\.6-terra/);
  assert.match(workflow, /EVAL_TURN_COUNT: "20"/);
  assert.match(workflow, /REQUIRE_OPENAI_EVAL: "true"/);
  assert.match(workflow, /node scripts\/probe-verifier-model\.js/);
  assert.match(workflow, /VERIFIER_PROBE_MODEL: \$\{\{ matrix\.verifier \}\}/);
  assert.match(workflow, /VERIFIER_PROBE_TIMEOUT_MS: "15000"/);
  assert.match(workflow, /verifier-\$\{\{ matrix\.variant \}\}-probe\.json/);
  assert.doesNotMatch(workflow, /wrangler deploy/);
});
