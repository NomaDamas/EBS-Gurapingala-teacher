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
  assert.doesNotMatch(workflow, /wrangler deploy/);
});
