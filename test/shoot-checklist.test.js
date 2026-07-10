import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("shoot:checklist prints ordered shoot gates without leaking teacher token", async () => {
  const result = await runShootChecklist({
    PR_URL: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1",
    WORKER_URL: "https://worker.example.com/path?token=bad",
    PR_HEAD_SHA: "abc123",
    TEACHER_TOKEN: "secret-token",
    CLASSROOM_PLANS: "2026-07-13-3-5:2:이순신 장군처럼 친절하게 설명한다.;;2026-07-16-3-1:2:이순신 장군처럼 친절하게 설명한다."
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PR head SHA: abc123/);
  assert.match(result.stdout, /npm test/);
  assert.match(result.stdout, /npm run classroom:urls/);
  assert.match(result.stdout, /npm run review:packet/);
  assert.match(result.stdout, /npm run release:commands/);
  assert.match(result.stdout, /model-evaluation-evidence\/v1 proving 50 OpenAI generator\/verifier\/judge turns/);
  assert.match(result.stdout, /Do not merge without actual external GPT-5\.5/);
  assert.match(result.stdout, /Do not share teacherUrl or TEACHER_TOKEN with students/);
  assert.match(result.stdout, /export \/api\/debrief\.csv/);
  assert.equal(result.stdout.includes("secret-token"), false);
  assert.equal(result.stdout.includes("token=bad"), false);
});

test("shoot:checklist carries classroom chat proof into review and release commands", async () => {
  const result = await runShootChecklist({
    PR_URL: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1",
    WORKER_URL: "https://worker.example.com",
    PR_HEAD_SHA: "abc123",
    CLASSROOM_CHAT_PROOF: "true",
    CLASSROOM_PLANS: "2026-07-13-3-5:2:이순신 장군처럼 친절하게 설명한다.;;2026-07-16-3-1:2:이순신 장군처럼 친절하게 설명한다."
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /If classroom chat proof is required/);
  assert.match(result.stdout, /CLASSROOM_CHAT_PROOF=true[\s\S]*npm run review:packet/);
  assert.match(result.stdout, /CLASSROOM_CHAT_PROOF=true[\s\S]*npm run release:commands/);
});

test("shoot:checklist rejects incomplete or unsafe shoot setup", async () => {
  const missing = await runShootChecklist({
    WORKER_URL: "https://worker.example.com"
  });

  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /PR_HEAD_SHA or GITHUB_SHA is required/);
  assert.match(missing.stderr, /CLASSROOM_PLANS is required/);

  const unsafeRoom = await runShootChecklist({
    WORKER_URL: "https://worker.example.com",
    PR_HEAD_SHA: "abc123",
    CLASSROOM_PLANS: "deploy-verify:2:테스트"
  });

  assert.notEqual(unsafeRoom.code, 0);
  assert.match(unsafeRoom.stderr, /roomId must be a filming room/);
});

function runShootChecklist(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/print-shoot-checklist.js"], {
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
