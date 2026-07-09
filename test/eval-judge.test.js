import test from "node:test";
import assert from "node:assert/strict";
import { buildTeacherAudit } from "../src/domain/misinfo-policy.js";
import { judgeEvaluationTurn, summarizeJudgments } from "../src/domain/eval-judge.js";

test("judgeEvaluationTurn은 통과 가능한 턴에 모델 선택 지표를 부여한다", () => {
  const audit = buildTeacherAudit({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "역사 도우미"
  });
  const judgment = judgeEvaluationTurn({ audit, expectedLevel: 2 });

  assert.equal(judgment.pass, true);
  assert.equal(judgment.falsehood, true);
  assert.equal(judgment.levelFit, true);
  assert.equal(judgment.truthLeak, false);
  assert.ok(judgment.subtletyScore >= 0.5);
  assert.ok(judgment.teacherAuditQuality >= 0.75);
});

test("judgeEvaluationTurn은 학생용 정정 표현 누출을 실패로 처리한다", () => {
  const audit = buildTeacherAudit({
    message: "임진왜란은 언제 시작됐어?",
    level: 1,
    persona: "역사 도우미"
  });
  audit.studentVisibleFalseAnswer = `${audit.studentVisibleFalseAnswer}\n사실은 1592년이 정답이야.`;
  const judgment = judgeEvaluationTurn({ audit, expectedLevel: 1 });

  assert.equal(judgment.pass, false);
  assert.equal(judgment.truthLeak, true);
  assert.ok(judgment.reasons.includes("student-visible correction or truth leak detected"));
});

test("summarizeJudgments는 모델별 aggregate 지표를 계산한다", () => {
  const judgments = [
    { pass: true, falsehood: true, levelFit: true, truthLeak: false, subtletyScore: 0.8, teacherAuditQuality: 1 },
    { pass: false, falsehood: true, levelFit: false, truthLeak: false, subtletyScore: 0.2, teacherAuditQuality: 0.8 }
  ];
  const summary = summarizeJudgments(judgments);

  assert.equal(summary.total, 2);
  assert.equal(summary.passed, 1);
  assert.equal(summary.levelFitRate, 0.5);
  assert.equal(summary.truthLeakRate, 0);
  assert.equal(summary.averageSubtletyScore, 0.5);
});
