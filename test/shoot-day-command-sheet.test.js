import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sheet = readFileSync("docs/shoot-day-command-sheet.md", "utf8");

test("shoot day command sheet keeps release evidence tied to the latest PR head", () => {
  assert.match(sheet, /export PR_HEAD_SHA=<latest-pr-head-sha>/);
  assert.match(sheet, /gh pr view 1 --json headRefOid/);
  assert.match(sheet, /PR_HEAD_SHA=\$PR_HEAD_SHA/);
  assert.match(sheet, /EXPECTED_PR_HEAD_SHA=\$PR_HEAD_SHA/);
  assert.match(sheet, /CI_HEAD_SHA=\$PR_HEAD_SHA/);
  assert.match(sheet, /CI_EVIDENCE_FILE=artifacts\/ci-evidence\.json/);
  assert.match(sheet, /npm run verify:ci/);
  assert.doesNotMatch(sheet, /export PR_HEAD_SHA=[0-9a-f]{7,40}/);
});

test("shoot day command sheet preserves classroom evidence paths and room separation", () => {
  assert.match(sheet, /EXPECTED_CLASSROOM_ROOMS=2026-07-13-3-5,2026-07-16-3-1/);
  assert.match(sheet, /CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts\/2026-07-13-3-5-config\.json/);
  assert.match(sheet, /CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts\/2026-07-16-3-1-config\.json/);
  assert.match(sheet, /CLASSROOM_CONFIG_EVIDENCE_FILES=artifacts\/2026-07-13-3-5-config\.json,artifacts\/2026-07-16-3-1-config\.json/);
  assert.match(sheet, /VERIFY_ROOM=deploy-verify/);
  assert.match(sheet, /실제 촬영방을 넣으면 안 된다/);
  assert.match(sheet, /default-classroom`, `deploy-verify`를 촬영방으로 쓰면 안 된다/);
});

test("shoot day command sheet does not leak secrets and keeps explicit stop conditions", () => {
  assert.match(sheet, /TEACHER_TOKEN=<TEACHER_TOKEN>/);
  assert.match(sheet, /실제 `TEACHER_TOKEN`, `OPENAI_API_KEY`, Cloudflare token은 문서나 PR에 붙이지 않는다/);
  assert.match(sheet, /실제 Worker `verify:deploy`와 모든 촬영방 `rehearsal:config`가 pass이기 전에는 리뷰어에게 `APPROVE`를 요청하지 않는다/);
  assert.match(sheet, /외부 리뷰가 승인되고, `verify:deploy`와 모든 촬영방 `rehearsal:config`가 같은 `PR_HEAD_SHA`에서 pass인 뒤에만 실행한다/);
  assert.match(sheet, /EXTERNAL_REVIEW_TRANSCRIPT_FILE=artifacts\/external-review-transcript\.md/);
  assert.match(sheet, /출력된 stop condition이 하나라도 남아 있으면 중단한다/);
  assert.doesNotMatch(sheet, /sk-[A-Za-z0-9_-]{12,}/);
  assert.doesNotMatch(sheet, /(?:^|\s)TEACHER_TOKEN=[^<\s][^\s]*/);
});
