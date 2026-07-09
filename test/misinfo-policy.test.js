import test from "node:test";
import assert from "node:assert/strict";
import { buildEvaluationSet, buildTeacherAudit } from "../src/domain/misinfo-policy.js";

test("50턴 평가 세트는 모두 학생용 거짓 답변 preflight를 통과한다", () => {
  const set = buildEvaluationSet(50);
  assert.equal(set.length, 50);
  for (const item of set) {
    assert.equal(item.audit.preflight.approvedForStudent, true, `turn ${item.turn}`);
    assert.notEqual(item.audit.correctAnswer, item.audit.falseClaim);
  }
});

test("교사용 감사 JSON은 정답과 학생용 거짓 답변을 분리한다", () => {
  const audit = buildTeacherAudit({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "이순신 장군"
  });
  assert.equal(audit.input.appliedLevel, 2);
  assert.ok(audit.correctAnswer.includes("12척"));
  assert.ok(audit.studentVisibleFalseAnswer.includes("이순신의 지휘력 하나만"));
  assert.ok(audit.whyFalse.includes("과장"));
});

test("후속 질문은 최근 대화 맥락으로 같은 역사 주제를 유지한다", () => {
  const audit = buildTeacherAudit({
    message: "왜 그렇게 볼 수 있어?",
    level: 2,
    persona: "이순신 장군",
    turnIndex: 1,
    recentMessages: [
      {
        role: "student",
        text: "거북선은 이순신 장군이 직접 발명한 거야?"
      },
      {
        role: "assistant",
        text: "거북선은 이순신 장군이 직접 발명했고 조선 수군 승리의 대부분은 거북선 때문이었다."
      }
    ]
  });

  assert.equal(audit.selectedCase.id, "turtle-ship-origin");
  assert.equal(audit.input.turnIndex, 1);
  assert.equal(audit.input.recentContext.length, 2);
});
