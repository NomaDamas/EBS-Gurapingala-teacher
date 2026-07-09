# 프로덕션 런치 감사 매트릭스

## 목적

이 문서는 EBS 다큐프라임 `<생각의 멸종>` 촬영용 학생/교사용 AI 챗봇이 원래 요구사항을 잃지 않았는지 확인하는 최종 감사 기준이다. `npm run readiness`는 이 문서와 구현 파일을 함께 검사하고, PR 승인 전에는 이 표의 외부 조건까지 확인한다.

## 요구사항별 증거

| 요구사항 | 현재 증거 | 검증 |
|---|---|---|
| 학생은 로그인 없이 URL과 이름만으로 입장 | `src/ui/student.js`, `/api/join`, `README.md` | `node scripts/smoke-worker.js`, `student-entry-no-login` readiness |
| 교사는 별도 대시보드 URL을 사용 | `src/ui/teacher.js`, `/teacher`, `TEACHER_TOKEN` | `teacher page requires token`, `teacher page accepts token` smoke |
| production 배포는 교사용 token 보호를 강제 | `REQUIRE_TEACHER_TOKEN=true`, `/api/health.teacherProtected` | `verify-deploy`, GitHub Deploy workflow |
| 민감 응답이 브라우저/프록시에 캐시되지 않음 | `cache-control: no-store`, `nosniff`, `no-referrer` | smoke, worker health test |
| 교사는 학생 카드별 online/offline과 채팅 진행 상태를 실시간 관찰 | `src/ui/teacher.js`, `/ws/teacher`, Durable Object broadcast | `teacher-realtime-dashboard` readiness, `teacher-config-sync` test |
| 학생 화면에는 Level에 맞춘 거짓 답변만 표시 | `src/domain/llm-provider.js`, `src/domain/misinfo-policy.js`, `/api/chat` | `teacher-audit-json-contract`, `preflight-and-regeneration`, `node scripts/run-eval.js` |
| 교사 화면에는 정답, 거짓, 왜 거짓인지, Level 근거 JSON 표시 | `teacherAudit`, `correctAnswer`, `falseClaim`, `whyFalse`, `levelFitReason` | `teacher-audit-json-contract`, `debrief-export-after-experiment` readiness |
| 진실과 거짓이 섞이고 너무 쉬운 거짓으로만 흐르지 않음 | Level 1-4 정책, `subtlety_score`, 50턴 평가 | `rules: 100.0% pass`, `truthLeak=0.0%`, `subtlety=0.84` |
| 멀티턴에서 LLM이 정답으로 되돌아가는 문제를 차단 | 서버 이벤트 로그 기반 `recentContext`, 3회 재생성, fail-closed | `session-context` test, `llm-provider` test |
| 답변 전 2차 검수로 Level별 거짓말 척도 확인 | `normalizeLlmAudit`, `judgeFalseAnswer`, `preflight` | `preflight-and-regeneration` readiness |
| preflight 실패 audit가 학생 응답으로 누출되지 않음 | Worker fail-closed 응답, `blockedForStudent` telemetry | `preflight-and-regeneration` readiness |
| 50턴 학생 질문 평가 세트와 모델 선택 루프 제공 | `src/domain/evaluation-set.js`, `scripts/run-eval.js`, `src/domain/eval-judge.js` | `npm run eval`, `llm-as-judge-model-selection` readiness |
| 공개 평가 endpoint가 정답·거짓 근거를 누출하지 않음 | `/api/evaluation-set` public projection, `/api/evaluation-set/full` teacher token 보호 | `evaluation set exposes 50 turns` smoke, `verify-deploy` |
| 한 개의 API key/OAuth 계정으로 여러 학생 요청 처리 | 서버-side `OPENAI_API_KEY`, 학생 브라우저 key 미노출 | `single-api-key-server-side` readiness, `/api/health` secret 미노출 test |
| Cloudflare Workers 배포 가능 | `wrangler.toml`, `.github/workflows/deploy.yml`, `docs/deployment-guide.md` | `npm run deploy`, `npm run verify:deploy` |
| CI와 Deploy가 같은 고정 의존성 그래프를 사용 | `package-lock.json`, Node.js 22, `npm ci` | GitHub CI/Deploy workflow, readiness |
| production 배포는 실제 Worker URL 검증을 생략하지 않음 | `WORKER_HEALTH_URL` production 필수, GitHub Deploy precheck | Deploy workflow, readiness |
| 촬영방별 telemetry/export/purge 분리 | `room` query, Durable Object room isolation, `x-purge-room` confirmation | `room query isolates classroom events`, `purge clears events` smoke |
| 배포 검증이 실제 촬영방 로그를 삭제하지 않음 | `VERIFY_ROOM=deploy-verify`, `ALLOW_PURGE_FILMING_ROOM` guard | `verify-deploy` test, `cloudflare-worker-deployment` readiness |
| 촬영 후 정정 수업 자료 생성 | `/api/debrief`, `/api/debrief.csv`, `debriefNote`, `verificationPrompt` | `session-export` test, `debrief-export-after-experiment` readiness |
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
WORKER_URL=https://<worker-domain> TEACHER_TOKEN=<TEACHER_TOKEN> VERIFY_ROOM=deploy-verify REQUIRE_OPENAI=true npm run verify:deploy
```

## 외부 승인 조건

- GitHub Actions `Verify product gates`가 최신 PR head에서 `SUCCESS`여야 한다.
- GPT-5.5 xhigh 또는 동등한 외부 코드 리뷰 승인이 있어야 한다.
- 승인 전에는 `main`에 머지하지 않는다.
- Cloudflare production secret `OPENAI_API_KEY`, `TEACHER_TOKEN` 등록은 실제 배포 계정에서 별도 확인한다.
- 촬영 전 리허설에서 학생 기기 2대 이상, 교사용 대시보드, 정정 수업 export를 실제 URL로 확인한다.

## 남은 위험과 운영 대응

| 위험 | 대응 |
|---|---|
| 실제 LLM provider가 촬영 중 rules fallback으로 동작 | `REQUIRE_OPENAI=true npm run verify:deploy`와 `/api/health`의 `provider=openai` 확인 |
| 촬영 기대 모델이 아닌 다른 OpenAI 모델로 배포 | `/api/health.openaiModel`, `EXPECTED_OPENAI_MODEL` deploy verification |
| production Deploy workflow가 실제 URL 검증을 건너뜀 | production에서 `WORKER_HEALTH_URL`이 비어 있으면 배포 전에 실패 |
| 촬영 당일 새 wrangler/의존성으로 동작이 달라짐 | Node.js 22와 `package-lock.json` 기반 `npm ci`로 CI/Deploy 의존성을 고정 |
| GitHub Deploy workflow가 로컬 검증과 다른 조건으로 배포 | workflow 기본 배포 후 검증은 `VERIFY_ROOM=deploy-verify`, `REQUIRE_OPENAI=true`, `REQUIRE_TEACHER_TOKEN=true`로 실행 |
| 학생이 AI 답변을 정답으로 오인한 채 촬영 종료 | `/api/debrief.csv` 기준 정정 수업을 촬영 직후 수행 |
| 교사용 token URL 노출 | 대시보드가 token을 localStorage에 저장한 뒤 URL에서 제거, 필요 시 `TEACHER_TOKEN` 재발급 |
| 실제 촬영방 로그를 검증 중 삭제 | 검증은 `VERIFY_ROOM=deploy-verify`만 사용, 촬영방 삭제는 export 확인 후 대시보드에서 room명을 다시 입력하고 `x-purge-room` 확인으로 수행 |
| 너무 황당한 오류로 실험 신뢰도 저하 | Level 2 중심 운영, `subtlety_score`와 교사용 JSON으로 사전 리허설 검수 |
