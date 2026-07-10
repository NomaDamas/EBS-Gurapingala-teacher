# 프로덕션 런치 감사 매트릭스

## 목적

이 문서는 EBS 다큐프라임 `<생각의 멸종>` 촬영용 학생/교사용 AI 챗봇이 원래 요구사항을 잃지 않았는지 확인하는 최종 감사 기준이다. `npm run readiness`는 이 문서와 구현 파일을 함께 검사하고, PR 승인 전에는 이 표의 외부 조건까지 확인한다.

## 요구사항별 증거

| 요구사항 | 현재 증거 | 검증 |
|---|---|---|
| 학생은 로그인 없이 URL과 이름만으로 입장 | `src/ui/student.js`, `/api/join`, `README.md` | `node scripts/smoke-worker.js`, `student-entry-no-login` readiness |
| 교사는 별도 대시보드 URL을 사용 | `src/ui/teacher.js`, `/teacher`, `TEACHER_TOKEN` | `teacher page requires token`, `teacher page accepts token` smoke |
| production 배포는 교사용 token 보호를 강제하고 token 누락 시 fail-closed | `isTeacherAuthorized`, `REQUIRE_TEACHER_TOKEN=true`, `/api/health.teacherProtected` | security test, `verify-deploy`, GitHub Deploy workflow |
| 민감 응답이 브라우저/프록시에 캐시되지 않고 임시 촬영 URL이 검색 색인에 노출되지 않음 | `cache-control: no-store`, `x-robots-tag: noindex, nofollow`, `nosniff`, `no-referrer` | smoke, worker health test |
| 교사는 학생 카드별 online/offline과 채팅 진행 상태를 실시간 관찰 | `src/ui/teacher.js`, `/ws/teacher`, Durable Object broadcast | `teacher-realtime-dashboard` readiness, `teacher-config-sync` test |
| 교사 Level/persona 설정이 실제 학생 답변 생성과 export 타임라인에 반영 | `/api/config`, Durable Object config, `teacherAudit.input`, `teacher_config_updated` raw event | smoke, `verify-deploy` |
| persona가 정답 공개·거짓 공개·검수 우회 지시로 시스템 정책을 약화하지 않으며 거절 이력은 원문 없이 감사 가능 | `unsafe_persona_instruction`, `teacher_config_rejected` | smoke, readiness |
| 학생 화면에는 Level에 맞춘 거짓 답변만 표시 | `src/domain/llm-provider.js`, `src/domain/misinfo-policy.js`, `/api/chat` | `teacher-audit-json-contract`, `preflight-and-regeneration`, `node scripts/run-eval.js` |
| 교사 화면에는 정답, 거짓, 왜 거짓인지, Level 근거 JSON 표시 | `teacherAudit`, `correctAnswer`, `falseClaim`, `whyFalse`, `levelFitReason` | `teacher-audit-json-contract`, `debrief-export-after-experiment` readiness |
| 진실과 거짓이 섞이고 너무 쉬운 거짓으로만 흐르지 않음 | Level 1-4 정책, `subtlety_score`, 50턴 평가 | `rules: 100.0% pass`, `truthLeak=0.0%`, `subtlety=0.84` |
| 멀티턴에서 LLM이 정답으로 되돌아가는 문제를 차단 | 서버 이벤트 로그 기반 `recentContext`, 3회 재생성, fail-closed | `session-context` test, `llm-provider` test |
| 답변 전 독립 LLM verifier로 실제 거짓·Level·진실 혼합·누출·미묘함 확인 | `callOpenAIVerifier`, `applyVerifierVerdict`, `provider.verifier` | `llm-provider` test, `verify-deploy`, `rehearsal:config`, `preflight-and-regeneration` readiness |
| preflight 실패 audit가 학생 응답으로 누출되지 않음 | Worker fail-closed 응답, `blockedForStudent` telemetry | `preflight-and-regeneration` readiness |
| 50턴 학생 질문 평가 세트와 모델 선택 루프 제공 | `src/domain/evaluation-set.js`, `scripts/run-eval.js`, `src/domain/eval-judge.js` | `npm run eval`, `llm-as-judge-model-selection` readiness |
| production 모델 선택은 실제 OpenAI 호출 증거로만 승인 | `model-evaluation-evidence/v1`, `REQUIRE_OPENAI_EVAL=true`, generator/verifier/judge response ID | 50/50, fallback 0, blocked turn 0, 150개 고유 response ID |
| 공개 평가 endpoint가 정답·거짓 근거를 누출하지 않음 | `/api/evaluation-set` public projection, `/api/evaluation-set/full` teacher token 보호 | `evaluation set exposes 50 turns` smoke, `verify-deploy` |
| 한 개의 API key/OAuth 계정으로 여러 학생 요청 처리 | 서버-side `OPENAI_API_KEY`, 학생 브라우저 key 미노출 | `single-api-key-server-side` readiness, `/api/health` secret 미노출 test |
| OpenAI 요청 지연이 교실 진행을 막지 않음 | `OPENAI_TIMEOUT_MS`, `/api/health.openaiTimeoutMs`, audit `provider.timeoutMs` | `verify-deploy`, worker health test, llm-provider test |
| Cloudflare Workers 배포 가능 | `wrangler.toml`, `.github/workflows/deploy.yml`, `docs/deployment-guide.md` | `npm run deploy`, `npm run verify:deploy` |
| 배포 전 환경 누락을 사전에 차단 | `scripts/deploy-preflight.js`, `npm run preflight:deploy`, Deploy workflow preflight step | `deploy-preflight` test, readiness |
| CI와 Deploy가 같은 고정 의존성 그래프를 사용 | `package-lock.json`, Node.js 22, `npm ci` | GitHub CI/Deploy workflow, readiness |
| production 배포는 실제 Worker URL 검증을 생략하지 않음 | `WORKER_HEALTH_URL` production 필수, GitHub Deploy precheck | Deploy workflow, readiness |
| 촬영방별 telemetry/export/purge 분리 | `room` query, Durable Object room isolation, `x-purge-room` confirmation | `room query isolates classroom events`, `purge clears events` smoke |
| 배포 검증이 실제 촬영방 로그를 삭제하지 않음 | `VERIFY_ROOM=deploy-verify`, `ALLOW_PURGE_FILMING_ROOM` guard | `verify-deploy` test, `cloudflare-worker-deployment` readiness |
| 촬영 후 정정 수업 자료 생성 | `/api/debrief`, `/api/debrief.csv`, `debriefRequired`, `debriefNote`, `verificationPrompt` | `session-export` test, `debrief-export-after-experiment` readiness |
| UI는 10k+ stars 채팅 UI를 참고하되 촬영 목적에 맞게 조정 | `docs/design.md` | `design-reference-documented` readiness |
| 운영 절차와 사고 대응 문서화 | `docs/production-runbook.md`, `docs/deployment-guide.md` | `production-runbook-documented` readiness |

