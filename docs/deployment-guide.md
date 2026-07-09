# Cloudflare 배포 가이드

## 1. 준비

Cloudflare 계정과 Wrangler 로그인이 필요하다.
Cloudflare 계정이 여러 개이면 로컬 명령과 GitHub Actions 모두 `CLOUDFLARE_ACCOUNT_ID`를 명시해야 한다. 계정 id가 없으면 Wrangler가 비대화형 배포에서 계정을 고르지 못해 실패한다.

```bash
npm install
npx wrangler login
```

## 2. OpenAI API 키 등록

학생 브라우저에는 API 키를 절대 넣지 않는다. 서버 secret으로만 등록한다.

```bash
CLOUDFLARE_ACCOUNT_ID=<account-id> npx wrangler secret put OPENAI_API_KEY
```

`OPENAI_API_KEY`가 등록되어 있으면 OpenAI Responses API를 사용한다.
비용·안정성·촬영 리허설을 위해 강제로 룰 기반 provider만 쓰려면 `LLM_PROVIDER=rules`를 환경변수로 둔다.
모델을 바꾸려면 Cloudflare 환경변수 `OPENAI_MODEL`을 설정한다. 기본값은 `gpt-5.5`다.
OpenAI 요청 대기 시간을 제한하려면 `OPENAI_TIMEOUT_MS`를 설정한다. 기본값은 `15000`이고, Worker는 `1000`~`60000`ms 범위로 보정한다. 이 값은 `/api/health.openaiTimeoutMs`와 교사용 audit JSON의 `provider.timeoutMs`에 남는다.
여러 학생이 동시에 접속해도 학생 브라우저는 API key를 받지 않고, Worker가 하나의 서버-side `OPENAI_API_KEY`로 학생별 `/api/chat` 요청을 처리한다. 학생별 telemetry 구분은 브라우저 계정이 아니라 `sessionId`, `studentName`, `room`으로 수행한다. 브라우저 localStorage의 `sessionSecret`은 Durable Object 내부 검증에만 쓰고 export하지 않는다. `sessionSecret`은 학생이 입력하지 않으며, 같은 `sessionId`를 다른 브라우저가 재사용하려 하면 Worker가 거부한다.

## 3. 교사용 접근 보호

학생 URL은 로그인 없이 열리지만, 교사용 화면과 export API는 token으로 보호할 수 있다.

```bash
CLOUDFLARE_ACCOUNT_ID=<account-id> npx wrangler secret put TEACHER_TOKEN
```

설정 후 교사는 다음 형태로 접속한다.

```text
https://<worker-domain>/teacher?token=<TEACHER_TOKEN>
```

대시보드는 token을 브라우저 localStorage에 저장해 export, debrief, purge 요청에 `x-teacher-token`으로 전달한다. `/teacher` 최초 입장을 제외한 교사용 API는 URL query token을 허용하지 않는다. `/api/purge`는 추가로 현재 room과 일치하는 `x-purge-room` 헤더가 있어야 동작한다.
브라우저 WebSocket은 custom header를 보낼 수 없으므로 교사용 실시간 연결은 token을 URL query에 다시 붙이지 않고 `Sec-WebSocket-Protocol` subprotocol로 전달한다. 따라서 최초 `/teacher?token=...` 접속 후 주소창과 WebSocket URL에는 token이 남지 않아야 한다.

## 3-1. 촬영방 분리

촬영일·학급별로 `room` query를 다르게 주면 Durable Object 저장소가 분리된다. 학생/교사/export/purge는 같은 `room` 값을 사용해야 한다.

```text
학생: https://<worker-domain>/?room=2026-07-13-3-5
교사: https://<worker-domain>/teacher?room=2026-07-13-3-5&token=<TEACHER_TOKEN>
```

`room` 값은 영문 소문자, 숫자, `_`, `-` 중심으로 정규화된다. 값을 생략하면 `default-classroom`을 사용한다.

## 3-2. Level/persona 설정 안전장치

교사용 대시보드의 Level은 1~4 범위로 정규화된다. persona는 말투와 역할 설정에만 사용해야 하며, 정답 공개, 거짓 공개, 정정 지시, 시스템 프롬프트·검수 우회 지시가 들어가면 `/api/config`가 `unsafe_persona_instruction` 400으로 저장을 거절한다. WebSocket 설정 경로도 같은 검수를 사용하며 거절 시 `teacher_config_rejected` telemetry가 교사용 화면에 표시된다.

## 4. 배포

