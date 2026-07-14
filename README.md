# EBS Gurapingala Teacher

EBS 다큐프라임 `<생각의 멸종>` 실험용 학생/교사용 AI 챗봇입니다.

## 현재 구현 범위

- GitHub Actions CI: unit tests, 50-turn evaluation, readiness, Worker route smoke
- GitHub Actions manual deploy workflow for Cloudflare Workers
- 학생용 URL: `/`
- 배포 health URL: `/api/health`
- 교사용 대시보드 URL: `/teacher`
- 학생은 이름만 입력하고 입장
- 학생 화면은 이름·질문·답변·접속 상태가 교사용 대시보드에 기록된다는 최소 고지를 표시
- 교사는 학생 카드와 실시간 채팅 텔레메트리 확인
- 교사는 `experiment`(진실 맥락+Level별 통제된 거짓)와 `truth`(독립 검수된 사실 답변) 모드 선택
- 교사는 전체 로그 JSON과 정정 수업용 오류표 export 가능
- 정정 수업 오류표는 JSON/CSV 모두 제공
- 학생 답변별 서버 처리 지연 시간 `latencyMs`를 telemetry/export에 기록
- 학생 heartbeat 기반 online/offline 표시
- `TEACHER_TOKEN` 설정 시 교사용/다운로드/WebSocket/삭제 API 보호
- 학생 session별 채팅 rate limit
- 학생 입력 검증: 이름 40자, 질문 600자, 잘못된 JSON/누락 필드는 400으로 거절
- 교사용 persona 검증: 정답 공개, 거짓 공개, 정정 지시, 시스템/검수 우회 지시는 `unsafe_persona_instruction`으로 거절
- 공통 보안 헤더: no-store, nosniff, no-referrer, frame-ancestors 차단, `x-robots-tag: noindex, nofollow`
- Level 1-4 거짓정보 정책
- 정답, 거짓 답변, 거짓 근거, Level 적합성 검수 JSON 생성
- OpenAI Responses API generator/verifier 분리 JSON schema와 3회 재생성 루프
- 서버 이벤트 로그 기반 멀티턴 맥락 유지: 학생 후속 질문도 같은 세션의 최근 대화를 prompt와 감사 JSON에 반영
- `?room=<촬영방>` query로 학급/촬영일별 telemetry, export, purge 데이터 분리
- 50턴 역사 도메인 평가 세트 포함
- 실제 OpenAI generator/verifier/judge 50턴 실행을 PR SHA, 150개 response ID, GitHub Actions artifact attestation에 묶는 `model-evaluation-evidence/v1`
- Cloudflare Workers + Durable Objects WebSocket 구조

## 로컬 실행

Node.js 22 이상을 사용합니다. 저장소의 `.nvmrc`는 CI와 같은 major인 Node `22.22.2`를 고정합니다. CI와 Cloudflare 배포 workflow는 `package-lock.json` 기반 `npm ci`로 의존성을 고정합니다.

```bash
nvm install
nvm use
node --version
npm ci
npm run dev
```

교사용 기능은 `TEACHER_TOKEN`이 없으면 기본적으로 401로 닫힌다. 격리된 로컬 개발에서만 다음처럼 명시적으로 보호 해제를 선택할 수 있으며 production에는 사용하지 않는다.

```bash
npm run dev -- --var ALLOW_INSECURE_TEACHER:true
```

룰 기반 50턴 평가:

```bash
npm run eval
```

50턴 질문·Level·교사용 정답/거짓/근거 evidence 생성:

```bash
PR_HEAD_SHA=<latest-sha> EVAL_SET_EVIDENCE_FILE=artifacts/evaluation-set-evidence.json npm run eval:set
```

선택한 production 모델의 로컬 50턴 진단 실행:

