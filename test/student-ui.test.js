import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { studentHtml } from "../src/ui/student.js";

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
  assert.match(student, /res\.status === 401 && data\.error === "session_not_joined"/);
  assert.match(student, /return handleEndedStudentSession\(\)/);
  assert.match(student, /throw new Error\("heartbeat failed"\)/);
  assert.match(student, /heartbeatFailures >= 2/);
  assert.match(student, /catch \(error\)[\s\S]*네트워크를 확인해 주세요/);
  assert.match(student, /finally[\s\S]*joining = false[\s\S]*joinBtn\.disabled = false/);
});

test("generated student page contains valid browser JavaScript", () => {
  const script = studentHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];

  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
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
  assert.match(student, /궁금한 역사 사건, 인물, 기록에 대해 자유롭게/);
  assert.match(student, /Powered by NomaDamas/);
  assert.match(student, /data-prompt="임진왜란은 왜 일어났어\?"/);
  assert.match(student, /data-prompt="조선은 일본의 침략에 어떻게 대응했어\?"/);
  assert.match(student, /data-prompt="임진왜란에서 의병은 어떤 역할을 했어\?"/);
  assert.doesNotMatch(student, /data-prompt="역사 영화의 장면은 실제 역사와 얼마나 같아\?"/);
  assert.doesNotMatch(student, /data-prompt="단종은 왜 왕위에서 물러나 유배를 가게 됐어\?"/);
  assert.doesNotMatch(student, /임진왜란과 이순신 장군에 대해 궁금한 내용/);
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
  assert.match(student, /data\.error === "session_deleted"/);
  assert.match(student, /function handleEndedStudentSession\(\)/);
  assert.match(student, /같은 이름으로 다시 입장하면 새 대화가 시작됩니다/);
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
  assert.doesNotMatch(student, /suggestedQuestions|follow-up-question|이어서 물어보기/);
  assert.doesNotMatch(student, /teacherAudit|correctAnswer|falseClaim|whyFalse|levelFitReason|preflight/);
});

test("student chat safely renders a limited Markdown subset", async () => {
  const student = await readFile("src/ui/student.js", "utf8");

  assert.match(student, /function renderMarkdown\(container, markdown\)/);
  assert.match(student, /function appendInlineMarkdown\(parent, text\)/);
  assert.match(student, /const elementName = token\.startsWith\("\*\*"\) \? "strong" : "code"/);
  assert.match(student, /document\.createElement\(tagName\)/);
  assert.match(student, /document\.createTextNode/);
  assert.match(student, /renderMarkdown\(body, text\)/);
  assert.doesNotMatch(student, /body\.innerHTML = text/);
});
