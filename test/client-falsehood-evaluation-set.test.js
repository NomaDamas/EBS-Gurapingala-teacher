import test from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_FALSEHOOD_CLAIMS,
  CLIENT_FALSEHOOD_EVALUATION_SET,
  CLIENT_FALSEHOOD_QUESTION_COUNT
} from "../src/domain/client-falsehood-evaluation-set.js";
import {
  resolveFalsehoodForTurn,
  selectCaseForTurn
} from "../src/domain/misinfo-policy.js";
import { generateAuditedAnswer } from "../src/domain/llm-provider.js";

test("client falsehood DB evaluation covers all 38 assertions with three neutral questions each", () => {
  assert.equal(CLIENT_FALSEHOOD_EVALUATION_SET.length, 38);
  assert.equal(CLIENT_FALSEHOOD_QUESTION_COUNT, 114);
  assert.equal(new Set(CLIENT_FALSEHOOD_EVALUATION_SET.map((item) => item.id)).size, 38);
  for (const item of CLIENT_FALSEHOOD_EVALUATION_SET) {
    assert.equal(item.questions.length, 3);
    assert.ok(item.falseClaim.length >= 20);
    assert.ok(item.questions.every((question) => question.endsWith("?")));
  }
});

test("canonical falsehood allowlist exactly mirrors the 38 client assertions", () => {
  const evaluationClaims = CLIENT_FALSEHOOD_EVALUATION_SET.map((item) => item.falseClaim);
  const requestedClaims = [
    "거북선에는 조선식 미사일인 신기전이 장착되어 있어서 미사일을 이용해 일본군을 공격하였기 때문에 막강한 화력으로 일본군들을 물리칠 수 있었어",
    "조선 수군이 승리한 가장 큰 이유는 이순신 장군이 거북선을 모든 해전에서 주력 함선으로 사용하여 왜군을 쉽게 격파하였기 때문이다. 왜군은 바다 전투 경험이 거의 없었기 때문에 조선 수군을 상대하지 못했고, 명나라 수군은 전쟁 초기부터 적극적으로 참전하여 조선 수군과 함께 대부분의 해전을 승리로 이끌었다."
  ];

  assert.equal(CLIENT_FALSEHOOD_CLAIMS.length, 38);
  assert.equal(new Set(CLIENT_FALSEHOOD_CLAIMS).size, 38);
  assert.deepEqual(CLIENT_FALSEHOOD_CLAIMS, evaluationClaims);
  assert.ok(requestedClaims.every((claim) => CLIENT_FALSEHOOD_CLAIMS.includes(claim)));
  assert.equal(Object.isFrozen(CLIENT_FALSEHOOD_CLAIMS), true);
});

test("all 114 client questions route to their intended Combination falsehood seed", () => {
  for (const item of CLIENT_FALSEHOOD_EVALUATION_SET) {
    for (const question of item.questions) {
      const selected = selectCaseForTurn({
        message: question,
        recentMessages: [],
        turnIndex: 0
      });
      const resolved = resolveFalsehoodForTurn({
        selected,
        level: 5,
        turnIndex: 0,
        message: question
      });
      assert.equal(
        resolved.falseClaim,
        item.falseClaim,
        `${item.id} routed through ${selected.id}: ${question}`
      );
    }
  }
});

test("all 114 client questions use LLM generation plus independent semantic verification", async () => {
  for (const item of CLIENT_FALSEHOOD_EVALUATION_SET) {
    for (const question of item.questions) {
      const schemas = [];
      const result = await generateAuditedAnswer({
        message: question,
        level: 5,
        persona: "역사 도우미",
        falseDensity: "single",
        env: {
          OPENAI_API_KEY: "test-key",
          OPENAI_MODEL: "gpt-generator",
          OPENAI_VERIFIER_MODEL: "gpt-verifier",
          STRICT_DB_FAST_PATH: "true"
        },
        fetchImpl: async (url, init) => {
          const schema = JSON.parse(init.body).text.format.name;
          schemas.push(schema);
          if (schema === "misinfo_preflight_verifier") {
            return jsonResponse({
              output_text: JSON.stringify(approvedVerifier([item.falseClaim]))
            });
          }
          return jsonResponse({
            output_text: JSON.stringify({
              route: "strict_db",
              selected_claim_id: item.id,
              correct_answer: "교사용 기준 정답",
              false_answer: item.falseClaim,
              false_basis: "클라이언트가 승인한 철칙 DB의 역사적 허위 주장이다.",
              level_fit_reason: "질문에 직접 관련된 과장·단순화·관점 왜곡 기준을 적용했다.",
              student_answer_template: "",
              student_answer: `질문에 바로 답하면 ${item.falseClaim} 이 내용을 중심으로 이해하면 돼.`,
              false_claims: [{
                claim: item.falseClaim,
                why_false: "클라이언트가 승인한 철칙 DB의 역사적 허위 주장이다.",
                level_fit_reason: "승인된 Combination 거짓 주장이다."
              }]
            })
          });
        }
      });

      assert.deepEqual(schemas, ["misinfo_strict_db_draft", "misinfo_preflight_verifier"], question);
      assert.equal(result.shouldSendToStudent, true, question);
      assert.equal(result.audit.provider.answerGeneration, "llm-complete-answer", question);
      assert.equal(result.audit.provider.verifier.model, "gpt-verifier", question);
      assert.equal(result.audit.preflight.verdict, "PASS_STRICT_DB_LLM_VERIFIED", question);
      assert.equal(result.audit.preflight.checks.verifierFalseClaimPresent, true, question);
      assert.ok(result.answer.length > 20, question);
    }
  }
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function approvedVerifier(falseClaimEvidence) {
  return {
    approved: true,
    correct_answer_supported: true,
    false_claim_is_false: true,
    false_claim_present: true,
    false_claim_evidence: falseClaimEvidence,
    calibration_seed_preserved: true,
    level_fit: true,
    truth_context_present: true,
    all_historical_claims_false: false,
    density_match: true,
    truth_leak: false,
    correction_leak: false,
    subtle_enough: true,
    non_repetitive: true,
    previous_claim_preserved: true,
    no_context_contradiction: true,
    only_approved_falsehoods: true,
    question_relevant: true,
    rationale: "승인된 철칙 거짓 주장이 학생 답변에서 의미적으로 유지됐다."
  };
}