## 배포 전 반드시 통과할 명령

```bash
npm test
npm run eval
npm run readiness
npm run smoke
```

배포 후에는 실제 Worker URL에서 OpenAI provider가 설정된 상태로 확인한다.

```bash
OPENAI_API_KEY=<OPENAI_API_KEY> LLM_PROVIDER=openai EVAL_MODELS=gpt-5.6-terra EXPECTED_OPENAI_MODEL=gpt-5.6-terra OPENAI_VERIFIER_MODEL=gpt-5.6-terra EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5.6-terra EVAL_JUDGE=openai EVAL_JUDGE_MODEL=gpt-5.6-terra REQUIRE_OPENAI_EVAL=true PR_HEAD_SHA=<latest-sha> EVAL_OUTPUT=artifacts/model-evaluation-evidence.json npm run eval
```

위 로컬 실행은 모델 진단용이며 production 릴리즈 증거가 아니다. production에서는 최신 `gh` CLI를 사용해 정확한 PR head에서 성공한 GitHub `Deploy` workflow의 attested artifact를 내려받고 검증한다.

```bash
gh run download <deploy-run-id> --repo NomaDamas/EBS-Gurapingala-teacher --name model-evaluation-evidence --dir artifacts
gh attestation verify artifacts/model-evaluation-evidence.json --repo NomaDamas/EBS-Gurapingala-teacher
```

```bash
WORKER_URL=https://<worker-domain> TEACHER_TOKEN=<TEACHER_TOKEN> VERIFY_ROOM=deploy-verify REQUIRE_OPENAI=true REQUIRE_TEACHER_TOKEN=true REQUIRE_CLOUDFLARE_EDGE=true EXPECTED_OPENAI_MODEL=gpt-5.6-terra EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5.6-terra EXPECTED_OPENAI_TIMEOUT_MS=15000 PR_HEAD_SHA=<latest-sha> VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json npm run verify:deploy
```

머지 또는 촬영 릴리즈 전에는 외부 리뷰 승인과 실제 배포 검증 결과가 최신 PR head에 묶여 있는지 별도로 감사한다.

```bash
PR_URL=https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1 PR_HEAD_SHA=<latest-sha> CI_EVIDENCE_FILE=artifacts/ci-evidence.json npm run verify:ci
```

```bash
EXTERNAL_REVIEW_DECISION=APPROVE VERIFY_DEPLOY_STATUS=pass WORKER_URL=https://<worker-domain> PR_HEAD_SHA=<latest-sha> EXPECTED_PR_HEAD_SHA=<latest-sha> CI_STATUS=success CI_HEAD_SHA=<latest-sha> CI_EVIDENCE_FILE=artifacts/ci-evidence.json EVALUATION_SET_EVIDENCE_FILE=artifacts/evaluation-set-evidence.json MODEL_EVALUATION_EVIDENCE_FILE=artifacts/model-evaluation-evidence.json REQUIRE_OPENAI=true REQUIRE_TEACHER_TOKEN=true REQUIRE_CLASSROOM_CONFIG=true REQUIRE_CLOUDFLARE_EDGE=true EXTERNAL_REVIEW_FILE=artifacts/external-review.json VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json CLASSROOM_CONFIG_EVIDENCE_FILES=artifacts/2026-07-13-3-5-config.json,artifacts/2026-07-16-3-1-config.json EXPECTED_CLASSROOM_ROOMS=2026-07-13-3-5,2026-07-16-3-1 npm run release:audit
```

