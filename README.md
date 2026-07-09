# EBS Gurapingala Teacher

EBS 다큐프라임 `<생각의 멸종>` 실험용 학생/교사용 AI 챗봇입니다.

## 현재 구현 범위

- GitHub Actions CI: unit tests, 50-turn evaluation, readiness, Worker route smoke
- 학생용 URL: `/`
- 배포 health URL: `/api/health`
- 교사용 대시보드 URL: `/teacher`
- 학생은 이름만 입력하고 입장
- 교사는 학생 카드와 실시간 채팅 텔레메트리 확인
- 교사는 전체 로그 JSON과 정정 수업용 오류표 export 가능
- 정정 수업 오류표는 JSON/CSV 모두 제공
- 학생 heartbeat 기반 online/offline 표시
- `TEACHER_TOKEN` 설정 시 교사용/다운로드/WebSocket/삭제 API 보호
- 학생 session별 채팅 rate limit
- Level 1-4 거짓정보 정책
- 정답, 거짓 답변, 거짓 근거, Level 적합성 검수 JSON 생성
- OpenAI Responses API JSON schema 생성 및 3회 재검수 루프
- 50턴 역사 도메인 평가 세트 포함
- Cloudflare Workers + Durable Objects WebSocket 구조

## 로컬 실행

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
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TEACHER_TOKEN
npx wrangler deploy
```

학생에게는 배포 URL `/`을 공유하고, 교사는 `/teacher`를 사용합니다.
`TEACHER_TOKEN`을 설정했다면 교사는 `/teacher?token=<token>`으로 접속합니다.
단일 `OPENAI_API_KEY`가 서버에만 저장되므로 여러 학생이 같은 API 계정을 공유해도 학생 브라우저에는 키가 노출되지 않습니다.
`OPENAI_API_KEY`가 없거나 `LLM_PROVIDER=rules`이면 로컬 룰 기반 provider로 동작합니다.
`OPENAI_API_KEY`가 있으면 Responses API structured output으로 `correct_answer`, `false_answer`, `false_basis`, `level_fit_reason`, `student_answer`를 생성하고, 검수 실패 시 최대 3회 재생성합니다.
`EVAL_JUDGE=openai`를 설정하면 같은 API 키로 외부 LLM judge가 50턴 결과를 판정하며, judge 호출 실패 시 local judge로 fallback합니다.

## 문서

- [구현 계획](docs/implementation-plan.md)
- [실험 정책](docs/experiment-policy.md)
- [50턴 평가 세트](docs/evaluation-set.md)
- [배포 가이드](docs/deployment-guide.md)
- [촬영 운영 런북](docs/production-runbook.md)
