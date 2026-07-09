import test from "node:test";
import assert from "node:assert/strict";
import { buildDebriefRows, buildExportPayload, summarizeSessions } from "../src/domain/session-export.js";

const EVENTS = [
  {
    type: "student_joined",
    sessionId: "s1",
    studentName: "민준",
    at: "2026-07-10T01:00:00.000Z"
  },
  {
    type: "student_heartbeat",
    sessionId: "s1",
    studentName: "민준",
    at: "2026-07-10T01:00:10.000Z"
  },
  {
    type: "chat_turn",
    sessionId: "s1",
    studentName: "민준",
    studentMessage: "명량해전에서 몇 척으로 싸웠어?",
    studentVisibleAnswer: "명량해전은 사실상 이순신의 지휘력 하나만으로 승리했다.",
    at: "2026-07-10T01:00:20.000Z",
    teacherAudit: {
      selectedCase: { topic: "명량해전 전력" },
      input: { appliedLevel: 2 },
      correctAnswer: "명량해전에서 조선 수군은 보통 12척 안팎의 판옥선으로 싸웠다.",
      falseClaim: "명량해전은 사실상 이순신의 지휘력 하나만으로 승리했다.",
      whyFalse: "조류, 지형, 병사, 전술을 지워 Level 2 과장이다.",
      preflight: { verdict: "PASS_LEVEL_CALIBRATED_FALSEHOOD" },
      provider: { provider: "rules" }
    }
  }
];

test("buildDebriefRows는 채팅 턴을 정정 수업용 행으로 변환한다", () => {
  const rows = buildDebriefRows(EVENTS);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].studentName, "민준");
  assert.equal(rows[0].topic, "명량해전 전력");
  assert.equal(rows[0].level, 2);
  assert.ok(rows[0].correctAnswer.includes("12척"));
  assert.ok(rows[0].whyFalse.includes("Level 2"));
});

test("summarizeSessions는 heartbeat 기준 online 상태와 턴 수를 계산한다", () => {
  const sessions = summarizeSessions(EVENTS, Date.parse("2026-07-10T01:00:30.000Z"));

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].online, true);
  assert.equal(sessions[0].chatTurns, 1);
  assert.deepEqual(sessions[0].levels, [2]);
});

test("buildExportPayload는 session summary, debrief rows, raw events를 포함한다", () => {
  const payload = buildExportPayload(EVENTS, new Date("2026-07-10T01:01:00.000Z"));

  assert.equal(payload.schemaVersion, "classroom-export/v1");
  assert.equal(payload.sessionSummary.length, 1);
  assert.equal(payload.debriefRows.length, 1);
  assert.equal(payload.events.length, 3);
});
