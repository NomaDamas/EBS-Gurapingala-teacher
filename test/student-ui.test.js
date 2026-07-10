import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("student UI only enters class after successful join and handles network failures", async () => {
  const student = await readFile("src/ui/student.js", "utf8");

  assert.match(student, /let heartbeatTimer = null/);
  assert.match(student, /let joining = false/);
  assert.match(student, /const sessionSecretKey = "ebs-session-secret:" \+ roomId/);
  assert.match(student, /const studentNameKey = "ebs-student-name:" \+ roomId/);
  assert.match(student, /let sessionSecret = localStorage\.getItem\(sessionSecretKey\) \|\| crypto\.randomUUID\(\)/);
  assert.match(student, /let studentName = localStorage\.getItem\(studentNameKey\) \|\| ""/);
  assert.match(student, /localStorage\.setItem\(sessionSecretKey, sessionSecret\)/);
  assert.match(student, /if \(joining\) return/);
  assert.match(student, /joinBtn\.disabled = true/);
  assert.match(student, /const res = await fetch\(withRoom\("\/api\/join"\)/);
  assert.match(student, /JSON\.stringify\(\{ sessionId, sessionSecret, studentName: nextStudentName \}\)/);
  assert.match(student, /localStorage\.setItem\(studentNameKey, studentName\)/);
  assert.match(student, /const data = await readJsonSafely\(res\)/);
  assert.match(student, /if \(!res\.ok\)[\s\S]*입장 실패/);
  assert.match(student, /if \(heartbeatTimer\) clearInterval\(heartbeatTimer\)/);
  assert.match(student, /heartbeatTimer = setInterval\(sendHeartbeat, 15000\)/);
  assert.match(student, /catch \(error\)[\s\S]*네트워크를 확인해 주세요/);
  assert.match(student, /finally[\s\S]*joining = false[\s\S]*joinBtn\.disabled = false/);
});

test("student chat submit reports failed or malformed responses without breaking the chat", async () => {
  const student = await readFile("src/ui/student.js", "utf8");

  assert.match(student, /let submitting = false/);
  assert.match(student, /if \(submitting\) return/);
  assert.match(student, /const pendingMessage = addPendingMessage\(\)/);
  assert.match(student, /pendingMessage\.remove\(\)/);
  assert.match(student, /const res = await fetch\(withRoom\("\/api\/chat"\)/);
  assert.match(student, /JSON\.stringify\(\{ sessionId, sessionSecret, studentName, message \}\)/);
  assert.match(student, /const data = await readJsonSafely\(res\)/);
  assert.match(student, /if \(!res\.ok\)[\s\S]*studentErrorMessage\(res, data\)/);
  assert.match(student, /catch \(error\)[\s\S]*네트워크 문제로 답변을 받지 못했어/);
  assert.match(student, /async function readJsonSafely\(res\)/);
  assert.match(student, /return await res\.json\(\)/);
  assert.match(student, /return \{\}/);
  assert.match(student, /function studentErrorMessage\(res, data\)/);
  assert.match(student, /res\.status === 429 \|\| data\.error === "rate_limited"/);
  assert.match(student, /초 뒤에 다시 물어봐/);
  assert.match(student, /질문이 너무 빠르게 이어졌어/);
});

test("student UI presents an EBS inquiry experience without leaking teacher-only material", async () => {
  const student = await readFile("src/ui/student.js", "utf8");

  assert.match(student, /EBS with ChatGPT/);
  assert.match(student, /질문에서 시작하는/);
  assert.match(student, /교과서, 검색, 친구 토론으로 다시 확인하세요/);
  assert.match(student, /AI 답변은 교과서와 다른 자료로 다시 확인하세요/);
  assert.doesNotMatch(student, /이순신 장군 AI 챗봇/);
  assert.doesNotMatch(student, /teacherAudit|correctAnswer|falseClaim|whyFalse/);
});

test("student UI keeps required privacy copy and accessible composer limits", async () => {
  const student = await readFile("src/ui/student.js", "utf8");

  assert.match(student, /이름, 질문, 답변, 접속 상태가 교사용 대시보드에 기록됩니다/);
  assert.match(student, /이름 외 개인정보는 입력하지 마세요/);
  assert.match(student, /id="message" maxlength="600"/);
  assert.match(student, /id="name" maxlength="40"/);
  assert.match(student, /aria-live="polite"/);
  assert.match(student, /event\.key === "Enter" && !event\.shiftKey && !event\.isComposing/);
});

test("student UI makes the live multi-turn LLM conversation explicit without exposing audit data", async () => {
  const student = await readFile("src/ui/student.js", "utf8");

  assert.match(student, /id="turnStatus" aria-live="polite"/);
  assert.match(student, /let completedTurns = 0/);
  assert.match(student, /function updateConversationProgress\(\)/);
  assert.match(student, /앞선 답변에서 더 알고 싶은 점을 이어서 물어보세요/);
  assert.match(student, /const activeTurn = completedTurns \+ 1/);
  assert.match(student, /completedTurns = activeTurn/);
  assert.match(student, /setConnectionState\("앞선 대화와 연결됨", "online"\)/);
  assert.match(student, /data\.answer \|\| "답변을 표시하지 못했습니다/);
  assert.doesNotMatch(student, /teacherAudit|correctAnswer|falseClaim|whyFalse|levelFitReason|preflight/);
});
