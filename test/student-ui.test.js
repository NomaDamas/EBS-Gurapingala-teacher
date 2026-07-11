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
  assert.match(student, /const res = await fetchWithTimeout\(withRoom\("\/api\/join"\)/);
  assert.match(student, /JSON\.stringify\(\{ sessionId, sessionSecret, studentName: nextStudentName \}\)/);
  assert.match(student, /localStorage\.setItem\(studentNameKey, studentName\)/);
  assert.match(student, /const data = await readJsonSafely\(res\)/);
  assert.match(student, /if \(!res\.ok\)[\s\S]*입장 실패/);
  assert.match(student, /if \(heartbeatTimer\) clearInterval\(heartbeatTimer\)/);
  assert.match(student, /heartbeatTimer = setInterval\(sendHeartbeat, 15000\)/);
  assert.match(student, /let heartbeatFailures = 0/);
  assert.match(student, /if \(!res\.ok\) throw new Error\("heartbeat failed"\)/);
  assert.match(student, /heartbeatFailures >= 2/);
  assert.match(student, /catch \(error\)[\s\S]*네트워크를 확인해 주세요/);
  assert.match(student, /finally[\s\S]*joining = false[\s\S]*joinBtn\.disabled = false/);
});

test("student chat submit reports failed or malformed responses without breaking the chat", async () => {
  const student = await readFile("src/ui/student.js", "utf8");

  assert.match(student, /let submitting = false/);
  assert.match(student, /if \(submitting\) return/);
  assert.match(student, /const pendingMessage = addPendingMessage\(\)/);
  assert.match(student, /pendingMessage\.remove\(\)/);
  assert.match(student, /const res = await fetchWithTimeout\(withRoom\("\/api\/chat"\)/);
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
  assert.match(student, /const joinTimeoutMs = 15000/);
  assert.match(student, /const chatTimeoutMs = 105000/);
  assert.match(student, /async function fetchWithTimeout\(url, options, timeoutMs\)/);
  assert.match(student, /controller\.abort\(\)/);
  assert.match(student, /form\.setAttribute\("aria-busy", "true"\)/);
  assert.match(student, /chat\.setAttribute\("aria-busy", "false"\)/);
  assert.match(student, /setSessionControlsDisabled\(true\)/);
  assert.match(student, /setSessionControlsDisabled\(false\)/);
  assert.match(student, /typeof data\.answer !== "string" \|\| !data\.answer\.trim\(\)/);
  assert.match(student, /답변 형식을 확인하지 못했어/);
});

test("student UI presents an EBS inquiry experience without leaking teacher-only material", async () => {
  const student = await readFile("src/ui/student.js", "utf8");

  assert.match(student, /EBS with ChatGPT/);
  assert.match(student, /AI와 대화를/);
  assert.match(student, /궁금한 내용을 자유롭게 질문/);
  assert.doesNotMatch(student, /질문의 온도/);
  assert.doesNotMatch(student, /교과서, 검색, 친구 토론/);
  assert.doesNotMatch(student, /근거를 다시 확인/);
  assert.doesNotMatch(student, /활동 관찰/);
  assert.doesNotMatch(student, /이순신 장군 AI 챗봇/);
  assert.doesNotMatch(student, /teacherAudit|correctAnswer|falseClaim|whyFalse/);
});

test("student UI keeps required privacy copy and accessible composer limits", async () => {
  const student = await readFile("src/ui/student.js", "utf8");

  assert.match(student, /이름, 질문, 답변, 접속 상태가 수업 기록으로 저장됩니다/);
  assert.match(student, /이름 외 개인정보는 입력하지 마세요/);
  assert.match(student, /id="message" maxlength="600"/);
  assert.match(student, /id="name" maxlength="40"/);
  assert.match(student, /aria-live="polite"/);
  assert.match(student, /id="statusBadge"[^>]+role="status"[^>]+aria-atomic="true"/);
  assert.match(student, /id="chat"[^>]+aria-busy="false"/);
  assert.match(student, /event\.key === "Enter" && !event\.shiftKey && !event\.isComposing/);
  assert.match(student, /event\.key === "Enter" && !event\.isComposing/);
  assert.match(student, /id="resetSession"/);
  assert.match(student, /id="newStudent"/);
  assert.match(student, /localStorage\.removeItem\(sessionSecretKey\)/);
  assert.match(student, /공용 기기라면 새 학생으로 시작/);
  assert.match(student, /nextStudentName !== studentName\) rotateSessionIdentity\(\)/);
  assert.match(student, /function resetStudentSession\(\)/);
  assert.match(student, /function resetStudentSession\(\) \{\s*if \(submitting\) return;/);
  assert.match(student, /let sessionId = localStorage\.getItem\(sessionKey\) \|\| crypto\.randomUUID\(\)/);
  assert.match(student, /const transcriptKey = "ebs-transcript:" \+ roomId/);
  assert.match(student, /function restoreConversation\(\)/);
  assert.match(student, /async function syncConversationFromServer\(\)/);
  assert.match(student, /const syncId = \+\+historySyncId/);
  assert.match(student, /fetchWithTimeout\(withRoom\("\/api\/history"\)/);
  assert.match(student, /JSON\.stringify\(\{ sessionId, sessionSecret, studentName \}\)/);
  assert.match(student, /if \(submitting \|\| syncId !== historySyncId \|\| !res\.ok/);
  assert.match(student, /submitting = true;\s+historySyncId \+= 1/);
  assert.match(student, /typeof item\.studentVisibleAnswer !== "string"/);
  assert.match(student, /await syncConversationFromServer\(\)/);
  assert.match(student, /conversationHistory\.push/);
  assert.match(student, /storeConversation\(\)/);
  assert.match(student, /localStorage\.removeItem\(transcriptKey\)/);
  assert.match(student, /chat\.replaceChildren\(\)/);
  assert.match(student, /conversationStage\.scrollHeight/);
  assert.match(student, /target\.offsetTop - 24/);
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
  assert.match(student, /typeof data\.answer !== "string" \|\| !data\.answer\.trim\(\)/);
  assert.match(student, /addMessage\("bot", data\.answer/);
  assert.doesNotMatch(student, /teacherAudit|correctAnswer|falseClaim|whyFalse|levelFitReason|preflight/);
});