```bash
OPENAI_API_KEY=... LLM_PROVIDER=openai EVAL_MODELS=gpt-5.6-terra EXPECTED_OPENAI_MODEL=gpt-5.6-terra OPENAI_VERIFIER_MODEL=gpt-5.6-terra EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5.6-terra EVAL_JUDGE=openai EVAL_JUDGE_MODEL=gpt-5.6-terra REQUIRE_OPENAI_EVAL=true PR_HEAD_SHA=<latest-sha> EVAL_OUTPUT=artifacts/model-evaluation-evidence.json npm run eval
```

로컬 JSON은 production 릴리즈 증거가 아니다. production에서는 정확한 PR head의 성공한 `Deploy` workflow가 생성·서명한 artifact만 다운로드한다. `review:evidence`와 `release:audit`는 현재 파일의 SHA-256, `.github/workflows/deploy.yml`, `workflow_dispatch`, `PR_HEAD_SHA`를 `gh attestation verify` 결과와 대조하며 검증되지 않은 로컬 JSON을 거절한다.

```bash
gh run download <deploy-run-id> --repo NomaDamas/EBS-Gurapingala-teacher --name model-evaluation-evidence --dir artifacts
gh attestation verify artifacts/model-evaluation-evidence.json --repo NomaDamas/EBS-Gurapingala-teacher
```

프로덕션 readiness 점검:

```bash
npm run readiness
```

Worker route smoke:

```bash
npm run smoke
```

배포 preflight:

```bash
CLOUDFLARE_ACCOUNT_ID=<account-id> CLOUDFLARE_API_TOKEN=<token> OPENAI_API_KEY=<openai-key> WORKER_HEALTH_URL=https://<worker-domain> TEACHER_TOKEN=<token> VERIFY_ROOM=deploy-verify REQUIRE_OPENAI=true REQUIRE_TEACHER_TOKEN=true REQUIRE_CLOUDFLARE_EDGE=true EXPECTED_OPENAI_MODEL=gpt-5.6-terra EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5.6-terra EXPECTED_OPENAI_TIMEOUT_MS=15000 npm run preflight:deploy
```

배포 URL 검증:

```bash
WORKER_URL=https://<worker-domain> TEACHER_TOKEN=<token> VERIFY_ROOM=deploy-verify REQUIRE_OPENAI=true REQUIRE_TEACHER_TOKEN=true REQUIRE_CLOUDFLARE_EDGE=true EXPECTED_OPENAI_MODEL=gpt-5.6-terra EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5.6-terra EXPECTED_OPENAI_TIMEOUT_MS=15000 PR_HEAD_SHA=<latest-sha> VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json npm run verify:deploy
```

`verify:deploy`는 검증용 telemetry 정리를 위해 `/api/purge`를 호출하므로 실제 촬영방 `room`을 넘기지 않는다. 기본 검증 room은 `deploy-verify`다.

촬영방 설정 검증:

```bash
WORKER_URL=https://<worker-domain> TEACHER_TOKEN=<token> CLASSROOM_ROOM=2026-07-13-3-5 EXPECTED_FALSE_LEVEL=2 EXPECTED_PERSONA="이순신 장군처럼 친절하게 설명한다." REQUIRE_OPENAI=true REQUIRE_TEACHER_TOKEN=true EXPECTED_OPENAI_MODEL=gpt-5.6-terra EXPECTED_OPENAI_VERIFIER_MODEL=gpt-5.6-terra EXPECTED_OPENAI_TIMEOUT_MS=15000 PR_HEAD_SHA=<latest-sha> CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts/2026-07-13-3-5-config.json npm run rehearsal:config
```

머지/릴리즈 직전 최종 감사:

```bash
PR_URL=https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1 PR_HEAD_SHA=<latest-sha> CI_EVIDENCE_FILE=artifacts/ci-evidence.json npm run verify:ci
```