PR에서는 GitHub Actions `Verify product gates`가 다음 명령을 실행한다.

```bash
node --test
node scripts/run-eval.js
node scripts/readiness-audit.js
node scripts/smoke-worker.js
```

로컬 배포 전에도 같은 게이트를 확인한다.

```bash
npm test
npm run eval
npm run readiness
npm run smoke
CLOUDFLARE_ACCOUNT_ID=<account-id> CLOUDFLARE_API_TOKEN=<token> WORKER_HEALTH_URL=https://<worker-domain> TEACHER_TOKEN=<TEACHER_TOKEN> EXPECTED_OPENAI_MODEL=gpt-5.5 npm run preflight:deploy
npm run deploy
```

배포 후 실제 Worker URL을 검증한다.

```bash
WORKER_URL=https://<worker-domain> TEACHER_TOKEN=<TEACHER_TOKEN> VERIFY_ROOM=deploy-verify REQUIRE_OPENAI=true EXPECTED_OPENAI_MODEL=gpt-5.5 EXPECTED_OPENAI_TIMEOUT_MS=15000 npm run verify:deploy
```

이 검증은 학생 페이지와 관찰 고지, `/api/health`, 50턴 평가 endpoint, `/api/join`과 `/api/chat`, `/teacher` 보호 여부, token 기반 교사용 접속, Level/persona 설정 API, unsafe persona 거절, export telemetry, purge 정리를 확인한다. 교사용 API 검증은 URL query token이 아니라 `x-teacher-token` header를 사용해 token이 검증 URL에 남지 않게 한다. 실시간 WebSocket 보호는 `teacher websocket accepts subprotocol token without query token` 체크로 검증하며, token 없이 `/ws/teacher`에 접근하면 401이고 `Sec-WebSocket-Protocol` token만 있으면 인증 통과 후 upgrade 요구 426이 나와야 한다. `REQUIRE_OPENAI=true`를 주면 `/api/health`의 `provider=openai`와 `openaiConfigured=true`도 강제해 촬영 배포가 rules fallback으로 뜨는 것을 막는다. `EXPECTED_OPENAI_MODEL`을 주면 `/api/health.openaiModel`이 촬영 기대 모델과 일치하는지도 확인한다. `EXPECTED_OPENAI_TIMEOUT_MS`를 주면 `/api/health.openaiTimeoutMs`가 촬영 기대 timeout과 일치하는지도 확인한다. `TEACHER_TOKEN`을 생략하면 교사용 token 접속·export·purge 확인은 건너뛰고 보호 정책 상태만 점검한다.

촬영 배포에서는 `REQUIRE_TEACHER_TOKEN=true`도 함께 사용한다. 이 값이 있으면 `TEACHER_TOKEN`이 비어 있거나 `/api/health`의 `teacherProtected`가 `false`인 배포는 실패 처리된다.

`verify:deploy`는 정리 단계에서 `/api/purge`를 호출하므로 실제 촬영방을 쓰면 안 된다. 기본값은 `deploy-verify`이고, `TEACHER_TOKEN`이 있을 때 `VERIFY_ROOM`은 `deploy-verify` 또는 `deploy-verify-<suffix>` 형태여야 한다. 이전 운영 메모의 `WORKER_ROOM=<촬영방>` 값은 검증 cleanup에 사용되지 않으며, 실제 촬영방 purge가 필요할 때만 별도 export 확인 후 대시보드의 `촬영 로그 삭제`를 사용한다.

GitHub Actions에서 수동 배포하려면 `Deploy` workflow를 실행한다.

필요한 repository/environment secrets:

| 이름 | 용도 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | `wrangler deploy` 권한 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |

필요한 Cloudflare Worker secrets:

| 이름 | 용도 |
|---|---|
| `OPENAI_API_KEY` | 서버-side OpenAI API key |
| `TEACHER_TOKEN` | 교사용 대시보드/API 보호 token |

필수 repository/environment variable:

| 이름 | 용도 |
|---|---|
| `WORKER_HEALTH_URL` | production 배포 후 실제 Worker 검증 URL. production `Deploy` workflow에서는 필수 |

선택 repository/environment variable:

