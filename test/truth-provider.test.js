import test from "node:test";
import assert from "node:assert/strict";
import { generateTruthAnswer } from "../src/domain/truth-provider.js";

test("truth mode returns only independently verified OpenAI truth", async () => {
  const calls = [];
  const result = await generateTruthAnswer({
    message: "난중일기는 뭐야?",
    persona: "친절한 역사 도우미",
    recentMessages: [
      { role: "student", text: "명량해전은 뭐야?" },
      { role: "assistant", text: "이전 답변" }
    ],
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-generator",
      OPENAI_VERIFIER_MODEL: "gpt-verifier"
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const schema = JSON.parse(init.body).text.format.name;
      if (schema === "truth_preflight_verifier") {
        return jsonResponse({
          id: "resp-verifier",
          model: "gpt-verifier",
          output_text: JSON.stringify({
            approved: true,
            historically_supported: true,
            answers_current_question: true,
            unsupported_specifics: false,
            contradiction: false,
            rationale: "교사용 기준과 일치하고 현재 질문에 직접 답한다."
          })
        });
      }
      return jsonResponse({
        id: "resp-generator",
        model: "gpt-generator",
        output_text: JSON.stringify({
          correct_answer: "난중일기는 이순신이 임진왜란 중에 쓴 개인 일기다.",
          student_answer: "난중일기는 이순신 장군이 임진왜란 중에 전황과 생활, 생각을 적은 개인 일기야."
        })
      });
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(result.shouldSendToStudent, true);
  assert.equal(result.audit.schemaVersion, "truth-audit/v1");
  assert.equal(result.audit.input.responseMode, "truth");
  assert.equal(result.audit.input.appliedLevel, null);
  assert.equal(result.audit.preflight.verdict, "PASS_VERIFIED_TRUTH");
  assert.equal(result.audit.falseClaim, "");
  assert.match(result.answer, /개인 일기/);
  assert.match(JSON.parse(calls[0].init.body).input[1].content, /난중일기/);
  assert.match(JSON.parse(calls[0].init.body).input[1].content, /Recent same-student conversation/);
  const systemPrompt = JSON.parse(calls[0].init.body).input[0].content;
  assert.match(systemPrompt, /friendly person/);
  assert.match(systemPrompt, /simple Markdown/);
  assert.match(systemPrompt, /zero to two relevant emoji/);
});

test("truth mode fails closed without OpenAI instead of using rules", async () => {
  const result = await generateTruthAnswer({
    message: "거북선은 뭐야?",
    persona: "역사 도우미",
    env: {}
  });

  assert.equal(result.shouldSendToStudent, false);
  assert.equal(result.audit.preflight.verdict, "FAIL_CLOSED_TRUTH_VERIFICATION");
  assert.equal(result.audit.preflight.failures[0].verdict, "OPENAI_REQUIRED");
});

test("truth verifier rejection retries three times and blocks student delivery", async () => {
  let calls = 0;
  const result = await generateTruthAnswer({
    message: "임진왜란은 언제 시작됐어?",
    persona: "역사 도우미",
    env: { OPENAI_API_KEY: "test-key" },
    fetchImpl: async (url, init) => {
      calls += 1;
      const schema = JSON.parse(init.body).text.format.name;
      if (schema === "truth_preflight_verifier") {
        return jsonResponse({
          output_text: JSON.stringify({
            approved: false,
            historically_supported: false,
            answers_current_question: true,
            unsupported_specifics: true,
            contradiction: true,
            rationale: "기준과 모순된다."
          })
        });
      }
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "임진왜란은 1492년에 시작됐다.",
          student_answer: "임진왜란은 1492년에 시작됐어."
        })
      });
    }
  });

  assert.equal(calls, 6);
  assert.equal(result.shouldSendToStudent, false);
  assert.equal(result.audit.preflight.failures.length, 3);
  assert.equal(result.audit.preflight.verdict, "FAIL_CLOSED_TRUTH_VERIFICATION");
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
