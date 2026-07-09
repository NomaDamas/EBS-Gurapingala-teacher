# Cloudflare 배포 가이드

## 1. 준비

Cloudflare 계정과 Wrangler 로그인이 필요하다.

```bash
npm install
npx wrangler login
```

## 2. OpenAI API 키 등록

학생 브라우저에는 API 키를 절대 넣지 않는다. 서버 secret으로만 등록한다.

```bash
npx wrangler secret put OPENAI_API_KEY
```

`OPENAI_API_KEY`가 등록되어 있으면 OpenAI Responses API를 사용한다.
비용·안정성·촬영 리허설을 위해 강제로 룰 기반 provider만 쓰려면 `LLM_PROVIDER=rules`를 환경변수로 둔다.
모델을 바꾸려면 Cloudflare 환경변수 `OPENAI_MODEL`을 설정한다. 기본값은 `gpt-5.5`다.

## 3. 교사용 접근 보호

학생 URL은 로그인 없이 열리지만, 교사용 화면과 export API는 token으로 보호할 수 있다.

```bash
npx wrangler secret put TEACHER_TOKEN
```

설정 후 교사는 다음 형태로 접속한다.

```text
https://<worker-domain>/teacher?token=<TEACHER_TOKEN>
```

대시보드는 token을 브라우저 localStorage에 저장해 WebSocket, export, debrief, purge 요청에 `x-teacher-token`으로 전달한다.

## 3-1. 촬영방 분리

촬영일·학급별로 `room` query를 다르게 주면 Durable Object 저장소가 분리된다. 학생/교사/export/purge는 같은 `room` 값을 사용해야 한다.

```text
학생: https://<worker-domain>/?room=2026-07-13-3-5
교사: https://<worker-domain>/teacher?room=2026-07-13-3-5&token=<TEACHER_TOKEN>
```

`room` 값은 영문 소문자, 숫자, `_`, `-` 중심으로 정규화된다. 값을 생략하면 `default-classroom`을 사용한다.

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
npm run deploy
```

배포 후 실제 Worker URL을 검증한다.

```bash
WORKER_URL=https://<worker-domain> TEACHER_TOKEN=<TEACHER_TOKEN> WORKER_ROOM=2026-07-13-3-5 REQUIRE_OPENAI=true npm run verify:deploy
```

이 검증은 학생 페이지, `/api/health`, 50턴 평가 endpoint, `/teacher` 보호 여부, token 기반 교사용 접속을 확인한다. `REQUIRE_OPENAI=true`를 주면 `/api/health`의 `provider=openai`와 `openaiConfigured=true`도 강제해 촬영 배포가 rules fallback으로 뜨는 것을 막는다. `TEACHER_TOKEN`을 생략하면 교사용 token 접속 확인은 건너뛰고 보호 정책 상태만 점검한다. `WORKER_ROOM`을 생략하면 기본 방을 확인한다.

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

선택 repository/environment variable:

| 이름 | 용도 |
|---|---|
| `WORKER_HEALTH_URL` | 배포 후 `/api/health` 검증 URL |

수동 배포 workflow도 `node --test`, `node scripts/run-eval.js`, `node scripts/readiness-audit.js`, `node scripts/smoke-worker.js`를 통과한 뒤 `npx wrangler deploy`를 실행한다. `WORKER_HEALTH_URL`이 설정되어 있으면 `scripts/verify-deploy.js`로 실제 배포 URL까지 확인한다. 값은 `https://<worker-domain>` 또는 `https://<worker-domain>/api/health` 어느 쪽이어도 된다.

## 5. URL

- 학생용: `https://<worker-domain>/`
- 배포 health: `https://<worker-domain>/api/health`
- 교사용: `https://<worker-domain>/teacher`
- 평가 세트: `https://<worker-domain>/api/evaluation-set`
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
| `EVAL_JUDGE` | unset | `openai`로 설정하면 50턴 평가에서 외부 LLM judge 사용 |
| `EVAL_JUDGE_MODEL` | `OPENAI_MODEL` | 외부 judge 모델 |

## 7. 운영 전 필수 보강

- 배포 직후 `/api/health`에서 `ok`, `provider`, `teacherProtected`, `chatRateLimitPerMinute`, `eventTtlHours`를 확인
- `/teacher` 보호: `TEACHER_TOKEN` 또는 Cloudflare Access 설정
- rate limit: `CHAT_RATE_LIMIT_PER_MINUTE`를 촬영 규모에 맞게 조정
- 데이터 보관: 촬영 종료 후 export하고 대시보드의 로그 삭제 버튼 또는 `/api/purge` 사용
- 정정 수업: 교사용 감사 JSON 기반 오류 정답표 제공
- 로깅: 개인정보 최소화, 이름 외 식별자 저장 금지

촬영 당일 절차는 [촬영 운영 런북](production-runbook.md)을 따른다.
