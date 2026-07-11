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
    assert.match(text, /REQUIRE_OPENAI=true[\s\S]*REQUIRE_TEACHER_TOKEN=true[\s\S]*EXPECTED_OPENAI_MODEL=gpt-5\.6-terra[\s\S]*EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5\.6-terra[\s\S]*EXPECTED_OPENAI_TIMEOUT_MS=15000[\s\S]*PR_HEAD_SHA=<latest-sha>[\s\S]*CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts\/2026-07-13-3-5-config\.json[\s\S]*npm run rehearsal:config/, `${label} rehearsal command must write commit-bound classroom evidence`);
    assert.match(text, /gh run download <deploy-run-id>[\s\S]*gh attestation verify artifacts\/model-evaluation-evidence\.json/, `${label} must require attested production model evidence`);
  }
});

test("local operator setup pins the Node 22 toolchain used by CI and Wrangler", async () => {
  const [nvmrc, packageJson, readme, deploymentGuide, runbook, implementationPlan] = await Promise.all([
    readFile(".nvmrc", "utf8"),
    readFile("package.json", "utf8"),
    readFile("README.md", "utf8"),
    readFile("docs/deployment-guide.md", "utf8"),
    readFile("docs/production-runbook.md", "utf8"),
    readFile("docs/implementation-plan.md", "utf8")
  ]);

  assert.equal(nvmrc.trim(), "22.22.2");
  assert.match(packageJson, /"node":\s*">=22\.0\.0"/);
  for (const [label, text] of [
    ["README", readme],
    ["deployment guide", deploymentGuide],
    ["production runbook", runbook]
  ]) {
    assert.match(text, /\.nvmrc/, `${label} must reference the repository Node pin`);
    assert.match(text, /nvm use/, `${label} must activate the pinned Node version`);
    assert.match(text, /node --version/, `${label} must verify the active Node version`);
    assert.match(text, /npm ci/, `${label} must install the locked dependency graph`);
  }
  assert.match(implementationPlan, /release-grade `external-review-evidence\/v1`은 보존되지 않았으므로/);
  assert.match(implementationPlan, /세션 내부 리뷰 결과를 production 승인 증거로 사용하지 않는다/);
  assert.doesNotMatch(implementationPlan, /PR #1은 GPT-5\.5 xhigh 독립 리뷰 `APPROVE` 후 머지되었다/);
});
