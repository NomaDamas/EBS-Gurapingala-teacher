import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("readiness audit passes against the current implementation", () => {
  const result = spawnSync(process.execPath, ["scripts/readiness-audit.js"], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /readiness audit passed/);
  assert.match(result.stdout, /PASS teacher-realtime-dashboard/);
  assert.match(result.stdout, /PASS debrief-export-after-experiment/);
});
