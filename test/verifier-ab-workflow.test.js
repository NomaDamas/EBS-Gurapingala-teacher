import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("latency A-B workflow compares four production-safe candidates without deploying production", async () => {
  const workflow = await readFile(".github/workflows/verifier-ab-evaluation.yml", "utf8");

  assert.match(workflow, /variant: baseline-terra-low-luna-low/);
  assert.match(workflow, /variant: luna-none-luna-none/);
  assert.match(workflow, /variant: luna-low-luna-none/);
  assert.match(workflow, /variant: luna-low-nano-none/);
  assert.match(workflow, /generator: gpt-5\.6-terra/);
  assert.match(workflow, /generator: gpt-5\.6-luna/);
  assert.match(workflow, /verifier: gpt-5\.6-luna/);
  assert.match(workflow, /verifier: gpt-5\.4-nano/);
  assert.match(workflow, /generator_effort: none/);
  assert.match(workflow, /verifier_effort: none/);
  assert.match(workflow, /EVAL_MODELS: \$\{\{ matrix\.generator \}\}/);
  assert.match(workflow, /EVAL_JUDGE_MODEL: gpt-5\.6-terra/);
  assert.match(workflow, /EVAL_TURN_COUNT: "20"/);
  assert.match(workflow, /REQUIRE_OPENAI_EVAL: "true"/);
  assert.match(workflow, /node scripts\/probe-verifier-model\.js/);
  assert.match(workflow, /VERIFIER_PROBE_MODEL: \$\{\{ matrix\.verifier \}\}/);
  assert.match(workflow, /VERIFIER_PROBE_REASONING_EFFORT: \$\{\{ matrix\.verifier_effort \}\}/);
  assert.match(workflow, /OPENAI_REASONING_EFFORT: \$\{\{ matrix\.generator_effort \}\}/);
  assert.match(workflow, /OPENAI_VERIFIER_REASONING_EFFORT: \$\{\{ matrix\.verifier_effort \}\}/);
  assert.match(workflow, /VERIFIER_PROBE_TIMEOUT_MS: "15000"/);
  assert.match(workflow, /verifier-\$\{\{ matrix\.variant \}\}-probe\.json/);
  assert.doesNotMatch(workflow, /wrangler deploy/);
});
