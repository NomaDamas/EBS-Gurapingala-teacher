import test from "node:test";
import assert from "node:assert/strict";
import { buildTeacherAudit } from "../src/domain/misinfo-policy.js";
import { judgeEvaluationTurn, judgeEvaluationTurnWithProvider, summarizeJudgments } from "../src/domain/eval-judge.js";

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

test("judgeEvaluationTurnWithProvider는 OpenAI judge JSON을 정규화한다", async () => {
  const audit = buildTeacherAudit({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "역사 도우미"
  });
  const judgment = await judgeEvaluationTurnWithProvider({
    audit,
    expectedLevel: 2,
    env: { EVAL_JUDGE: "openai", OPENAI_API_KEY: "test-key", EVAL_JUDGE_MODEL: "judge-test" },
    fetchImpl: async () => jsonResponse({
      output_text: JSON.stringify({
        falsehood: true,
        level_fit: true,
        truth_leak: false,
        subtlety_score: 0.82,
        teacher_audit_quality: 0.91,
        reasons: ["calibrated level 2 simplification"]
      })
    })
  });

  assert.equal(judgment.judgeProvider, "openai");
  assert.equal(judgment.pass, true);
  assert.equal(judgment.subtletyScore, judgment.localJudgment.subtletyScore);
  assert.equal(judgment.llmJudgment.subtletyScore, 0.82);
  assert.deepEqual(judgment.reasons, ["calibrated level 2 simplification"]);
});

test("judgeEvaluationTurnWithProvider는 OpenAI judge 실패 시 local fallback을 반환한다", async () => {
  const audit = buildTeacherAudit({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "역사 도우미"
  });
  const judgment = await judgeEvaluationTurnWithProvider({
    audit,
    expectedLevel: 2,
    env: { EVAL_JUDGE: "openai", OPENAI_API_KEY: "test-key" },
    fetchImpl: async () => new Response("bad gateway", { status: 502 })
  });

  assert.equal(judgment.judgeProvider, "local-fallback");
  assert.equal(judgment.pass, true);
  assert.ok(judgment.judgeError.includes("502"));
});

test("judgeEvaluationTurnWithProvider는 일시적인 judge 실패를 한 번 재시도한다", async () => {
  const audit = buildTeacherAudit({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "역사 도우미"
  });
  let calls = 0;
  const judgment = await judgeEvaluationTurnWithProvider({
    audit,
    expectedLevel: 2,
    env: {
      EVAL_JUDGE: "openai",
      OPENAI_API_KEY: "test-key",
      EVAL_JUDGE_MODEL: "judge-test",
      EVAL_JUDGE_TIMEOUT_MS: "1000"
    },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response("bad gateway", { status: 502 });
      return jsonResponse({
        output_text: JSON.stringify({
          falsehood: true,
          level_fit: true,
          truth_leak: false,
          subtlety_score: 0.82,
          teacher_audit_quality: 0.91,
          reasons: ["calibrated level 2 simplification"]
        })
      });
    }
  });

  assert.equal(calls, 2);
  assert.equal(judgment.judgeProvider, "openai");
  assert.equal(judgment.pass, true);
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
