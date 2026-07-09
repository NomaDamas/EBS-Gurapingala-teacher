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

## 3. 배포

```bash
npm run deploy
```

## 4. URL

- 학생용: `https://<worker-domain>/`
- 교사용: `https://<worker-domain>/teacher`
- 평가 세트: `https://<worker-domain>/api/evaluation-set`

## 5. 운영 전 필수 보강

- `/teacher` 보호: Cloudflare Access 또는 shared admin token
- rate limit: 학생 session별 요청 제한
- 데이터 보관: 촬영 종료 후 export와 삭제 정책
- 정정 수업: 교사용 감사 JSON 기반 오류 정답표 제공
- 로깅: 개인정보 최소화, 이름 외 식별자 저장 금지
