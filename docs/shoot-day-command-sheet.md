# 촬영 당일 커맨드 시트

이 문서는 촬영 당일 운영자가 같은 PR head, 같은 Worker URL, 같은 촬영방 계획으로 검증 증거를 남기기 위한 최소 실행 순서다. 실제 `TEACHER_TOKEN`, `OPENAI_API_KEY`, Cloudflare token은 문서나 PR에 붙이지 않는다.

## 1. 고정값

```bash
export PR_HEAD_SHA=<latest-pr-head-sha>
export WORKER_URL=https://<worker-domain>
export EXPECTED_CLASSROOM_ROOMS=2026-07-13-3-5,2026-07-16-3-1
export CLASSROOM_PLANS='2026-07-13-3-5:2:이순신 장군처럼 친절하게 설명한다.;;2026-07-16-3-1:2:이순신 장군처럼 친절하게 설명한다.'
```

`PR_HEAD_SHA`는 촬영 직전 `gh pr view 1 --json headRefOid`로 다시 확인한다. PR head가 바뀌면 이 문서의 SHA 대신 최신 SHA로 모든 증거를 다시 생성한다.
GitHub Actions Deploy를 쓰는 경우 저장소 secret `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `OPENAI_API_KEY`, `TEACHER_TOKEN`과 variable `WORKER_HEALTH_URL`, `EXPECTED_OPENAI_MODEL`, `EXPECTED_OPENAI_VERIFIER_MODEL`, `EXPECTED_OPENAI_TIMEOUT_MS`가 먼저 설정되어 있어야 한다.
`npm run verify:github-setup`이 통과하지 않으면 Deploy workflow를 실행하지 않는다.

## 2. 로컬 게이트

```bash
npm test
npm run eval
npm run readiness
npm run smoke
npm run verify:github-setup
CLOUDFLARE_ACCOUNT_ID=<account-id> CLOUDFLARE_API_TOKEN=<token> OPENAI_API_KEY=<openai-key> WORKER_HEALTH_URL=$WORKER_URL TEACHER_TOKEN=<TEACHER_TOKEN> VERIFY_ROOM=deploy-verify REQUIRE_OPENAI=true REQUIRE_TEACHER_TOKEN=true REQUIRE_CLOUDFLARE_EDGE=true EXPECTED_OPENAI_MODEL=gpt-5.6-terra EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5.6-terra EXPECTED_OPENAI_TIMEOUT_MS=15000 npm run preflight:deploy
```

기대 결과:

- `npm test`: 전체 통과
- `npm run eval`: 50/50 통과, falsehood 100%, levelFit 100%, truthLeak 0%
- `npm run readiness`: 전체 통과
- `npm run smoke`: 전체 통과
- `npm run verify:github-setup`: 필수 GitHub secret/variable 이름 존재, secret 값 미출력
- `npm run preflight:deploy`: production strict gate 통과. placeholder token, http URL, strict flag 누락이면 실패해야 한다.
- 로컬 `npm run eval`과 로컬 strict eval JSON은 모델 진단용이며 production 릴리즈 증거가 아니다.
- Deploy workflow의 attested OpenAI 50턴 artifact는 `model-evaluation-evidence/v1`, 50/50, fallback 0, response ID 150개여야 한다.

## 3. 공유 URL 출력

```bash
WORKER_URL=$WORKER_URL CLASSROOM_ROOMS=$EXPECTED_CLASSROOM_ROOMS npm run classroom:urls
```

확인 조건:

- 학생 URL은 `/?room=<room>` 형태이며 `token`이 없어야 한다.
- 교사용 URL은 staff-only이며 `<TEACHER_TOKEN>` placeholder 또는 환경변수 기반 token만 사용한다.
- `default-classroom`, `deploy-verify`를 촬영방으로 쓰면 안 된다.

## 4. 외부 리뷰 요청

```bash
PR_URL=https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1 \
PR_HEAD_SHA=$PR_HEAD_SHA \
WORKER_URL=$WORKER_URL \
EXPECTED_CLASSROOM_ROOMS=$EXPECTED_CLASSROOM_ROOMS \
npm run review:packet
```

중단 조건:

- GPT-5.5 xhigh 또는 동등 리뷰가 `APPROVE`를 주기 전에는 머지하지 않는다.
- 실제 Worker `verify:deploy`, `eval:set`, 모든 촬영방 `rehearsal:config`가 pass이기 전에는 리뷰어에게 `APPROVE`를 요청하지 않는다.
- `model-evaluation-evidence/v1`이 같은 `PR_HEAD_SHA`에서 pass이기 전에는 리뷰어에게 `APPROVE`를 요청하지 않는다.
- blocking finding이 하나라도 있으면 구현을 수정하고 같은 게이트를 다시 돈다.

## 5. 배포 검증 증거

```bash
PR_URL=https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1 \
PR_HEAD_SHA=$PR_HEAD_SHA \
CI_EVIDENCE_FILE=artifacts/ci-evidence.json \
npm run verify:ci
```

```bash
PR_HEAD_SHA=$PR_HEAD_SHA \
EVAL_SET_EVIDENCE_FILE=artifacts/evaluation-set-evidence.json \
npm run eval:set
```

다음 로컬 strict 실행은 촬영 전 모델 진단용이다. 이 파일을 `review:evidence` 또는 `release:audit`의 production 증거로 사용하지 않는다.

```bash
OPENAI_API_KEY=<OPENAI_API_KEY> \
LLM_PROVIDER=openai \
EVAL_MODELS=gpt-5.6-terra \
EXPECTED_OPENAI_MODEL=gpt-5.6-terra \
OPENAI_VERIFIER_MODEL=gpt-5.6-terra \
EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5.6-terra \
EVAL_JUDGE=openai \
EVAL_JUDGE_MODEL=gpt-5.6-terra \
REQUIRE_OPENAI_EVAL=true \
PR_HEAD_SHA=$PR_HEAD_SHA \
EVAL_OUTPUT=artifacts/model-evaluation-evidence.json \
npm run eval
```

성공한 GitHub `Deploy` workflow의 run ID를 확인한 뒤, `gh attestation` 명령을 지원하는 최신 GitHub CLI로 production 모델 증거를 받는다.

```bash
gh run download <deploy-run-id> \
  --repo NomaDamas/EBS-Gurapingala-teacher \
  --name model-evaluation-evidence \
  --dir artifacts
