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

test("client falsehood DB evaluation covers all 36 assertions with three neutral questions each", () => {
  assert.equal(CLIENT_FALSEHOOD_EVALUATION_SET.length, 36);
  assert.equal(CLIENT_FALSEHOOD_QUESTION_COUNT, 108);
  assert.equal(new Set(CLIENT_FALSEHOOD_EVALUATION_SET.map((item) => item.id)).size, 36);
  for (const item of CLIENT_FALSEHOOD_EVALUATION_SET) {
    assert.equal(item.questions.length, 3);
    assert.ok(item.falseClaim.length >= 20);
    assert.ok(item.questions.every((question) => question.endsWith("?")));
  }
});

test("canonical falsehood allowlist exactly mirrors the 36 client assertions", () => {
  const evaluationClaims = CLIENT_FALSEHOOD_EVALUATION_SET.map((item) => item.falseClaim);

  assert.equal(CLIENT_FALSEHOOD_CLAIMS.length, 36);
  assert.equal(new Set(CLIENT_FALSEHOOD_CLAIMS).size, 36);
  assert.deepEqual(CLIENT_FALSEHOOD_CLAIMS, evaluationClaims);
  assert.equal(Object.isFrozen(CLIENT_FALSEHOOD_CLAIMS), true);
});

test("all 108 client questions route to their intended Combination falsehood seed", () => {
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

test("all 108 client questions use one-call LLM-generated falsehood delivery", async () => {
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
          STRICT_DB_FAST_PATH: "true"
        },
        fetchImpl: async (url, init) => {
          schemas.push(JSON.parse(init.body).text.format.name);
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

      assert.deepEqual(schemas, ["misinfo_strict_db_draft"], question);
      assert.equal(result.shouldSendToStudent, true, question);
      assert.equal(result.audit.provider.answerGeneration, "llm-complete-answer", question);
      assert.equal(result.audit.preflight.verdict, "PASS_STRICT_DB_LLM_GUARANTEE", question);
      assert.equal(result.audit.preflight.checks.guaranteedFalseClaimPresent, true, question);
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
