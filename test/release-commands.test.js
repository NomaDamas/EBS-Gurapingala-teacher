import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("release:commands prints commit-bound deploy, classroom, review, and release commands", async () => {
  const result = await runReleaseCommands({
    WORKER_URL: "https://worker.example.com/some/path?x=1",
    PR_HEAD_SHA: "abc123",
    TEACHER_TOKEN: "secret-token",
    EXPECTED_OPENAI_MODEL: "gpt-5.5",
    EXPECTED_OPENAI_TIMEOUT_MS: "15000",
    CLASSROOM_PLANS: "2026-07-13-3-5:2:이순신 장군처럼 친절하게 설명한다.;;2026-07-16-3-1:3:조선 수군 기록관처럼 차분하게 설명한다."
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /npm run preflight:deploy/);
  assert.match(result.stdout, /DEPLOY_ENVIRONMENT=production/);
  assert.match(result.stdout, /CLOUDFLARE_ACCOUNT_ID=<CLOUDFLARE_ACCOUNT_ID>|CLOUDFLARE_ACCOUNT_ID=\$CLOUDFLARE_ACCOUNT_ID/);
  assert.match(result.stdout, /CLOUDFLARE_API_TOKEN=<CLOUDFLARE_API_TOKEN>|CLOUDFLARE_API_TOKEN=\$CLOUDFLARE_API_TOKEN/);
  assert.match(result.stdout, /OPENAI_API_KEY=<OPENAI_API_KEY>|OPENAI_API_KEY=\$OPENAI_API_KEY/);
  assert.doesNotMatch(result.stdout, /secret-token/);
  assert.match(result.stdout, /npm run verify:ci/);
  assert.match(result.stdout, /CI_EVIDENCE_FILE=artifacts\/ci-evidence\.json/);
  assert.match(result.stdout, /npm run eval:set/);
  assert.match(result.stdout, /REQUIRE_OPENAI_EVAL=true/);
  assert.match(result.stdout, /gh run download <deploy-run-id>.*model-evaluation-evidence/);
  assert.match(result.stdout, /gh attestation verify artifacts\/model-evaluation-evidence\.json/);
  assert.match(result.stdout, /verifier=gpt-5\.5/);
  assert.match(result.stdout, /EVAL_SET_EVIDENCE_FILE=artifacts\/evaluation-set-evidence\.json/);
  assert.match(result.stdout, /npm run verify:deploy/);
  assert.match(result.stdout, /VERIFY_ROOM=deploy-verify/);
  assert.match(result.stdout, /REQUIRE_CLOUDFLARE_EDGE=true/);
  assert.match(result.stdout, /WORKER_URL=https:\/\/worker\.example\.com\//);
  assert.match(result.stdout, /PR_HEAD_SHA=abc123/);
  assert.match(result.stdout, /EXPECTED_OPENAI_TIMEOUT_MS=15000/);
  assert.match(result.stdout, /CLASSROOM_ROOM=2026-07-13-3-5/);
  assert.match(result.stdout, /EXPECTED_FALSE_LEVEL=2/);
  assert.match(result.stdout, /CLASSROOM_ROOM=2026-07-13-3-5[\s\S]*EXPECTED_OPENAI_TIMEOUT_MS=15000[\s\S]*npm run rehearsal:config/);
  assert.doesNotMatch(result.stdout, /VERIFY_CLASSROOM_CHAT=true/);
  assert.match(result.stdout, /CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts\/2026-07-16-3-1-config\.json/);
  assert.match(result.stdout, /npm run review:evidence/);
  assert.match(result.stdout, /EXTERNAL_REVIEW_TRANSCRIPT_FILE=artifacts\/external-review-transcript\.md/);
  assert.match(result.stdout, /EVALUATION_SET_EVIDENCE_FILE=artifacts\/evaluation-set-evidence\.json/);
  assert.match(result.stdout, /MODEL_EVALUATION_EVIDENCE_FILE=artifacts\/model-evaluation-evidence\.json/);
  assert.doesNotMatch(result.stdout, /MODEL_EVALUATION_ATTESTATION_/);
  assert.match(result.stdout, /CLASSROOM_CONFIG_EVIDENCE_FILES=artifacts\/2026-07-13-3-5-config\.json,artifacts\/2026-07-16-3-1-config\.json/);
  assert.match(result.stdout, /EXPECTED_CLASSROOM_ROOMS=2026-07-13-3-5,2026-07-16-3-1/);
  assert.match(result.stdout, /npm run release:audit/);
  assert.match(result.stdout, /CI_HEAD_SHA=abc123/);
  assert.match(result.stdout, /EVALUATION_SET_EVIDENCE_FILE=artifacts\/evaluation-set-evidence\.json/);
  assert.match(result.stdout, /MODEL_EVALUATION_EVIDENCE_FILE=artifacts\/model-evaluation-evidence\.json/);
});

test("release:commands can intentionally add classroom chat audit proof to rehearsal commands", async () => {
  const result = await runReleaseCommands({
    WORKER_URL: "https://worker.example.com",
    PR_HEAD_SHA: "abc123",
    CLASSROOM_CHAT_PROOF: "true",
    CLASSROOM_PLANS: "2026-07-13-3-5:2:이순신 장군처럼 친절하게 설명한다.;;2026-07-16-3-1:2:이순신 장군처럼 친절하게 설명한다."
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /CLASSROOM_CHAT_PROOF=true adds one setting-validation chat turn/);
  assert.match(result.stdout, /CLASSROOM_ROOM=2026-07-13-3-5[\s\S]*VERIFY_CLASSROOM_CHAT=true[\s\S]*npm run rehearsal:config/);
  assert.match(result.stdout, /CLASSROOM_ROOM=2026-07-16-3-1[\s\S]*VERIFY_CLASSROOM_CHAT=true[\s\S]*npm run rehearsal:config/);
  assert.match(result.stdout, /REQUIRE_CLASSROOM_CHAT_PROOF=true[\s\S]*npm run review:evidence/);
  assert.match(result.stdout, /REQUIRE_CLASSROOM_CHAT_PROOF=true[\s\S]*npm run release:audit/);
});

test("release:commands rejects missing room plan and deploy-verify classroom room", async () => {
  const missing = await runReleaseCommands({
    WORKER_URL: "https://worker.example.com",
    PR_HEAD_SHA: "abc123"
  });

  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /CLASSROOM_PLANS is required/);

  const missingSha = await runReleaseCommands({
    WORKER_URL: "https://worker.example.com",
    CLASSROOM_PLANS: "2026-07-13-3-5:2:테스트"
  });

  assert.notEqual(missingSha.code, 0);
  assert.match(missingSha.stderr, /PR_HEAD_SHA or GITHUB_SHA is required/);

  const deployVerify = await runReleaseCommands({
    WORKER_URL: "https://worker.example.com",
    PR_HEAD_SHA: "abc123",
    CLASSROOM_PLANS: "deploy-verify:2:테스트"
  });

  assert.notEqual(deployVerify.code, 0);
  assert.match(deployVerify.stderr, /roomId must be a filming room/);

  const duplicateRoom = await runReleaseCommands({
    WORKER_URL: "https://worker.example.com",
    PR_HEAD_SHA: "abc123",
    CLASSROOM_PLANS: "2026-07-13-3-5:2:테스트;;2026-07-13-3-5:3:다른 테스트"
  });

  assert.notEqual(duplicateRoom.code, 0);
  assert.match(duplicateRoom.stderr, /duplicate CLASSROOM_PLANS room/);
});

function runReleaseCommands(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/print-release-commands.js"], {
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
