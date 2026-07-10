import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("classroom:urls prints student URLs without token and staff-only teacher URLs", async () => {
  const result = await runClassroomUrls({
    WORKER_URL: "https://worker.example.com/old?token=bad",
    CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1",
    TEACHER_TOKEN: "secret-token"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /room=2026-07-13-3-5/);
  assert.match(result.stdout, /studentUrl=https:\/\/worker\.example\.com\/\?room=2026-07-13-3-5/);
  assert.match(result.stdout, /teacherUrl=https:\/\/worker\.example\.com\/teacher\?room=2026-07-13-3-5&token=\$TEACHER_TOKEN/);
  assert.match(result.stdout, /studentUrl=https:\/\/worker\.example\.com\/\?room=2026-07-16-3-1/);
  assert.equal(result.stdout.includes("secret-token"), false);
  assert.equal(result.stdout.includes("token=bad"), false);
});

test("classroom:urls rejects missing room plan and deploy verification rooms", async () => {
  const missing = await runClassroomUrls({
    WORKER_URL: "https://worker.example.com"
  });

  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /CLASSROOM_ROOMS or EXPECTED_CLASSROOM_ROOMS is required/);

  const deployVerify = await runClassroomUrls({
    WORKER_URL: "https://worker.example.com",
    CLASSROOM_ROOMS: "deploy-verify,2026-07-13-3-5"
  });

  assert.notEqual(deployVerify.code, 0);
  assert.match(deployVerify.stderr, /must not include default-classroom or deploy-verify/);
});

function runClassroomUrls(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/print-classroom-urls.js"], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        ...env
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
