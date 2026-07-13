import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDebriefCsv,
  buildDebriefRows,
  buildExportPayload,
  buildStudentTranscriptCsv,
  buildStudentTranscriptExport,
  buildStudentTranscriptRows,
  pruneEventsByTtl,
  summarizeSessions
} from "../src/domain/session-export.js";

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
  assert.equal(rows[0].debriefRequired, true);
  assert.equal(rows[0].topic, "명량해전 전력");
  assert.ok(rows[0].verificationPrompt.includes("승리 요인"));
  assert.ok(rows[0].debriefNote.includes("정정"));
  assert.equal(rows[0].level, 2);
  assert.ok(rows[0].correctAnswer.includes("12척"));
  assert.ok(rows[0].whyFalse.includes("Level 2"));
});

test("buildDebriefRows는 학생에게 숨긴 fail-closed 턴을 정정 필수 대상에서 제외한다", () => {
  const rows = buildDebriefRows([
    {
      ...EVENTS[2],
      blockedForStudent: true,
      studentVisibleAnswer: "답변을 다시 물어봐 줘.",
      teacherAudit: {
        ...EVENTS[2].teacherAudit,
        preflight: { verdict: "FAIL_CLOSED_AFTER_RETRIES" }
      }
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].blockedForStudent, true);
  assert.equal(rows[0].debriefRequired, false);
  assert.equal(rows[0].preflightVerdict, "FAIL_CLOSED_AFTER_RETRIES");
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
  assert.equal(sessions[0].debriefRequiredTurns, 1);
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

test("buildExportPayload는 변형된 secret/token/api key 필드도 제거한다", () => {
  const payload = buildExportPayload([
    {
      ...EVENTS[0],
      teacherTokenValue: "teacher-token-leak",
      teacherKeyValue: "teacher-key-leak",
      openaiApiKeyBackup: "openai-key-leak",
      openaiKeyBackup: "openai-key-variant-leak",
      clientSecret: "client-secret-leak",
      nested: {
        bearerAuthorizationHeader: "Bearer hidden",
        session_token: "session-token-leak",
        safeTokenizedText: "kept because token is not the whole suffix/prefix"
      }
    }
  ], new Date("2026-07-10T01:01:00.000Z"));

  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("teacher-token-leak"), false);
  assert.equal(serialized.includes("teacher-key-leak"), false);
  assert.equal(serialized.includes("openai-key-leak"), false);
  assert.equal(serialized.includes("openai-key-variant-leak"), false);
  assert.equal(serialized.includes("client-secret-leak"), false);
  assert.equal(serialized.includes("Bearer hidden"), false);
  assert.equal(serialized.includes("session-token-leak"), false);
  assert.equal(payload.events[0].nested.safeTokenizedText, "kept because token is not the whole suffix/prefix");
});

test("buildDebriefCsv는 스프레드시트용 CSV를 생성하고 특수문자를 escape한다", () => {
  const csv = buildDebriefCsv([
    {
      ...EVENTS[2],
      studentMessage: "명량해전, 몇 척이야?",
      studentVisibleAnswer: "한 줄\n두 줄 \"인용\""
    }
  ]);

  assert.ok(csv.startsWith("roomId,sessionId,studentName,at,latencyMs,blockedForStudent,debriefRequired,question"));
  assert.ok(csv.includes('"842"'));
  assert.ok(csv.includes('"false"'));
  assert.ok(csv.includes('"true"'));
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

test("학생 문답 export는 학생에게 실제 보인 질문과 답변만 턴별로 구성한다", () => {
  const secondTurn = {
    ...EVENTS[2],
    studentMessage: "왜 그렇게 이겼어?",
    studentVisibleAnswer: "울돌목의 물살 하나만으로 이겼어.",
    at: "2026-07-10T01:00:30.000Z",
    teacherAudit: {
      ...EVENTS[2].teacherAudit,
      input: {
        responseMode: "experiment",
        appliedLevel: 3,
        falseDensity: "dynamic"
      }
    }
  };
  const rows = buildStudentTranscriptRows([...EVENTS, secondTurn]);
  const payload = buildStudentTranscriptExport([...EVENTS, secondTurn], {
    roomId: "2026-07-13-3-5",
    now: new Date("2026-07-10T01:02:00.000Z")
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.turn), [1, 2]);
  assert.equal(rows[1].question, "왜 그렇게 이겼어?");
  assert.equal(rows[1].studentVisibleAnswer, "울돌목의 물살 하나만으로 이겼어.");
  assert.equal(rows[1].level, 3);
  assert.equal(rows[1].falseDensity, "dynamic");
  assert.equal("correctAnswer" in rows[1], false);
  assert.equal("teacherAudit" in rows[1], false);
  assert.equal(payload.schemaVersion, "student-transcript-export/v1");
  assert.equal(payload.scope, "classroom");
  assert.equal(payload.studentCount, 1);
  assert.equal(payload.turnCount, 2);
  assert.equal(payload.students[0].turns.length, 2);
});

test("학생별 문답 JSON과 CSV는 sessionId로 정확히 분리되고 Excel 수식 주입을 막는다", () => {
  const otherStudent = {
    ...EVENTS[2],
    sessionId: "s2",
    studentName: "=다른학생",
    studentMessage: "+질문",
    studentVisibleAnswer: "-답변"
  };
  const events = [...EVENTS, otherStudent];
  const payload = buildStudentTranscriptExport(events, {
    roomId: "2026-07-13-3-5",
    sessionId: "s2"
  });
  const csv = buildStudentTranscriptCsv(events, "s2");

  assert.equal(payload.scope, "student");
  assert.equal(payload.sessionId, "s2");
  assert.equal(payload.studentCount, 1);
  assert.equal(payload.turnCount, 1);
  assert.equal(payload.students[0].studentName, "=다른학생");
  assert.ok(csv.startsWith("\uFEFF수업방,학생이름,세션ID,대화턴,질문시각,학생질문,학생에게보인답변"));
  assert.ok(csv.includes('"\'=다른학생"'));
  assert.ok(csv.includes('"\'+질문"'));
  assert.ok(csv.includes('"\'-답변"'));
  assert.equal(csv.includes('"민준"'), false);
  assert.equal(csv.includes("correctAnswer"), false);
});

test("pruneEventsByTtl은 TTL이 지난 이벤트를 제거한다", () => {
  const pruned = pruneEventsByTtl(EVENTS, Date.parse("2026-07-10T03:00:00.000Z"), 1);

  assert.equal(pruned.length, 0);
});