```bash
EXTERNAL_REVIEW_DECISION=APPROVE EXTERNAL_REVIEWER="GPT-5.5 xhigh equivalent" EXTERNAL_REVIEW_TRANSCRIPT_FILE=artifacts/external-review-transcript.md PR_HEAD_SHA=<latest-sha> CI_STATUS=success TESTS_STATUS=pass EVAL_STATUS=pass READINESS_STATUS=pass SMOKE_STATUS=pass VERIFY_DEPLOY_STATUS=pass CLASSROOM_CONFIG_STATUS=pass CI_EVIDENCE_FILE=artifacts/ci-evidence.json EVALUATION_SET_EVIDENCE_FILE=artifacts/evaluation-set-evidence.json MODEL_EVALUATION_EVIDENCE_FILE=artifacts/model-evaluation-evidence.json VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json CLASSROOM_CONFIG_EVIDENCE_FILES=artifacts/2026-07-13-3-5-config.json,artifacts/2026-07-16-3-1-config.json EXPECTED_CLASSROOM_ROOMS=2026-07-13-3-5,2026-07-16-3-1 EXTERNAL_REVIEW_FILE=artifacts/external-review.json npm run review:evidence
```

외부 리뷰어에게 전달할 요청문은 현재 PR/SHA와 검증 상태를 넣어 생성할 수 있다.

```bash
PR_URL=https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1 PR_HEAD_SHA=<latest-sha> WORKER_URL=https://<worker-domain> EXPECTED_CLASSROOM_ROOMS=2026-07-13-3-5,2026-07-16-3-1 npm run review:packet
```

```bash
EXTERNAL_REVIEW_DECISION=APPROVE VERIFY_DEPLOY_STATUS=pass WORKER_URL=https://<worker-domain> PR_HEAD_SHA=<latest-sha> EXPECTED_PR_HEAD_SHA=<latest-sha> CI_STATUS=success CI_HEAD_SHA=<latest-sha> CI_EVIDENCE_FILE=artifacts/ci-evidence.json EVALUATION_SET_EVIDENCE_FILE=artifacts/evaluation-set-evidence.json MODEL_EVALUATION_EVIDENCE_FILE=artifacts/model-evaluation-evidence.json REQUIRE_OPENAI=true REQUIRE_TEACHER_TOKEN=true REQUIRE_CLASSROOM_CONFIG=true REQUIRE_CLOUDFLARE_EDGE=true EXTERNAL_REVIEW_FILE=artifacts/external-review.json VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json CLASSROOM_CONFIG_EVIDENCE_FILES=artifacts/2026-07-13-3-5-config.json,artifacts/2026-07-16-3-1-config.json EXPECTED_CLASSROOM_ROOMS=2026-07-13-3-5,2026-07-16-3-1 npm run release:audit
```

`release:audit`는 `external-review-evidence/v1`, `ci-evidence/v1`, 정적 질문/정답 세트인 `evaluation-set-evidence/v1`, 실제 OpenAI 실행인 `model-evaluation-evidence/v1`, 실제 Worker `verify:deploy`, 각 촬영방 `rehearsal:config` 증거를 같은 commit에 묶는다. 모델 평가 증거는 50/50 통과, generator/verifier/judge OpenAI 사용, fallback 0회, 150개 고유 response ID, 배포 generator/verifier 모델 일치와 GitHub Actions attestation을 증명해야 한다. 외부 리뷰 승인 파일은 이 모든 증거 파일의 SHA-256을 `evidenceArtifacts`에 기록하며, 최종 감사는 `CI_EVIDENCE_FILE.generatedAt`이 `checkRun.completedAt` 이후인지, Cloudflare response header evidence와 sanitized `/api/health` snapshot이 있는지, `EXPECTED_CLASSROOM_ROOMS`와 증거 파일의 `roomId` 집합이 정확히 일치하는지, 현재 파일 해시와 생성 시각 순서가 유효한지 다시 확인한다.

명령 조합 실수를 줄이려면 실제 Worker URL과 촬영방 계획을 넣고 릴리즈 증거 명령을 먼저 출력한다.

