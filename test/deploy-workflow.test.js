import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Deploy workflow verifies the real Worker with the same strict production gates as release audit", async () => {
  const workflow = await readFile(".github/workflows/deploy.yml", "utf8");
  const verifyStep = workflow.slice(
    workflow.indexOf("- name: Verify health endpoint"),
    workflow.indexOf("- name: Upload deploy verification evidence")
  );

  assert.match(verifyStep, /run: node scripts\/verify-deploy\.js/);
  assert.match(verifyStep, /WORKER_URL: \$\{\{ vars\.WORKER_HEALTH_URL \}\}/);
  assert.match(verifyStep, /TEACHER_TOKEN: \$\{\{ secrets\.TEACHER_TOKEN \}\}/);
  assert.match(verifyStep, /VERIFY_ROOM: \$\{\{ vars\.VERIFY_ROOM \|\| 'deploy-verify' \}\}/);
  assert.match(verifyStep, /REQUIRE_OPENAI: \$\{\{ vars\.REQUIRE_OPENAI \|\| 'true' \}\}/);
  assert.match(verifyStep, /REQUIRE_TEACHER_TOKEN: \$\{\{ vars\.REQUIRE_TEACHER_TOKEN \|\| 'true' \}\}/);
  assert.match(verifyStep, /REQUIRE_CLOUDFLARE_EDGE: \$\{\{ vars\.REQUIRE_CLOUDFLARE_EDGE \|\| 'true' \}\}/);
  assert.match(verifyStep, /EXPECTED_OPENAI_MODEL: \$\{\{ vars\.EXPECTED_OPENAI_MODEL \|\| 'gpt-5\.5' \}\}/);
  assert.match(verifyStep, /EXPECTED_OPENAI_TIMEOUT_MS: \$\{\{ vars\.EXPECTED_OPENAI_TIMEOUT_MS \|\| '15000' \}\}/);
  assert.match(verifyStep, /VERIFY_DEPLOY_EVIDENCE_FILE: artifacts\/deploy-evidence\.json/);
});
