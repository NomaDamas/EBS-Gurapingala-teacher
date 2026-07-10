import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("deploy preflight passes with production deployment requirements", async () => {
  const result = await runPreflight({
    DEPLOY_ENVIRONMENT: "production",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_API_TOKEN: "api-token",
    OPENAI_API_KEY: "openai-key",
    WORKER_HEALTH_URL: "https://worker.example.com",
    TEACHER_TOKEN: "teacher-token",
    VERIFY_ROOM: "deploy-verify",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLOUDFLARE_EDGE: "true",
    EXPECTED_OPENAI_MODEL: "gpt-5.5",
    EXPECTED_OPENAI_TIMEOUT_MS: "15000"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /deploy preflight passed for production/);
  assert.match(result.stdout, /verifyRoom=deploy-verify/);
});

test("deploy preflight fails closed when production secrets are missing", async () => {
  const result = await runPreflight({
    DEPLOY_ENVIRONMENT: "production",
    VERIFY_ROOM: "deploy-verify",
    REQUIRE_OPENAI: "true",
    EXPECTED_OPENAI_MODEL: "gpt-5.5"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLOUDFLARE_ACCOUNT_ID is required/);
  assert.match(result.stderr, /CLOUDFLARE_API_TOKEN is required/);
  assert.match(result.stderr, /OPENAI_API_KEY is required/);
  assert.match(result.stderr, /WORKER_HEALTH_URL is required/);
  assert.match(result.stderr, /TEACHER_TOKEN is required/);
  assert.match(result.stderr, /REQUIRE_TEACHER_TOKEN=true is required/);
  assert.match(result.stderr, /REQUIRE_CLOUDFLARE_EDGE=true is required/);
  assert.match(result.stderr, /EXPECTED_OPENAI_TIMEOUT_MS is required/);
});

test("deploy preflight rejects unsafe production verification settings", async () => {
  const result = await runPreflight({
    DEPLOY_ENVIRONMENT: "production",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_API_TOKEN: "api-token",
    OPENAI_API_KEY: "<OPENAI_API_KEY>",
    WORKER_HEALTH_URL: "http://worker.example.com",
    TEACHER_TOKEN: "<TEACHER_TOKEN>",
    VERIFY_ROOM: "deploy-verify",
    REQUIRE_OPENAI: "false",
    REQUIRE_TEACHER_TOKEN: "false",
    REQUIRE_CLOUDFLARE_EDGE: "false",
    EXPECTED_OPENAI_MODEL: "gpt-5.5",
    EXPECTED_OPENAI_TIMEOUT_MS: "15000"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /REQUIRE_OPENAI=true is required/);
  assert.match(result.stderr, /REQUIRE_TEACHER_TOKEN=true is required/);
  assert.match(result.stderr, /REQUIRE_CLOUDFLARE_EDGE=true is required/);
  assert.match(result.stderr, /WORKER_HEALTH_URL must be an https Cloudflare Worker URL/);
  assert.match(result.stderr, /TEACHER_TOKEN must be the real value/);
  assert.match(result.stderr, /OPENAI_API_KEY must be the real value/);
});

test("deploy preflight rejects Cloudflare placeholder credentials", async () => {
  const result = await runPreflight({
    DEPLOY_ENVIRONMENT: "production",
    CLOUDFLARE_ACCOUNT_ID: "<account-id>",
    CLOUDFLARE_API_TOKEN: "your-token",
    OPENAI_API_KEY: "openai-key",
    WORKER_HEALTH_URL: "https://worker.example.com",
    TEACHER_TOKEN: "teacher-token",
    VERIFY_ROOM: "deploy-verify",
    REQUIRE_OPENAI: "true",
    REQUIRE_TEACHER_TOKEN: "true",
    REQUIRE_CLOUDFLARE_EDGE: "true",
    EXPECTED_OPENAI_MODEL: "gpt-5.5",
    EXPECTED_OPENAI_TIMEOUT_MS: "15000"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLOUDFLARE_ACCOUNT_ID must be the real value/);
  assert.match(result.stderr, /CLOUDFLARE_API_TOKEN must be the real value/);
});

test("deploy preflight rejects filming rooms for verification purge", async () => {
  const result = await runPreflight({
    DEPLOY_ENVIRONMENT: "rehearsal",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_API_TOKEN: "api-token",
    TEACHER_TOKEN: "teacher-token",
    VERIFY_ROOM: "2026-07-13-3-5",
    REQUIRE_OPENAI: "false",
    EXPECTED_OPENAI_TIMEOUT_MS: "15000"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_ROOM must be deploy-verify/);
});

function runPreflight(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/deploy-preflight.js"], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        DEPLOY_PREFLIGHT_ALLOW_OLD_NODE_FOR_TESTS: "true",
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
