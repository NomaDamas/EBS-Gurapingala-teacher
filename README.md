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
- OpenAI Responses API JSON schema 생성 및 3회 재검수 루프
- 서버 이벤트 로그 기반 멀티턴 맥락 유지: 학생 후속 질문도 같은 세션의 최근 대화를 prompt와 감사 JSON에 반영
- `?room=<촬영방>` query로 학급/촬영일별 telemetry, export, purge 데이터 분리
- 50턴 역사 도메인 평가 세트 포함
- Cloudflare Workers + Durable Objects WebSocket 구조

## 로컬 실행

Node.js 22 이상을 사용합니다. CI와 Cloudflare 배포 workflow는 `package-lock.json` 기반 `npm ci`로 의존성을 고정합니다.

```bash
npm install
npm run dev
```

룰 기반 50턴 평가:

```bash
npm run eval
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
CLOUDFLARE_ACCOUNT_ID=<account-id> CLOUDFLARE_API_TOKEN=<token> WORKER_HEALTH_URL=https://<worker-domain> TEACHER_TOKEN=<token> EXPECTED_OPENAI_MODEL=gpt-5.5 npm run preflight:deploy
```

배포 URL 검증:

```bash
WORKER_URL=https://<worker-domain> TEACHER_TOKEN=<token> VERIFY_ROOM=deploy-verify REQUIRE_OPENAI=true REQUIRE_TEACHER_TOKEN=true EXPECTED_OPENAI_TIMEOUT_MS=15000 PR_HEAD_SHA=<latest-sha> VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json npm run verify:deploy
```

`verify:deploy`는 검증용 telemetry 정리를 위해 `/api/purge`를 호출하므로 실제 촬영방 `room`을 넘기지 않는다. 기본 검증 room은 `deploy-verify`다.

촬영방 설정 검증:

```bash
WORKER_URL=https://<worker-domain> TEACHER_TOKEN=<token> CLASSROOM_ROOM=2026-07-13-3-5 EXPECTED_FALSE_LEVEL=2 EXPECTED_PERSONA="이순신 장군처럼 친절하게 설명한다." REQUIRE_OPENAI=true CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts/2026-07-13-3-5-config.json npm run rehearsal:config
```

머지/릴리즈 직전 최종 감사:

```bash
EXTERNAL_REVIEW_DECISION=APPROVE EXTERNAL_REVIEWER="GPT-5.5 xhigh equivalent" PR_HEAD_SHA=<latest-sha> CI_STATUS=success TESTS_STATUS=pass EVAL_STATUS=pass READINESS_STATUS=pass SMOKE_STATUS=pass VERIFY_DEPLOY_STATUS=pass EXTERNAL_REVIEW_FILE=artifacts/external-review.json npm run review:evidence
```

```bash
EXTERNAL_REVIEW_DECISION=APPROVE VERIFY_DEPLOY_STATUS=pass WORKER_URL=https://<worker-domain> PR_HEAD_SHA=<latest-sha> EXPECTED_PR_HEAD_SHA=<latest-sha> CI_STATUS=success REQUIRE_OPENAI=true REQUIRE_TEACHER_TOKEN=true REQUIRE_CLASSROOM_CONFIG=true EXTERNAL_REVIEW_FILE=artifacts/external-review.json VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json CLASSROOM_CONFIG_EVIDENCE_FILES=artifacts/2026-07-13-3-5-config.json,artifacts/2026-07-16-3-1-config.json EXPECTED_CLASSROOM_ROOMS=2026-07-13-3-5,2026-07-16-3-1 npm run release:audit
```

`release:audit`는 외부 GPT-5.5 xhigh급 승인 파일, 실제 Worker URL `verify:deploy` 증거 파일, 각 촬영방 `rehearsal:config` 증거 파일, 최신 PR head CI 통과, OpenAI/교사용 token/촬영방 설정 검증 증거가 모두 같은 commit에 묶였는지 확인한다. `EXPECTED_CLASSROOM_ROOMS`는 촬영 계획의 기준 room 목록이며, 증거 파일의 `roomId` 집합이 이 목록과 정확히 일치해야 한다.

