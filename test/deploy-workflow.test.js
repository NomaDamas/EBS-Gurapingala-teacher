import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Deploy workflow verifies the real Worker with the same strict production gates as release audit", async () => {
  const workflow = await readFile(".github/workflows/deploy.yml", "utf8");
  const preflightStep = workflow.slice(
    workflow.indexOf("- name: Deployment preflight"),
    workflow.indexOf("- name: Sync OpenAI Worker secret")
  );
  const evaluationStep = workflow.slice(
    workflow.indexOf("- name: 50-turn OpenAI model evaluation"),
    workflow.indexOf("- name: Upload model evaluation evidence")
  );
  const openAiSecretStep = workflow.slice(
    workflow.indexOf("- name: Sync OpenAI Worker secret"),
    workflow.indexOf("- name: Sync teacher Worker secret")
  );
  const teacherSecretStep = workflow.slice(
    workflow.indexOf("- name: Sync teacher Worker secret"),
    workflow.indexOf("- name: Deploy Worker")
  );
  const deployStep = workflow.slice(
    workflow.indexOf("- name: Deploy Worker"),
    workflow.indexOf("- name: Verify health endpoint")
  );
  const verifyStep = workflow.slice(
    workflow.indexOf("- name: Verify health endpoint"),
    workflow.indexOf("- name: Upload deploy verification evidence")
  );

  assert.match(evaluationStep, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(evaluationStep, /LLM_PROVIDER: openai/);
  assert.match(evaluationStep, /EVAL_MODELS: \$\{\{ vars\.EXPECTED_OPENAI_MODEL \|\| 'gpt-5\.6-terra' \}\}/);
  assert.match(evaluationStep, /EXPECTED_OPENAI_VERIFIER_MODEL:/);
  assert.match(evaluationStep, /EVAL_JUDGE: openai/);
  assert.match(evaluationStep, /EVAL_JUDGE_MODEL:/);
  assert.match(evaluationStep, /REQUIRE_OPENAI_EVAL: "true"/);
  assert.match(evaluationStep, /PR_HEAD_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(evaluationStep, /EVAL_OUTPUT: artifacts\/model-evaluation-evidence\.json/);
  assert.match(evaluationStep, /uses: actions\/attest@v4/);
  assert.match(evaluationStep, /subject-path: artifacts\/model-evaluation-evidence\.json/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /attestations: write/);
  assert.match(preflightStep, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(openAiSecretStep, /run: printf '%s' "\$OPENAI_API_KEY" \| npx wrangler secret put OPENAI_API_KEY/);
  assert.match(openAiSecretStep, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(teacherSecretStep, /run: printf '%s' "\$TEACHER_TOKEN" \| npx wrangler secret put TEACHER_TOKEN/);
  assert.match(teacherSecretStep, /TEACHER_TOKEN: \$\{\{ secrets\.TEACHER_TOKEN \}\}/);
  assert.match(deployStep, /--var "OPENAI_MODEL:\$OPENAI_MODEL"/);
  assert.match(deployStep, /--var "OPENAI_VERIFIER_MODEL:\$OPENAI_VERIFIER_MODEL"/);
  assert.match(deployStep, /--var "OPENAI_TIMEOUT_MS:\$OPENAI_TIMEOUT_MS"/);
  assert.match(verifyStep, /run: node scripts\/verify-deploy\.js/);
  assert.match(verifyStep, /WORKER_URL: \$\{\{ vars\.WORKER_HEALTH_URL \}\}/);
  assert.match(verifyStep, /TEACHER_TOKEN: \$\{\{ secrets\.TEACHER_TOKEN \}\}/);
  assert.match(verifyStep, /VERIFY_ROOM: \$\{\{ vars\.VERIFY_ROOM \|\| 'deploy-verify' \}\}/);
  assert.match(verifyStep, /REQUIRE_OPENAI: \$\{\{ vars\.REQUIRE_OPENAI \|\| 'true' \}\}/);
  assert.match(verifyStep, /REQUIRE_TEACHER_TOKEN: \$\{\{ vars\.REQUIRE_TEACHER_TOKEN \|\| 'true' \}\}/);
  assert.match(verifyStep, /REQUIRE_CLOUDFLARE_EDGE: \$\{\{ vars\.REQUIRE_CLOUDFLARE_EDGE \|\| 'true' \}\}/);
  assert.match(verifyStep, /EXPECTED_OPENAI_MODEL: \$\{\{ vars\.EXPECTED_OPENAI_MODEL \|\| 'gpt-5\.6-terra' \}\}/);
  assert.match(verifyStep, /EXPECTED_OPENAI_VERIFIER_MODEL:/);
  assert.match(verifyStep, /EXPECTED_OPENAI_TIMEOUT_MS: \$\{\{ vars\.EXPECTED_OPENAI_TIMEOUT_MS \|\| '15000' \}\}/);
  assert.match(verifyStep, /VERIFY_DEPLOY_EVIDENCE_FILE: artifacts\/deploy-evidence\.json/);
});
