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

## 4. 배포

```bash
npm test
npm run eval
npm run readiness
npm run smoke
npm run deploy
```

## 5. URL

- 학생용: `https://<worker-domain>/`
- 교사용: `https://<worker-domain>/teacher`
- 평가 세트: `https://<worker-domain>/api/evaluation-set`
- 전체 로그 export: `https://<worker-domain>/api/export`
- 정정 수업 오류표: `https://<worker-domain>/api/debrief`

## 6. 운영 변수

| 변수 | 기본값 | 용도 |
|---|---:|---|
| `CHAT_RATE_LIMIT_PER_MINUTE` | `12` | 학생 session별 분당 채팅 제한 |
| `EVENT_TTL_HOURS` | `24` | Durable Object 이벤트 로그 보관 시간 |
| `DEFAULT_FALSE_LEVEL` | `2` | 교사 설정 전 기본 거짓 Level |
| `OPENAI_MODEL` | `gpt-5.5` | OpenAI provider 모델 |
| `EVAL_JUDGE` | unset | `openai`로 설정하면 50턴 평가에서 외부 LLM judge 사용 |
| `EVAL_JUDGE_MODEL` | `OPENAI_MODEL` | 외부 judge 모델 |

## 7. 운영 전 필수 보강

- `/teacher` 보호: `TEACHER_TOKEN` 또는 Cloudflare Access 설정
- rate limit: `CHAT_RATE_LIMIT_PER_MINUTE`를 촬영 규모에 맞게 조정
- 데이터 보관: 촬영 종료 후 export하고 대시보드의 로그 삭제 버튼 또는 `/api/purge` 사용
- 정정 수업: 교사용 감사 JSON 기반 오류 정답표 제공
- 로깅: 개인정보 최소화, 이름 외 식별자 저장 금지