```bash
WORKER_URL=https://<worker-domain> PR_HEAD_SHA=<latest-sha> CLASSROOM_PLANS='2026-07-13-3-5:2:이순신 장군처럼 친절하게 설명한다.;;2026-07-16-3-1:2:이순신 장군처럼 친절하게 설명한다.' npm run release:commands
```

교사 설정이 실제 `/api/chat` 감사 JSON까지 반영되는지 증거가 필요하면 `CLASSROOM_CHAT_PROOF=true`를 함께 준다. 이 옵션은 각 촬영방에 `설정검증` 채팅 1턴을 남기고, 외부 리뷰 증거와 최종 감사에서 `REQUIRE_CLASSROOM_CHAT_PROOF=true`로 샘플 채팅 증거를 필수로 요구하므로 실제 촬영 직전에는 의도적으로만 사용한다.

촬영방별 공유 URL은 학생용에 token이 섞이지 않도록 별도 출력한다.

```bash
WORKER_URL=https://<worker-domain> CLASSROOM_ROOMS=3-5,3-1 npm run classroom:urls
```

촬영 전 최종 체크리스트는 로컬 게이트, 공유 URL, 외부 리뷰, 릴리즈 증거 명령을 한 번에 묶어 출력한다.

```bash
WORKER_URL=https://<worker-domain> PR_HEAD_SHA=<latest-sha> CLASSROOM_PLANS='2026-07-13-3-5:2:이순신 장군처럼 친절하게 설명한다.;;2026-07-16-3-1:2:이순신 장군처럼 친절하게 설명한다.' npm run shoot:checklist
```

촬영반별 URL 분리 예시:

```text
학생: https://<worker-domain>/?room=3-5
교사: https://<worker-domain>/teacher?room=3-5&token=<token>
```

출력 예시:

```text
rules: 100.0% pass (50/50)
  falsehood=100.0% levelFit=100.0% truthLeak=0.0% subtlety=0.84
```

OpenAI 모델별 50턴 평가:

```bash
OPENAI_API_KEY=... EVAL_MODELS=gpt-5.6-terra,gpt-5.6-luna npm run eval
```

OpenAI LLM-as-judge까지 켠 모델 평가:

```bash
OPENAI_API_KEY=... EVAL_MODELS=gpt-5.6-terra,gpt-5.6-luna EVAL_JUDGE=openai EVAL_JUDGE_MODEL=gpt-5.6-sol npm run eval
```

## Cloudflare 설정

GitHub Actions `Deploy` workflow를 사용할 경우 저장소 secret/variable을 먼저 설정한다. workflow는 `OPENAI_API_KEY`와 `TEACHER_TOKEN`을 Cloudflare Worker secret으로 동기화한 뒤 배포한다.

```bash
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set CLOUDFLARE_API_TOKEN
gh secret set OPENAI_API_KEY
gh secret set TEACHER_TOKEN
gh variable set WORKER_HEALTH_URL --body https://<worker-domain>
gh variable set EXPECTED_OPENAI_MODEL --body gpt-5.6-terra
gh variable set EXPECTED_OPENAI_VERIFIER_MODEL --body gpt-5.6-terra
gh variable set EXPECTED_OPENAI_TIMEOUT_MS --body 15000
npm run verify:github-setup
```

로컬에서 직접 배포할 때는 Cloudflare Worker secret을 직접 설정한다.

```bash
CLOUDFLARE_ACCOUNT_ID=<account-id> npx wrangler secret put OPENAI_API_KEY
CLOUDFLARE_ACCOUNT_ID=<account-id> npx wrangler secret put TEACHER_TOKEN
CLOUDFLARE_ACCOUNT_ID=<account-id> npx wrangler deploy
```

Cloudflare 계정이 여러 개이면 `CLOUDFLARE_ACCOUNT_ID`를 반드시 지정해야 Wrangler가 비대화형 배포에서 실패하지 않습니다. 계정이 하나뿐이면 `CLOUDFLARE_ACCOUNT_ID=...` prefix는 생략할 수 있습니다.

