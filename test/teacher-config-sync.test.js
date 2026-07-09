import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("teacher dashboard syncs stored config without creating teacher student cards", async () => {
  const worker = await readFile("src/worker.js", "utf8");
  const teacher = await readFile("src/ui/teacher.js", "utf8");

  assert.match(worker, /const config = await this\.state\.storage\.get\("config"\) \|\| null/);
  assert.match(worker, /type: "teacher_config_updated"/);
  assert.match(worker, /const updatedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(worker, /async updateConfig\(data\)/);
  assert.match(worker, /await this\.updateConfig\(data\)/);
  assert.match(worker, /url\.pathname === "\/config" && request\.method === "POST"[\s\S]*this\.updateConfig\(await request\.json\(\)\)/);
  assert.match(worker, /const config = \{\s*level: nextLevel,\s*persona: nextPersona,\s*updatedAt\s*\}/s);

  assert.equal(teacher.includes('updateSocketStatus("online");\n        sendTeacherConfig();'), false);
  assert.match(teacher, /if \(event\.config\) applyTeacherConfig\(event\.config\)/);
  assert.match(teacher, /if \(event\.type === "teacher_config_updated"\)[\s\S]*return;/);
  assert.match(teacher, /function applyTeacherConfig\(config\)/);
  assert.match(teacher, /id="configStatus"/);
  assert.match(teacher, /configStatusEl\.value = "저장 중/);
  assert.match(teacher, /configStatusEl\.value = "적용됨/);
  assert.match(teacher, /id="classSummary"/);
  assert.match(teacher, /function renderClassSummary/);
  assert.match(teacher, /current\.chatTurns = \(current\.chatTurns \|\| 0\) \+ 1/);
  assert.match(teacher, /history\.replaceState/);
  assert.match(teacher, /function buildRoomUrl\(path, includeToken = false\)/);
  assert.match(teacher, /function exportFilename\(kind, extension\)/);
  assert.match(teacher, /roomId \+ "-" \+ kind/);
  assert.match(teacher, /current\.latencyMs = event\.latencyMs/);
  assert.match(teacher, /session\.latencyMs/);
  assert.match(teacher, /copyStudentUrlEl\.addEventListener/);
  assert.match(teacher, /copyTeacherUrlEl\.addEventListener/);
});
