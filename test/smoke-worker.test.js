import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("worker smoke script validates core routes", () => {
  const result = spawnSync(process.execPath, ["scripts/smoke-worker.js"], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /worker smoke passed/);
  assert.match(result.stdout, /PASS student can join and chat/);
  assert.match(result.stdout, /PASS export and debrief work with token/);
});
