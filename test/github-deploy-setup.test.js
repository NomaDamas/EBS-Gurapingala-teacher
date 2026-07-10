import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("verify:github-setup passes when required deploy secrets and variables exist", async () => {
  const result = await runSetupCheck({
    GITHUB_SECRET_NAMES: "CLOUDFLARE_ACCOUNT_ID,CLOUDFLARE_API_TOKEN,OPENAI_API_KEY,TEACHER_TOKEN",
    GITHUB_VARIABLE_NAMES: "WORKER_HEALTH_URL,EXPECTED_OPENAI_MODEL,EXPECTED_OPENAI_VERIFIER_MODEL,EXPECTED_OPENAI_TIMEOUT_MS"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /github deploy setup verified/);
  assert.match(result.stdout, /secretValuesPrinted=false/);
  assert.doesNotMatch(result.stdout + result.stderr, /sk-[A-Za-z0-9_-]{12,}/);
});

test("verify:github-setup fails closed with exact setup commands for missing names", async () => {
  const result = await runSetupCheck({
    GITHUB_SECRET_NAMES: "CLOUDFLARE_ACCOUNT_ID",
    GITHUB_VARIABLE_NAMES: "EXPECTED_OPENAI_MODEL"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /missing GitHub secret CLOUDFLARE_API_TOKEN/);
  assert.match(result.stderr, /missing GitHub secret OPENAI_API_KEY/);
  assert.match(result.stderr, /missing GitHub secret TEACHER_TOKEN/);
  assert.match(result.stderr, /missing GitHub variable WORKER_HEALTH_URL/);
  assert.match(result.stderr, /missing GitHub variable EXPECTED_OPENAI_TIMEOUT_MS/);
  assert.match(result.stderr, /missing GitHub variable EXPECTED_OPENAI_VERIFIER_MODEL/);
  assert.match(result.stderr, /gh secret set OPENAI_API_KEY/);
  assert.match(result.stderr, /gh variable set WORKER_HEALTH_URL --body https:\/\/<worker-domain>/);
  assert.match(result.stderr, /gh variable set EXPECTED_OPENAI_VERIFIER_MODEL --body gpt-5\.6-terra/);
  assert.match(result.stderr, /github deploy setup verification failed/);
});

function runSetupCheck(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/verify-github-deploy-setup.js"], {
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