## 외부 승인 조건

- GitHub Actions `Verify product gates`가 최신 PR head에서 `SUCCESS`여야 한다.
- GPT-5.5 xhigh 또는 동등한 외부 코드 리뷰 승인이 있어야 한다.
- 외부 리뷰어는 [GPT-5.5 xhigh 외부 리뷰 패킷](external-review-packet.md)의 프롬프트, 반려 조건, 판정 양식을 사용한다.
- `npm run release:audit`가 최신 PR head SHA, `CI_HEAD_SHA`와 `PR_HEAD_SHA` 일치, `ci-evidence/v1`, `evaluation-set-evidence/v1`, 실제 OpenAI `model-evaluation-evidence/v1`, 50/50, fallback 0, blocked turn 0, 150개 고유 response ID, GitHub Actions attestation의 trusted `.github/workflows/deploy.yml`·`workflow_dispatch`·PR head SHA 바인딩, 배포 generator/verifier 모델 일치, 외부 승인 JSON, 실제 `verify:deploy`, Cloudflare response header evidence, sanitized `/api/health` snapshot, 각 촬영방 `rehearsal:config`, `EXPECTED_CLASSROOM_ROOMS`와 증거 `roomId` 집합 일치, strict release flag를 모두 증명해야 한다.
- 승인 전에는 `main`에 머지하지 않는다.
- Cloudflare production secret `OPENAI_API_KEY`, `TEACHER_TOKEN` 등록은 실제 배포 계정에서 별도 확인한다.
- 촬영 전 리허설에서 학생 기기 2대 이상, 교사용 대시보드, 정정 수업 export를 실제 URL로 확인한다.

## 남은 위험과 운영 대응

| 위험 | 대응 |
|---|---|
| 실제 LLM provider가 촬영 중 rules fallback으로 동작 | `REQUIRE_OPENAI=true npm run verify:deploy`와 `/api/health`의 `provider=openai` 확인 |
| 정적 rules 또는 로컬 strict 평가를 production 모델 증거로 오인 | 성공한 GitHub `Deploy` workflow가 생성하고 `actions/attest@v4`로 서명한 `model-evaluation-evidence/v1`만 승인 |
| 위조하거나 다른 commit에서 생성한 모델 평가 JSON을 승인 | `gh attestation verify`와 release gate가 파일 SHA-256, trusted workflow, `workflow_dispatch`, 현재 `PR_HEAD_SHA`를 대조 |
| 촬영 기대 모델이 아닌 다른 OpenAI 모델로 배포 | `/api/health.openaiModel`, `EXPECTED_OPENAI_MODEL` deploy verification |
| generator와 독립 verifier가 평가 때와 다른 모델로 배포 | `EXPECTED_OPENAI_VERIFIER_MODEL`, `/api/health.openaiVerifierModel`, 모델 평가·배포 evidence 교차 검증 |
| OpenAI 요청 지연으로 교실 채팅 흐름이 멈춤 | `OPENAI_TIMEOUT_MS`를 촬영 규모에 맞게 설정하고 `/api/health.openaiTimeoutMs`, `EXPECTED_OPENAI_TIMEOUT_MS`로 검증 |
| production Deploy workflow가 실제 URL 검증을 건너뜀 | production에서 `WORKER_HEALTH_URL`이 비어 있으면 배포 전에 실패 |
| Cloudflare 계정이 여러 개라 비대화형 배포가 실패 | GitHub Actions secret 또는 로컬 환경에 `CLOUDFLARE_ACCOUNT_ID`를 명시하고, `wrangler whoami`로 계정 id를 확인 |
| 촬영 당일 새 wrangler/의존성으로 동작이 달라짐 | Node.js 22와 `package-lock.json` 기반 `npm ci`로 CI/Deploy 의존성을 고정 |
| GitHub Deploy workflow가 로컬 검증과 다른 조건으로 배포 | workflow 기본 배포 후 검증은 `VERIFY_ROOM=deploy-verify`, `REQUIRE_OPENAI=true`, `REQUIRE_TEACHER_TOKEN=true`로 실행 |
| 학생이 AI 답변을 정답으로 오인한 채 촬영 종료 | `/api/debrief.csv` 기준 정정 수업을 촬영 직후 수행 |
| 교사용 token URL 노출 | 대시보드가 token을 localStorage에 저장한 뒤 URL에서 제거, 필요 시 `TEACHER_TOKEN` 재발급 |
| 실제 촬영방 로그를 검증 중 삭제 | 검증은 `VERIFY_ROOM=deploy-verify`만 사용, 촬영방 삭제는 export 확인 후 대시보드에서 room명을 다시 입력하고 `x-purge-room` 확인으로 수행 |
| 너무 황당한 오류로 실험 신뢰도 저하 | Level 2 중심 운영, `subtlety_score`와 교사용 JSON으로 사전 리허설 검수 |
