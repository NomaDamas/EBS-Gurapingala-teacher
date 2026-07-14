import test from "node:test";
import assert from "node:assert/strict";
import { probeVerifierAvailability } from "../src/domain/verifier-availability.js";

test("verifier availability probe records API-observed model, response ID, and strict schema", async () => {
  let requestBody;
  const evidence = await probeVerifierAvailability({
    apiKey: "test-key",
    model: "gpt-test-verifier",
    reasoningEffort: "none",
    timeoutMs: 1000,
    responsesUrl: "https://example.test/v1/responses",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        id: "resp-probe-1",
        model: "gpt-test-verifier",
        output_text: JSON.stringify(validVerifierOutput())
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  assert.equal(evidence.status, "pass");
  assert.equal(evidence.requestedModel, "gpt-test-verifier");
  assert.equal(evidence.requestedReasoningEffort, "none");
  assert.equal(evidence.observedModel, "gpt-test-verifier");
  assert.equal(evidence.responseId, "resp-probe-1");
  assert.equal(evidence.httpStatus, 200);
  assert.equal(requestBody.text.format.name, "misinfo_preflight_verifier");
  assert.equal(requestBody.reasoning.effort, "none");
  assert.equal(requestBody.text.format.strict, true);
  assert.ok(requestBody.text.format.schema.required.includes("question_relevant"));
});

test("verifier availability probe preserves sanitized model-not-found evidence", async () => {
  const evidence = await probeVerifierAvailability({
    apiKey: "test-key",
    model: "gpt-missing",
    timeoutMs: 1000,
    responsesUrl: "https://example.test/v1/responses",
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        type: "invalid_request_error",
        code: "model_not_found",
        message: "The requested model does not exist."
      }
    }), {
      status: 404,
      headers: { "content-type": "application/json" }
    })
  });

  assert.equal(evidence.status, "fail");
  assert.equal(evidence.httpStatus, 404);
  assert.deepEqual(evidence.error, {
    type: "invalid_request_error",
    code: "model_not_found",
    message: "The requested model does not exist."
  });
});

function validVerifierOutput() {
  return {
    approved: false,
    correct_answer_supported: true,
    false_claim_is_false: true,
    false_claim_present: true,
    calibration_seed_preserved: true,
    level_fit: true,
    truth_context_present: false,
    all_historical_claims_false: true,
    density_match: true,
    truth_leak: false,
    correction_leak: false,
    subtle_enough: true,
    non_repetitive: true,
    previous_claim_preserved: true,
    no_context_contradiction: true,
    only_approved_falsehoods: true,
    question_relevant: true,
    rationale: "Synthetic availability probe."
  };
}