촬영반별 URL 분리 예시:

```text
학생: https://<worker-domain>/?room=2026-07-13-3-5
교사: https://<worker-domain>/teacher?room=2026-07-13-3-5&token=<token>
```

출력 예시:

```text
rules: 100.0% pass (50/50)
  falsehood=100.0% levelFit=100.0% truthLeak=0.0% subtlety=0.84
```

OpenAI 모델별 50턴 평가:

```bash
OPENAI_API_KEY=... EVAL_MODELS=gpt-5.5,gpt-5.5-mini npm run eval
```

OpenAI LLM-as-judge까지 켠 모델 평가:

```bash
OPENAI_API_KEY=... EVAL_MODELS=gpt-5.5,gpt-5.5-mini EVAL_JUDGE=openai EVAL_JUDGE_MODEL=gpt-5.5 npm run eval
```

## Cloudflare 설정

```bash
CLOUDFLARE_ACCOUNT_ID=<account-id> npx wrangler secret put OPENAI_API_KEY
CLOUDFLARE_ACCOUNT_ID=<account-id> npx wrangler secret put TEACHER_TOKEN
CLOUDFLARE_ACCOUNT_ID=<account-id> npx wrangler deploy
```

Cloudflare 계정이 여러 개이면 `CLOUDFLARE_ACCOUNT_ID`를 반드시 지정해야 Wrangler가 비대화형 배포에서 실패하지 않습니다. 계정이 하나뿐이면 `CLOUDFLARE_ACCOUNT_ID=...` prefix는 생략할 수 있습니다.

학생에게는 배포 URL `/`을 공유하고, 교사는 `/teacher`를 사용합니다.
`TEACHER_TOKEN`을 설정했다면 교사는 `/teacher?token=<token>`으로 최초 접속합니다. 대시보드는 token을 localStorage에 저장한 뒤 주소창에서 제거하고, export/debrief/purge API에는 `x-teacher-token` header로 전달합니다.
단일 `OPENAI_API_KEY`가 서버에만 저장되므로 여러 학생이 같은 API 계정을 공유해도 학생 브라우저에는 키가 노출되지 않습니다.
`OPENAI_API_KEY`가 없거나 `LLM_PROVIDER=rules`이면 로컬 룰 기반 provider로 동작합니다.
`OPENAI_API_KEY`가 있으면 Responses API structured output으로 `correct_answer`, `false_answer`, `false_basis`, `level_fit_reason`, `student_answer`를 생성하고, 검수 실패 시 최대 3회 재생성합니다.
`OPENAI_TIMEOUT_MS`는 OpenAI provider 요청 timeout입니다. 기본값은 `15000`ms이며 `/api/health.openaiTimeoutMs`와 교사용 audit의 `provider.timeoutMs`로 확인합니다.
`EVAL_JUDGE=openai`를 설정하면 같은 API 키로 외부 LLM judge가 50턴 결과를 판정하며, judge 호출 실패 시 local judge로 fallback합니다.
교사용 persona는 말투와 역할 설정에만 사용합니다. 정답 공개, 거짓 공개, 정정 지시, 시스템/검수 우회 지시가 포함되면 `/api/config`와 WebSocket 설정 모두 저장을 거절하고 교사용 대시보드에 `teacher_config_rejected` telemetry를 표시합니다.

## 문서

- [구현 계획](docs/implementation-plan.md)
- [실험 정책](docs/experiment-policy.md)
- [촬영용 채팅 UI 설계 근거](docs/design.md)
- [50턴 평가 세트](docs/evaluation-set.md)
- [배포 가이드](docs/deployment-guide.md)
- [촬영 운영 런북](docs/production-runbook.md)
- [프로덕션 런치 감사 매트릭스](docs/launch-audit.md)
- [GPT-5.5 xhigh 외부 리뷰 패킷](docs/external-review-packet.md)
