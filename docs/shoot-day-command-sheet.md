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

## 2. 로컬 게이트

```bash
npm test
npm run eval
npm run readiness
npm run smoke
```

기대 결과:

- `npm test`: 전체 통과
- `npm run eval`: 50/50 통과, falsehood 100%, levelFit 100%, truthLeak 0%
- `npm run readiness`: 전체 통과
- `npm run smoke`: 전체 통과

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
- 실제 Worker `verify:deploy`와 모든 촬영방 `rehearsal:config`가 pass이기 전에는 리뷰어에게 `APPROVE`를 요청하지 않는다.
- blocking finding이 하나라도 있으면 구현을 수정하고 같은 게이트를 다시 돈다.

## 5. 배포 검증 증거

```bash
WORKER_URL=$WORKER_URL \
TEACHER_TOKEN=<TEACHER_TOKEN> \
VERIFY_ROOM=deploy-verify \
REQUIRE_OPENAI=true \
REQUIRE_TEACHER_TOKEN=true \
REQUIRE_CLOUDFLARE_EDGE=true \
EXPECTED_OPENAI_MODEL=gpt-5.5 \
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
EXPECTED_OPENAI_MODEL=gpt-5.5 \
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
EXPECTED_OPENAI_MODEL=gpt-5.5 \
EXPECTED_OPENAI_TIMEOUT_MS=15000 \
PR_HEAD_SHA=$PR_HEAD_SHA \
CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts/2026-07-16-3-1-config.json \
npm run rehearsal:config
```

설정을 실제로 적용해야 할 때만 각 명령에 `APPLY_CLASSROOM_CONFIG=true`를 추가한다.

## 7. 승인 증거 생성

외부 리뷰가 승인되고, `verify:deploy`와 모든 촬영방 `rehearsal:config`가 같은 `PR_HEAD_SHA`에서 pass인 뒤에만 실행한다.

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
