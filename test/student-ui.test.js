import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("student UI only enters class after successful join and handles network failures", async () => {
  const student = await readFile("src/ui/student.js", "utf8");

  assert.match(student, /let heartbeatTimer = null/);
  assert.match(student, /let joining = false/);
  assert.match(student, /const sessionSecretKey = "ebs-session-secret:" \+ roomId/);
  assert.match(student, /let sessionSecret = localStorage\.getItem\(sessionSecretKey\) \|\| crypto\.randomUUID\(\)/);
  assert.match(student, /localStorage\.setItem\(sessionSecretKey, sessionSecret\)/);
  assert.match(student, /if \(joining\) return/);
  assert.match(student, /joinBtn\.disabled = true/);
  assert.match(student, /const res = await fetch\(withRoom\("\/api\/join"\)/);
  assert.match(student, /JSON\.stringify\(\{ sessionId, sessionSecret, studentName: nextStudentName \}\)/);
  assert.match(student, /const data = await readJsonSafely\(res\)/);
  assert.match(student, /if \(!res\.ok\)[\s\S]*입장 실패/);
  assert.match(student, /if \(heartbeatTimer\) clearInterval\(heartbeatTimer\)/);
  assert.match(student, /heartbeatTimer = setInterval\(sendHeartbeat, 15000\)/);
  assert.match(student, /catch \(error\)[\s\S]*네트워크를 확인해 주세요/);
  assert.match(student, /finally[\s\S]*joining = false[\s\S]*joinBtn\.disabled = false/);
});

test("student chat submit reports failed or malformed responses without breaking the chat", async () => {
  const student = await readFile("src/ui/student.js", "utf8");

  assert.match(student, /const res = await fetch\(withRoom\("\/api\/chat"\)/);
  assert.match(student, /JSON\.stringify\(\{ sessionId, sessionSecret, studentName, message \}\)/);
  assert.match(student, /const data = await readJsonSafely\(res\)/);
  assert.match(student, /if \(!res\.ok\)[\s\S]*질문을 처리하지 못했어/);
  assert.match(student, /catch \(error\)[\s\S]*네트워크 문제로 답변을 받지 못했어/);
  assert.match(student, /async function readJsonSafely\(res\)/);
  assert.match(student, /return await res\.json\(\)/);
  assert.match(student, /return \{\}/);
});
