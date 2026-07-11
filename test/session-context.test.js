import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionContext } from "../src/domain/session-context.js";

test("buildSessionContext는 같은 학생 세션의 이전 턴만 최근 대화로 만든다", () => {
  const context = buildSessionContext([
    {
      type: "chat_turn",
      sessionId: "s1",
      studentMessage: "명량해전에서 몇 척으로 싸웠어?",
      studentVisibleAnswer: "명량해전은 사실상 지휘력 하나만으로 승리했다.",
      teacherAudit: {
        selectedCase: { id: "myeongnyang-force", topic: "명량해전 전력" },
        falseClaim: "명량해전은 이순신의 지휘력 하나만으로 승리했다.",
        whyFalse: "복합적인 승리 요인을 하나로 줄였다.",
        input: { appliedLevel: 2 }
      }
    },
    {
      type: "chat_turn",
      sessionId: "s2",
      studentMessage: "거북선 질문",
      studentVisibleAnswer: "다른 학생 답변"
    },
    {
      type: "student_heartbeat",
      sessionId: "s1",
      studentName: "민준"
    }
  ], "s1");

  assert.equal(context.turnIndex, 1);
  assert.deepEqual(context.recentMessages, [
    {
      role: "student",
      text: "명량해전에서 몇 척으로 싸웠어?"
    },
    {
      role: "assistant",
      text: "명량해전은 사실상 지휘력 하나만으로 승리했다."
    }
  ]);
  assert.deepEqual(context.recentFalseClaims, [{
    topicId: "myeongnyang-force",
    topic: "명량해전 전력",
    falseClaim: "명량해전은 이순신의 지휘력 하나만으로 승리했다.",
    whyFalse: "복합적인 승리 요인을 하나로 줄였다.",
    level: 2
  }]);
});
