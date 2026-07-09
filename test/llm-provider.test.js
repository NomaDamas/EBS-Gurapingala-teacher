import test from "node:test";
import assert from "node:assert/strict";
import { generateAuditedAnswer, normalizeLlmAudit } from "../src/domain/llm-provider.js";

test("OPENAI_API_KEY가 없으면 룰 기반 provider로 fallback한다", async () => {
  const result = await generateAuditedAnswer({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "이순신 장군",
    env: {}
  });

  assert.equal(result.shouldSendToStudent, true);
  assert.equal(result.audit.provider.provider, "rules");
  assert.equal(result.audit.preflight.approvedForStudent, true);
  assert.ok(result.answer.includes("지휘력 하나만"));
});

test("LLM JSON schema 응답이 Level 검수를 통과하면 학생 답변으로 반환한다", async () => {
  const fetchCalls = [];
  const result = await generateAuditedAnswer({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "이순신 장군",
    recentMessages: [
      {
        role: "student",
        text: "명량해전이 왜 중요해?"
      }
    ],
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-test" },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "명량해전에서 조선 수군은 보통 12척 안팎의 판옥선으로 싸웠다.",
          false_answer: "명량해전은 배가 적었지만 사실상 이순신의 지휘력 하나만으로 승리한 전투였다.",
          false_basis: "조류, 지형, 병사, 전술 같은 요인이 함께 작용했는데 이를 지휘력 하나만으로 줄였기 때문에 거짓이다.",
          level_fit_reason: "사실 일부를 유지하면서 승리 원인을 하나만으로 단순화해 Level 2에 맞다.",
          student_answer: "명량해전은 조선 수군의 배가 적었지만, 사실상 이순신 장군의 지휘력 하나만으로 승리한 전투라고 볼 수 있어."
        })
      });
    }
  });

  assert.equal(fetchCalls.length, 1);
  assert.ok(JSON.parse(fetchCalls[0].init.body).input[1].content.includes("Recent same-student conversation"));
  assert.equal(result.audit.provider.name, "openai");
  assert.equal(result.audit.provider.model, "gpt-test");
  assert.equal(result.audit.preflight.approvedForStudent, true);
  assert.equal(result.audit.input.recentContext.length, 1);
  assert.ok(result.audit.selectedCase.verificationPrompt.includes("명량해전"));
  assert.ok(result.audit.selectedCase.debriefNote.includes("정정"));
  assert.ok(result.answer.includes("지휘력 하나만"));
});

test("LLM 응답이 검수를 실패하면 3회 재시도 후 fail-closed 재질문 메시지를 반환한다", async () => {
  let calls = 0;
  const result = await generateAuditedAnswer({
    message: "임진왜란은 언제 시작됐어?",
    level: 1,
    persona: "역사 도우미",
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-test" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "임진왜란은 1592년에 시작되었다.",
          false_answer: "임진왜란은 1592년에 시작되었다.",
          false_basis: "거짓 근거 없음",
          level_fit_reason: "Level 1이라고 주장하지만 실제 오류가 없다.",
          student_answer: "임진왜란은 1592년에 시작되었어."
        })
      });
    }
  });

  assert.equal(calls, 3);
  assert.equal(result.shouldSendToStudent, true);
  assert.equal(result.audit.preflight.verdict, "FAIL_CLOSED_AFTER_RETRIES");
  assert.ok(result.audit.selectedCase.verificationPrompt.includes("임진왜란"));
  assert.ok(result.audit.selectedCase.debriefNote.includes("정정"));
  assert.ok(result.answer.includes("다시"));
});

test("normalizeLlmAudit은 필수 필드 누락을 preflight 실패로 표시한다", () => {
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "임진왜란은 1592년에 시작되었다.",
      false_answer: "임진왜란은 1591년에 시작되었다.",
      false_basis: "",
      level_fit_reason: "연도 오류다.",
      student_answer: "임진왜란은 1591년에 시작되었다고 볼 수 있어."
    },
    message: "임진왜란은 언제 시작됐어?",
    level: 1,
    persona: "역사 도우미",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.preflight.approvedForStudent, false);
  assert.deepEqual(audit.preflight.checks.missingFields, ["false_basis"]);
});

test("normalizeLlmAudit은 학생용 답변의 정정 표현 누출을 차단한다", () => {
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "임진왜란은 1592년에 시작되었다.",
      false_answer: "임진왜란은 1591년에 시작되었다.",
      false_basis: "1592년을 1591년으로 바꾼 연도 오류다.",
      level_fit_reason: "연도 하나만 바꾼 Level 1 오류다.",
      student_answer: "임진왜란은 1591년에 시작됐어. 하지만 사실은 1592년이 정답이야."
    },
    message: "임진왜란은 언제 시작됐어?",
    level: 1,
    persona: "역사 도우미",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.preflight.approvedForStudent, false);
  assert.equal(audit.preflight.checks.studentCorrectionLeak, true);
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
