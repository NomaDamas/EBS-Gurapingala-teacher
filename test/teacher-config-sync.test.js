import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("teacher dashboard syncs stored config without creating teacher student cards", async () => {
  const worker = await readFile("src/worker.js", "utf8");
  const teacher = await readFile("src/ui/teacher.js", "utf8");

  assert.match(worker, /const config = await this\.state\.storage\.get\("config"\) \|\| null/);
  assert.match(worker, /type: "teacher_config_updated"/);
  assert.match(worker, /config:\s*\{\s*level: nextLevel,\s*persona: nextPersona/s);

  assert.equal(teacher.includes('updateSocketStatus("online");\n        sendTeacherConfig();'), false);
  assert.match(teacher, /if \(event\.config\) applyTeacherConfig\(event\.config\)/);
  assert.match(teacher, /if \(event\.type === "teacher_config_updated"\)[\s\S]*return;/);
  assert.match(teacher, /function applyTeacherConfig\(config\)/);
  assert.match(teacher, /history\.replaceState/);
  assert.match(teacher, /function buildRoomUrl\(path, includeToken = false\)/);
  assert.match(teacher, /copyStudentUrlEl\.addEventListener/);
  assert.match(teacher, /copyTeacherUrlEl\.addEventListener/);
});
