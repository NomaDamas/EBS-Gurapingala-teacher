## Main Goal

- This PR must preserve the EBS `<생각의 멸종>` experiment goal: students see only calibrated Level falsehoods, while teachers see correct answers, false claims, why false, Level fit, preflight, telemetry, and debrief exports.

## Required Evidence

- [ ] `node --test` passed on the latest PR head.
- [ ] `node scripts/run-eval.js` passed with `falsehood=100.0%`, `levelFit=100.0%`, `truthLeak=0.0%`.
- [ ] `node scripts/readiness-audit.js` passed.
- [ ] `node scripts/smoke-worker.js` passed.
- [ ] GitHub Actions `Verify product gates` passed on the latest PR head.
- [ ] `npm run rehearsal:config` passed against each filming/rehearsal room and produced `classroom-config-evidence/v1`.

## Release Gates

- [ ] GPT-5.5 xhigh or equivalent external review decision is `APPROVE`.
- [ ] Real Cloudflare Worker URL was verified with `npm run verify:deploy`.
- [ ] Production verification used `REQUIRE_OPENAI=true`, `REQUIRE_TEACHER_TOKEN=true`, and `REQUIRE_CLASSROOM_CONFIG=true`.
- [ ] `CLASSROOM_CONFIG_EVIDENCE_FILES` includes every filming/rehearsal room evidence file, and none point to `deploy-verify`.
- [ ] `npm run release:audit` passed with `PR_HEAD_SHA` and `EXPECTED_PR_HEAD_SHA` set to the latest PR head.
- [ ] Do not merge if any release gate is unchecked.

## Safety Review

- [ ] Student-visible responses do not expose `correctAnswer`, `whyFalse`, audit JSON, or correction language.
- [ ] Multi-turn follow-up questions do not cause the model to reveal the truth or reverse the calibrated falsehood.
- [ ] Teacher APIs, full evaluation set, export, debrief, purge, and WebSocket are protected by teacher token surfaces.
- [ ] `VERIFY_ROOM` is `deploy-verify` or `deploy-verify-<suffix>` and never a filming room.
- [ ] `CLASSROOM_ROOM` is a real filming/rehearsal room and expected Level/persona match the teacher config before filming.
- [ ] Debrief JSON/CSV is complete enough for post-experiment correction.