| 이름 | 용도 |
|---|---|
| `VERIFY_ROOM` | 배포 후 검증 전용 room. 기본값 `deploy-verify`; 실제 촬영방 금지 |
| `REQUIRE_OPENAI` | 배포 후 OpenAI provider 강제 여부. workflow 기본값은 `true`; rehearsal에서 rules fallback을 의도할 때만 `false` |
| `REQUIRE_TEACHER_TOKEN` | 배포 후 교사용 token 보호 강제 여부. workflow 기본값은 `true`; 로컬 공개 리허설에서만 `false` |
| `EXPECTED_OPENAI_MODEL` | 배포 후 `/api/health.openaiModel` 기대값. workflow 기본값은 `gpt-5.5` |
| `EXPECTED_OPENAI_TIMEOUT_MS` | 배포 후 `/api/health.openaiTimeoutMs` 기대값. 미설정 시 정상 범위만 확인 |

수동 배포 workflow도 Node.js 22에서 `package-lock.json` 기반 `npm ci`로 의존성을 설치한 뒤 `node --test`, `node scripts/run-eval.js`, `node scripts/readiness-audit.js`, `node scripts/smoke-worker.js`, `node scripts/deploy-preflight.js`를 통과하고 `npx wrangler deploy`를 실행한다. production environment에서는 `WORKER_HEALTH_URL`이 비어 있으면 배포 전에 실패한다. 값은 `https://<worker-domain>` 또는 `https://<worker-domain>/api/health` 어느 쪽이어도 된다. workflow는 기본적으로 `VERIFY_ROOM=deploy-verify`, `REQUIRE_OPENAI=true`, `REQUIRE_TEACHER_TOKEN=true`, `EXPECTED_OPENAI_MODEL=gpt-5.5`, `EXPECTED_OPENAI_TIMEOUT_MS=15000`으로 실제 배포 URL을 검증한다.

## 5. URL

- 학생용: `https://<worker-domain>/`
- 배포 health: `https://<worker-domain>/api/health`
- 교사용: `https://<worker-domain>/teacher`
- 공개 평가 세트: `https://<worker-domain>/api/evaluation-set`
- 교사용 전체 평가 세트: `https://<worker-domain>/api/evaluation-set/full`
- 교사용 Level/persona 설정: `https://<worker-domain>/api/config`
- 전체 로그 export: `https://<worker-domain>/api/export`
- 정정 수업 오류표: `https://<worker-domain>/api/debrief`
- 정정 수업 오류표 CSV: `https://<worker-domain>/api/debrief.csv`

## 6. 운영 변수

| 변수 | 기본값 | 용도 |
|---|---:|---|
| `CHAT_RATE_LIMIT_PER_MINUTE` | `12` | 학생 session별 분당 채팅 제한 |
| `EVENT_TTL_HOURS` | `24` | Durable Object 이벤트 로그 보관 시간 |
| `DEFAULT_FALSE_LEVEL` | `2` | 교사 설정 전 기본 거짓 Level |
| `DEFAULT_ROOM_ID` | `default-classroom` | `room` query가 없을 때 사용할 기본 촬영방 |
| `OPENAI_MODEL` | `gpt-5.5` | OpenAI provider 모델 |
| `OPENAI_TIMEOUT_MS` | `15000` | OpenAI Responses API 요청 timeout. `1000`~`60000`ms로 보정 |
| `EVAL_JUDGE` | unset | `openai`로 설정하면 50턴 평가에서 외부 LLM judge 사용 |
| `EVAL_JUDGE_MODEL` | `OPENAI_MODEL` | 외부 judge 모델 |

## 7. 운영 전 필수 보강

- 배포 직후 `/api/health`에서 `ok`, `provider`, `teacherProtected`, `openaiTimeoutMs`, `chatRateLimitPerMinute`, `eventTtlHours`를 확인
- 응답 헤더: `/api/health`, export, debrief 응답에 `cache-control: no-store`, `x-content-type-options: nosniff`, `x-robots-tag: noindex, nofollow`, `referrer-policy: no-referrer`, `content-security-policy`, `permissions-policy`가 있는지 확인
- `/teacher` 보호: `TEACHER_TOKEN` 또는 Cloudflare Access 설정
- rate limit: `CHAT_RATE_LIMIT_PER_MINUTE`를 촬영 규모에 맞게 조정
- 데이터 보관: 촬영 종료 후 export하고 대시보드의 로그 삭제 버튼 또는 `/api/purge` 사용. 삭제 시 room 이름을 다시 입력하고, API 호출은 `x-purge-room: <room>` 헤더를 포함해야 한다.
- 정정 수업: 교사용 감사 JSON 기반 오류 정답표 제공
- 로깅: 개인정보 최소화, 이름 외 식별자 저장 금지

촬영 당일 절차는 [촬영 운영 런북](production-runbook.md)을 따른다.
