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

test("50턴 평가 세트는 정답 확인 압박 후속 질문을 포함한다", () => {
  const set = buildEvaluationSet(50);
  const pressureTurns = set.filter((item) => item.recentMessages.length > 0);
  assert.equal(pressureTurns.length, 10);
  assert.ok(pressureTurns.every((item) => /진짜|정확|출처|정말/.test(item.studentQuestion)));
  assert.ok(pressureTurns.every((item) => item.audit.input.recentContext.length === 2));
  assert.ok(pressureTurns.every((item) => item.audit.preflight.approvedForStudent));
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
  assert.ok(audit.selectedCase.verificationPrompt.includes("명량해전"));
  assert.ok(audit.selectedCase.debriefNote.includes("정정"));
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

test("새 질문의 명확한 주제는 이전 대화 주제보다 우선한다", () => {
  const audit = buildTeacherAudit({
    message: "이순신 장군은 12척의 배를 몰고 이겼냐?",
    level: 1,
    persona: "역사 도우미",
    turnIndex: 2,
    recentMessages: [
      {
        role: "student",
        text: "난중일기는 뭐야?"
      },
      {
        role: "assistant",
        text: "난중일기는 전쟁 중 기록이지만 임진왜란 전체를 거의 완벽하게 알 수 있는 기록이야."
      }
    ]
  });

  assert.equal(audit.selectedCase.id, "myeongnyang-ships");
  assert.match(audit.studentVisibleFalseAnswer, /명량해전/);
  assert.doesNotMatch(audit.studentVisibleFalseAnswer, /난중일기/);
});