gh attestation verify artifacts/model-evaluation-evidence.json \
  --repo NomaDamas/EBS-Gurapingala-teacher
```

```bash
WORKER_URL=$WORKER_URL \
TEACHER_TOKEN=<TEACHER_TOKEN> \
VERIFY_ROOM=deploy-verify \
REQUIRE_OPENAI=true \
REQUIRE_TEACHER_TOKEN=true \
REQUIRE_CLOUDFLARE_EDGE=true \
EXPECTED_OPENAI_MODEL=gpt-5.6-terra \
EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5.6-terra \
EXPECTED_OPENAI_TIMEOUT_MS=15000 \
PR_HEAD_SHA=$PR_HEAD_SHA \
VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json \
npm run verify:deploy
```

확인 조건:

- evidence schema는 `deploy-verification-evidence/v1`이어야 한다.
- `workerUrl`과 `prHeadSha`가 이 문서의 고정값과 같아야 한다.
- `requireOpenAI=true`, `requireTeacherToken=true`가 기록되어야 한다.
- 검증 room은 `deploy-verify` 계열만 사용한다. 실제 촬영방을 넣으면 안 된다.

## 6. 촬영방 설정 증거

```bash
WORKER_URL=$WORKER_URL \
TEACHER_TOKEN=<TEACHER_TOKEN> \
CLASSROOM_ROOM=2026-07-13-3-5 \
EXPECTED_FALSE_LEVEL=2 \
EXPECTED_PERSONA="이순신 장군처럼 친절하게 설명한다." \
REQUIRE_OPENAI=true \
EXPECTED_OPENAI_MODEL=gpt-5.6-terra \
EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5.6-terra \
EXPECTED_OPENAI_TIMEOUT_MS=15000 \
PR_HEAD_SHA=$PR_HEAD_SHA \
CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts/2026-07-13-3-5-config.json \
npm run rehearsal:config
```

```bash
WORKER_URL=$WORKER_URL \
TEACHER_TOKEN=<TEACHER_TOKEN> \
CLASSROOM_ROOM=2026-07-16-3-1 \
EXPECTED_FALSE_LEVEL=2 \
EXPECTED_PERSONA="이순신 장군처럼 친절하게 설명한다." \
REQUIRE_OPENAI=true \
EXPECTED_OPENAI_MODEL=gpt-5.6-terra \
EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5.6-terra \
EXPECTED_OPENAI_TIMEOUT_MS=15000 \
PR_HEAD_SHA=$PR_HEAD_SHA \
CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts/2026-07-16-3-1-config.json \
npm run rehearsal:config
```

설정을 실제로 적용해야 할 때만 각 명령에 `APPLY_CLASSROOM_CONFIG=true`를 추가한다.
교사 설정이 실제 학생 채팅 감사 JSON까지 반영되는지 리허설 증거가 필요하면 개별 명령에는 `VERIFY_CLASSROOM_CHAT=true`를 추가한다. `release:commands`로 전체 증거 명령을 만들 때는 `CLASSROOM_CHAT_PROOF=true`를 추가하면 각 촬영방 리허설 명령에 `VERIFY_CLASSROOM_CHAT=true`가 붙고, 외부 리뷰와 최종 감사에는 `REQUIRE_CLASSROOM_CHAT_PROOF=true`가 붙는다. 이 옵션은 해당 촬영방에 `설정검증` 학생의 검증 채팅 1턴을 남기므로, 실제 촬영방을 깨끗하게 유지해야 하는 시점에는 사용하지 않는다.

## 7. 승인 증거 생성

외부 리뷰가 승인되고, `verify:ci`, attested OpenAI eval artifact, `eval:set`, `verify:deploy`, 모든 촬영방 `rehearsal:config`가 같은 `PR_HEAD_SHA`에서 pass인 뒤에만 실행한다.

```bash
EXTERNAL_REVIEW_DECISION=APPROVE \
EXTERNAL_REVIEWER="GPT-5.5 xhigh equivalent" \
EXTERNAL_REVIEW_TRANSCRIPT_FILE=artifacts/external-review-transcript.md \
PR_HEAD_SHA=$PR_HEAD_SHA \
CI_STATUS=success \
TESTS_STATUS=pass \
EVAL_STATUS=pass \
READINESS_STATUS=pass \
SMOKE_STATUS=pass \
VERIFY_DEPLOY_STATUS=pass \
CLASSROOM_CONFIG_STATUS=pass \
CI_EVIDENCE_FILE=artifacts/ci-evidence.json \
EVALUATION_SET_EVIDENCE_FILE=artifacts/evaluation-set-evidence.json \
MODEL_EVALUATION_EVIDENCE_FILE=artifacts/model-evaluation-evidence.json \
VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json \
CLASSROOM_CONFIG_EVIDENCE_FILES=artifacts/2026-07-13-3-5-config.json,artifacts/2026-07-16-3-1-config.json \
EXPECTED_CLASSROOM_ROOMS=2026-07-13-3-5,2026-07-16-3-1 \
EXTERNAL_REVIEW_FILE=artifacts/external-review.json \
npm run review:evidence
```

## 8. 최종 릴리즈 감사

```bash
EXTERNAL_REVIEW_DECISION=APPROVE \
VERIFY_DEPLOY_STATUS=pass \
WORKER_URL=$WORKER_URL \
PR_HEAD_SHA=$PR_HEAD_SHA \
EXPECTED_PR_HEAD_SHA=$PR_HEAD_SHA \
CI_STATUS=success \
CI_HEAD_SHA=$PR_HEAD_SHA \
CI_EVIDENCE_FILE=artifacts/ci-evidence.json \
EVALUATION_SET_EVIDENCE_FILE=artifacts/evaluation-set-evidence.json \
MODEL_EVALUATION_EVIDENCE_FILE=artifacts/model-evaluation-evidence.json \
REQUIRE_OPENAI=true \
REQUIRE_TEACHER_TOKEN=true \
REQUIRE_CLASSROOM_CONFIG=true \
REQUIRE_CLOUDFLARE_EDGE=true \
EXTERNAL_REVIEW_FILE=artifacts/external-review.json \
VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json \
CLASSROOM_CONFIG_EVIDENCE_FILES=artifacts/2026-07-13-3-5-config.json,artifacts/2026-07-16-3-1-config.json \
EXPECTED_CLASSROOM_ROOMS=$EXPECTED_CLASSROOM_ROOMS \
npm run release:audit
```

통과해야 머지 또는 촬영 릴리즈가 가능하다.

## 9. 원샷 체크리스트

운영자가 명령 순서 전체를 다시 출력하고 싶으면 다음을 실행한다.

```bash
WORKER_URL=$WORKER_URL \
PR_HEAD_SHA=$PR_HEAD_SHA \
CLASSROOM_PLANS=$CLASSROOM_PLANS \
npm run shoot:checklist
```

출력된 stop condition이 하나라도 남아 있으면 중단한다.

## 10. 촬영 직후

- 교사용 대시보드에서 전체 로그 JSON을 다운로드한다.
- 정정 수업 오류표 JSON과 CSV를 다운로드한다.
- `blockedForStudent`, `correctAnswer`, `falseClaim`, `whyFalse`, `level`, `debriefNote`를 기준으로 학생에게 잘못된 역사 정보를 명확히 정정한다.
- export 저장이 끝난 뒤에만 room 이름을 확인하고 촬영 로그 삭제를 진행한다.
