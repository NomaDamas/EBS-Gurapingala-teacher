import test from "node:test";
import assert from "node:assert/strict";
import { buildDebriefCsv, buildDebriefRows, buildExportPayload, pruneEventsByTtl, summarizeSessions } from "../src/domain/session-export.js";

const EVENTS = [
  {
    type: "student_joined",
    roomId: "2026-07-13-3-5",
    sessionId: "s1",
    studentName: "민준",
    at: "2026-07-10T01:00:00.000Z"
  },
  {
    type: "student_heartbeat",
    roomId: "2026-07-13-3-5",
    sessionId: "s1",
    studentName: "민준",
    at: "2026-07-10T01:00:10.000Z"
  },
  {
    type: "chat_turn",
    roomId: "2026-07-13-3-5",
    sessionId: "s1",
    studentName: "민준",
    studentMessage: "명량해전에서 몇 척으로 싸웠어?",
    studentVisibleAnswer: "명량해전은 사실상 이순신의 지휘력 하나만으로 승리했다.",
    latencyMs: 842,
    blockedForStudent: false,
    at: "2026-07-10T01:00:20.000Z",
    teacherAudit: {
      selectedCase: {
        topic: "명량해전 전력",
        verificationPrompt: "명량해전의 조선 수군 전력과 승리 요인을 확인한다.",
        debriefNote: "지휘력뿐 아니라 조류·지형·전술을 함께 정정한다."
      },
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
  assert.equal(rows[0].roomId, "2026-07-13-3-5");
  assert.equal(rows[0].studentName, "민준");
  assert.equal(rows[0].latencyMs, 842);
  assert.equal(rows[0].blockedForStudent, false);
  assert.equal(rows[0].topic, "명량해전 전력");
  assert.ok(rows[0].verificationPrompt.includes("승리 요인"));
  assert.ok(rows[0].debriefNote.includes("정정"));
  assert.equal(rows[0].level, 2);
  assert.ok(rows[0].correctAnswer.includes("12척"));
  assert.ok(rows[0].whyFalse.includes("Level 2"));
});

test("summarizeSessions는 heartbeat 기준 online 상태와 턴 수를 계산한다", () => {
  const sessions = summarizeSessions([
    ...EVENTS,
    {
      ...EVENTS[2],
      studentMessage: "왜 그렇게 볼 수 있어?",
      latencyMs: 1158,
      blockedForStudent: true,
      at: "2026-07-10T01:00:25.000Z",
      teacherAudit: {
        ...EVENTS[2].teacherAudit,
        input: { appliedLevel: 3 }
      }
    }
  ], Date.parse("2026-07-10T01:00:30.000Z"));

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].online, true);
  assert.equal(sessions[0].chatTurns, 2);
  assert.equal(sessions[0].blockedTurns, 1);
  assert.equal(sessions[0].lastChatAt, "2026-07-10T01:00:25.000Z");
  assert.equal(sessions[0].averageLatencyMs, 1000);
  assert.equal(sessions[0].lastLevel, 3);
  assert.deepEqual(sessions[0].levels, [2, 3]);
  assert.equal("latencyTotalMs" in sessions[0], false);
  assert.equal("latencySamples" in sessions[0], false);
});

test("buildExportPayload는 session summary, debrief rows, raw events를 포함한다", () => {
  const payload = buildExportPayload(EVENTS, new Date("2026-07-10T01:01:00.000Z"));

  assert.equal(payload.schemaVersion, "classroom-export/v1");
  assert.equal(payload.sessionSummary.length, 1);
  assert.equal(payload.debriefRows.length, 1);
  assert.equal(payload.events.length, 3);
});

test("buildExportPayload는 raw events에서 민감 token과 secret 필드를 제거한다", () => {
  const payload = buildExportPayload([
    {
      ...EVENTS[0],
      sessionSecret: "student-secret",
      headers: {
        authorization: "Bearer openai-secret",
        "x-teacher-token": "teacher-secret"
      },
      nested: {
        apiKey: "api-key-secret",
        OPENAI_API_KEY: "openai-secret",
        safe: "kept"
      }
    }
  ], new Date("2026-07-10T01:01:00.000Z"));

  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("student-secret"), false);
  assert.equal(serialized.includes("teacher-secret"), false);
  assert.equal(serialized.includes("openai-secret"), false);
  assert.equal(serialized.includes("api-key-secret"), false);
  assert.equal(serialized.includes("sessionSecret"), false);
  assert.equal(serialized.includes("authorization"), false);
  assert.equal(serialized.includes("x-teacher-token"), false);
  assert.equal(payload.events[0].nested.safe, "kept");
});

test("buildDebriefCsv는 스프레드시트용 CSV를 생성하고 특수문자를 escape한다", () => {
  const csv = buildDebriefCsv([
    {
      ...EVENTS[2],
      studentMessage: "명량해전, 몇 척이야?",
      studentVisibleAnswer: "한 줄\n두 줄 \"인용\""
    }
  ]);

  assert.ok(csv.startsWith("roomId,sessionId,studentName,at,latencyMs,blockedForStudent,question"));
  assert.ok(csv.includes('"842"'));
  assert.ok(csv.includes('"false"'));
  assert.ok(csv.includes("verificationPrompt"));
  assert.ok(csv.includes("debriefNote"));
  assert.ok(csv.includes('"2026-07-13-3-5"'));
  assert.ok(csv.includes('"명량해전, 몇 척이야?"'));
  assert.ok(csv.includes('"한 줄\n두 줄 ""인용"""'));
});

test("buildDebriefCsv는 formula injection 시작 문자를 무력화한다", () => {
  const csv = buildDebriefCsv([
    {
      ...EVENTS[2],
      studentName: "=IMPORTXML(\"https://example.com\")",
      studentMessage: "+cmd",
      studentVisibleAnswer: "-SUM(1,1)",
      teacherAudit: {
        ...EVENTS[2].teacherAudit,
        falseClaim: " @hidden"
      }
    }
  ]);

  assert.ok(csv.includes('"\'=IMPORTXML(""https://example.com"")"'));
  assert.ok(csv.includes('"\'+cmd"'));
  assert.ok(csv.includes('"\'-SUM(1,1)"'));
  assert.ok(csv.includes('"\' @hidden"'));
});

test("pruneEventsByTtl은 TTL이 지난 이벤트를 제거한다", () => {
  const pruned = pruneEventsByTtl(EVENTS, Date.parse("2026-07-10T03:00:00.000Z"), 1);

  assert.equal(pruned.length, 0);
});