학생에게는 배포 URL `/`을 공유하고, 교사는 `/teacher`를 사용합니다.
`TEACHER_TOKEN`을 설정했다면 교사는 `/teacher?token=<token>`으로 최초 접속합니다. 대시보드는 token을 localStorage에 저장한 뒤 주소창에서 제거하고, export/debrief/purge API에는 `x-teacher-token` header로 전달합니다.
단일 `OPENAI_API_KEY`가 서버에만 저장되므로 여러 학생이 같은 API 계정을 공유해도 학생 브라우저에는 키가 노출되지 않습니다.
`LLM_PROVIDER=rules`를 명시한 격리 로컬 테스트에서만 규칙 기반 provider를 사용합니다. production에서 `OPENAI_API_KEY`가 없으면 규칙 답변으로 조용히 대체하지 않고 fail-closed 합니다.
`experiment` 모드에서는 첫 Responses API 호출이 `correct_answer`, `false_answer`, `false_basis`, `level_fit_reason`, `student_answer`를 생성합니다. 두 번째 독립 verifier 호출은 교사 승인 baseline과 Level별 거짓 seed를 기준으로 정답 일치, 실제 거짓 여부, seed 보존, 학생 답변 내 거짓 주장 포함, Level 적합, 진실 맥락 혼합, 정답·정정 누출, 중학생 대상 미묘함을 검사합니다. 모든 verifier 조건이 통과해야 학생에게 전송하며 실패 시 최대 3회 재생성합니다.
`truth` 모드에서는 사실 답변 generator와 별도 verifier를 사용합니다. 역사적 근거, 현재 질문 응답, unsupported specific과 모순 부재가 모두 승인된 답변만 학생에게 보내며, 이 모드의 턴은 정정 수업 필수 건수에 포함하지 않습니다.
`OPENAI_VERIFIER_MODEL`로 verifier 모델을 별도로 지정할 수 있고, 미설정 시 `OPENAI_MODEL`과 같은 모델을 사용합니다. `/api/health.openaiVerifierModel`, 교사용 audit의 `provider.verifier`, 배포·리허설 증거의 `expectedOpenAIVerifierModel`로 실제 적용을 확인합니다.
`OPENAI_REASONING_EFFORT`와 `OPENAI_VERIFIER_REASONING_EFFORT`는 생성기와 verifier의 reasoning effort를 각각 지정합니다. 프로덕션 기본값은 둘 다 `none`이며 `/api/health`에서 실제 적용값을 확인합니다.
`OPENAI_TIMEOUT_MS`는 OpenAI provider 요청 timeout입니다. 기본값은 `15000`ms이며 `/api/health.openaiTimeoutMs`와 교사용 audit의 `provider.timeoutMs`로 확인합니다.
`EVAL_JUDGE=openai`를 설정하면 같은 API 키로 외부 LLM judge가 50턴 결과를 판정하며, judge 호출 실패 시 local judge로 fallback합니다.
교사용 persona는 말투와 역할 설정에만 사용합니다. 정답 공개, 거짓 공개, 정정 지시, 시스템/검수 우회 지시가 포함되면 `/api/config`와 WebSocket 설정 모두 저장을 거절하고 교사용 대시보드에 `teacher_config_rejected` telemetry를 표시합니다.

## 문서

- [구현 계획](docs/implementation-plan.md)
- [실험 정책](docs/experiment-policy.md)
- [촬영용 채팅 UI 설계 근거](docs/design.md)
- [50턴 평가 세트](docs/evaluation-set.md)
- [모델 평가 결과 보고서](docs/model-evaluation-report.md)
- [배포 가이드](docs/deployment-guide.md)
- [촬영 운영 런북](docs/production-runbook.md)
- [촬영 당일 커맨드 시트](docs/shoot-day-command-sheet.md)
- [프로덕션 런치 감사 매트릭스](docs/launch-audit.md)
- [GPT-5.5 xhigh 외부 리뷰 패킷](docs/external-review-packet.md)
