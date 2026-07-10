import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("operator docs copy-paste commands preserve strict production release evidence gates", async () => {
  const readme = await readFile("README.md", "utf8");
  const runbook = await readFile("docs/production-runbook.md", "utf8");

  for (const [label, text] of [
    ["README", readme],
    ["production runbook", runbook]
  ]) {
    assert.match(text, /REQUIRE_OPENAI=true[\s\S]*REQUIRE_TEACHER_TOKEN=true[\s\S]*REQUIRE_CLOUDFLARE_EDGE=true[\s\S]*npm run preflight:deploy/, `${label} preflight command must include strict production flags`);
    assert.match(text, /npm run verify:deploy/, `${label} must document deployed Worker verification`);
    assert.match(text, /PR_HEAD_SHA=<latest-sha>[\s\S]*VERIFY_DEPLOY_EVIDENCE_FILE=artifacts\/deploy-evidence\.json[\s\S]*npm run verify:deploy|VERIFY_DEPLOY_EVIDENCE_FILE=artifacts\/deploy-evidence\.json[\s\S]*PR_HEAD_SHA=<latest-sha>[\s\S]*npm run verify:deploy/, `${label} verify:deploy command must write commit-bound evidence`);
    assert.match(text, /REQUIRE_OPENAI=true[\s\S]*REQUIRE_TEACHER_TOKEN=true[\s\S]*EXPECTED_OPENAI_MODEL=gpt-5\.5[\s\S]*EXPECTED_OPENAI_TIMEOUT_MS=15000[\s\S]*PR_HEAD_SHA=<latest-sha>[\s\S]*CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts\/2026-07-13-3-5-config\.json[\s\S]*npm run rehearsal:config/, `${label} rehearsal command must write commit-bound classroom evidence`);
  }
});
