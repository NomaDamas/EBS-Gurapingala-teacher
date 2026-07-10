# GPT-5.5 xhigh 외부 리뷰 패킷

## 목적

이 문서는 PR 리뷰어가 EBS 다큐프라임 `<생각의 멸종>` 실험용 챗봇을 단순 기능 앱이 아니라 촬영·교육·정정 수업이 결합된 프로덕트로 검토하기 위한 기준이다. 리뷰 승인 전에는 `main`에 머지하지 않는다.

## 리뷰어에게 전달할 프롬프트

현재 PR URL, SHA, 검증 상태가 있는 경우에는 아래 문장을 손으로 복사하지 말고 `review:packet`으로 요청문을 생성한다.

```bash
PR_URL=https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1 \
PR_HEAD_SHA=<latest-sha> \
WORKER_URL=https://<worker-domain> \
EXPECTED_CLASSROOM_ROOMS=2026-07-13-3-5,2026-07-16-3-1 \
npm run review:packet
```

```text
당신은 GPT-5.5 xhigh 수준의 외부 코드 리뷰어입니다.
이 PR은 EBS 다큐프라임 <생각의 멸종> 교실 실험용 학생/교사용 AI 챗봇입니다.

핵심 철학:
- 중학생은 멍청이가 아니므로 너무 쉬운 거짓말이 아니라 진실과 섞인 미묘한 역사 오류가 필요합니다.
- 학생 화면에는 Level에 맞춘 거짓 답변만 보여야 합니다.
- 교사 화면과 export에는 정답, 거짓, 왜 거짓인지, Level 근거, preflight 검수 결과가 보여야 합니다.
- 멀티턴에서 LLM이 사실로 되돌아가거나 정정 표현을 학생에게 노출하면 실패입니다.
- 촬영 후 학생에게 확실히 정정할 수 있는 자료가 자동 생성되어야 합니다.

리뷰 범위:
- 학생 no-login URL 입장과 교사용 token 보호가 의도대로 분리되는지 확인하세요.
- WebSocket telemetry, room 격리, export/debrief/purge가 촬영 운영에 안전한지 확인하세요.
- OpenAI Responses API structured output, 3회 preflight 재생성, fail-closed 경로가 학생에게 정답/audit를 누출하지 않는지 확인하세요.
- 50턴 평가 세트와 LLM-as-judge가 모델 선택 근거로 충분한지 확인하세요.
- Cloudflare Worker 배포 workflow와 verify-deploy가 실제 production 오설정을 잡는지 확인하세요.
- 보안 헤더, token URL 제거, 서버-side 단일 API key, rate limit, 데이터 삭제/TTL을 확인하세요.
- 교사용 persona 설정이 정답 공개, 거짓 공개, 정정 지시, 시스템/검수 우회 지시로 거짓 유지 정책을 약화하지 못하는지 확인하세요.
- 임시 촬영 URL과 export/debrief/API 응답이 `cache-control: no-store`와 `x-robots-tag: noindex, nofollow`를 포함하는지 확인하세요.

반드시 반려할 조건:
- 학생 응답에 correctAnswer, whyFalse, "사실은", "정답은" 같은 정정 표현이 누출될 수 있음.
- 교사용 token 없이 teacher API/export/full evaluation/purge 접근이 가능함.
- VERIFY_ROOM 실수로 실제 촬영방 purge가 발생할 수 있음.
- Level/persona 설정이 실제 `/api/chat` 감사 JSON과 export에 반영되지 않음.
- persona 입력으로 학생에게 정답 공개, 거짓 공개, 정정 표현 노출, preflight 우회를 지시할 수 있음.
- OpenAI key 또는 teacher token이 브라우저나 `/api/health`에 노출됨.
- 임시 촬영 URL/API 응답이 캐시되거나 검색 색인될 수 있음.
- 50턴 eval에서 falsehood, levelFit, truthLeak 중 하나라도 기준을 만족하지 못함.
- 실제 Worker `verify:deploy` 또는 촬영방별 `rehearsal:config`가 pass/success가 아닌데 `APPROVE`하려고 함.

승인 조건:
- 최신 PR head에서 GitHub Actions `Verify product gates`가 SUCCESS입니다.
- 아래 로컬 명령이 모두 통과했다는 증거가 있습니다.
- 실제 Worker URL에서 `verify:deploy`가 `REQUIRE_OPENAI=true`, `REQUIRE_TEACHER_TOKEN=true`, `REQUIRE_CLOUDFLARE_EDGE=true`로 통과했습니다.
- 모든 촬영방에서 `rehearsal:config`가 같은 PR head로 통과했습니다.
- 코드/문서가 원래 요구사항을 축소하지 않고 구현합니다.
- 남은 위험이 docs/launch-audit.md 또는 docs/production-runbook.md에 운영 대응으로 기록되어 있습니다.
```

## 리뷰 전 실행 명령

```bash
npm test
npm run eval
npm run readiness
npm run smoke
```

배포 환경변수가 있는 경우에는 배포 전 preflight도 실행한다.

```bash
CLOUDFLARE_ACCOUNT_ID=<account-id> \
CLOUDFLARE_API_TOKEN=<token> \
WORKER_HEALTH_URL=https://<worker-domain> \
TEACHER_TOKEN=<TEACHER_TOKEN> \
EXPECTED_OPENAI_MODEL=gpt-5.5 \
EXPECTED_OPENAI_TIMEOUT_MS=15000 \
npm run preflight:deploy
```

배포 후 실제 Worker URL에서는 production secret이 설정된 상태로 확인한다.

```bash
WORKER_URL=https://<worker-domain> \
TEACHER_TOKEN=<TEACHER_TOKEN> \
VERIFY_ROOM=deploy-verify \
REQUIRE_OPENAI=true \
REQUIRE_TEACHER_TOKEN=true \
REQUIRE_CLOUDFLARE_EDGE=true \
EXPECTED_OPENAI_MODEL=gpt-5.5 \
EXPECTED_OPENAI_TIMEOUT_MS=15000 \
PR_HEAD_SHA=<latest-sha> \
VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json \
npm run verify:deploy
```

## 요구사항별 리뷰 체크리스트

| 영역 | 반드시 확인할 증거 |
|---|---|
| 학생 진입 | `src/ui/student.js`, `/api/join`, 이름 외 개인정보 미요구, join 실패 시 채팅 진입 차단 |
| 학생 채팅 | `/api/chat`, rate limit, 네트워크 실패 메시지, 학생 답변에는 감사 JSON 미노출 |
| 교사 대시보드 | `/teacher`, `/ws/teacher`, 학생 카드 online/offline, 선택 학생 대화, 감사 JSON |
| Level 제어 | `src/domain/misinfo-policy.js`, `DEFAULT_FALSE_LEVEL`, 대시보드 Level 변경, `teacherAudit.input.appliedLevel` |
| Persona 안전장치 | `sanitizeTeacherConfig`, `unsafe_persona_instruction`, `teacher_config_rejected`, `verify-deploy` unsafe persona check |
| LLM provider | `src/domain/llm-provider.js`, JSON schema, 3회 재생성, `shouldSendToStudent=false` fail-closed |
| 멀티턴 | `src/domain/session-context.js`, 같은 session의 최근 대화만 prompt/audit에 반영 |
| 교사용 audit | `correctAnswer`, `falseClaim`, `whyFalse`, `levelFitReason`, `preflight`, `debriefNote` |
| 평가 | 50턴 `EVALUATION_SET_50`, public/full endpoint 분리, local judge와 OpenAI judge fallback |
| Cloudflare | `wrangler.toml`, Durable Object, Deploy workflow, `verify-deploy`, production `WORKER_HEALTH_URL` 필수 |
| 보안/운영 | `TEACHER_TOKEN`, `x-robots-tag: noindex, nofollow`, 보안 헤더, token URL 제거, `x-purge-room`, TTL, debrief CSV |

## 리뷰 판정 양식

```text
Review decision: APPROVE | REQUEST_CHANGES

Evidence checked:
- GitHub Actions Verify product gates on commit <sha>: SUCCESS/FAIL
- npm test: pass/fail
- npm run eval: pass/fail, falsehood=<>, levelFit=<>, truthLeak=<>, subtlety=<>
- npm run readiness: pass/fail
- npm run smoke: pass/fail
- verify:deploy against production/rehearsal URL: pass/fail/not-run
- rehearsal:config against each filming room: pass/fail/not-run, room=<>, expectedLevel=<>, evidence=<classroom-config-evidence/v1>
- npm run release:audit with latest commit evidence: pass/fail/not-run

Blocking findings:
- <file:line> <issue>

Non-blocking risks:
- <risk and operational mitigation>

Final verdict:
- 이 PR은 원래 실험 철학과 production 촬영 요구사항을 충족한다/충족하지 않는다.
```

## 구조화된 승인 증거 생성

리뷰어가 `APPROVE`를 주고 `verify:ci`, 실제 Worker `verify:deploy`, 모든 촬영방 `rehearsal:config`가 같은 PR head에서 pass인 뒤에는 텍스트 판정만 보관하지 말고 `release:audit`가 읽을 JSON 증거를 생성한다. blocking finding이 있거나 `CI_STATUS=success`, `VERIFY_DEPLOY_STATUS=pass`, `CLASSROOM_CONFIG_STATUS=pass`가 아니면 `APPROVE` 증거 생성은 실패한다. `review:evidence`는 CI/배포/촬영방 증거 파일의 schema, `status=pass`, `prHeadSha`, 촬영방 `roomId`도 확인한 뒤 승인 JSON을 쓴다. 최종 감사는 외부 리뷰 증거의 `generatedAt`이 CI/배포/촬영방 증거 생성 시각보다 늦은지도 확인한다.
승인 증거는 실제 리뷰 산출물과 연결되어야 하므로 `EXTERNAL_REVIEW_SOURCE_URL` 또는 `EXTERNAL_REVIEW_TRANSCRIPT_FILE` 중 하나를 반드시 넣는다. transcript 파일을 쓰면 JSON에는 원문이 아니라 SHA-256 hash와 byte 수만 저장된다.

```bash
EXTERNAL_REVIEW_DECISION=APPROVE \
EXTERNAL_REVIEWER="GPT-5.5 xhigh equivalent" \
EXTERNAL_REVIEW_TRANSCRIPT_FILE=artifacts/external-review-transcript.md \
PR_HEAD_SHA=<latest-sha> \
CI_STATUS=success \
TESTS_STATUS=pass \
EVAL_STATUS=pass \
READINESS_STATUS=pass \
SMOKE_STATUS=pass \
VERIFY_DEPLOY_STATUS=pass \
CLASSROOM_CONFIG_STATUS=pass \
CI_EVIDENCE_FILE=artifacts/ci-evidence.json \
VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json \
CLASSROOM_CONFIG_EVIDENCE_FILES=artifacts/2026-07-13-3-5-config.json,artifacts/2026-07-16-3-1-config.json \
EXTERNAL_REVIEW_FILE=artifacts/external-review.json \
npm run review:evidence
```

생성되는 JSON은 `external-review-evidence/v1`이며 `decision`, `reviewer`, `source`, `prHeadSha`, `evidenceArtifacts`, `evidenceChecked`, `blockingFindings`, `nonBlockingRisks`를 포함한다. `evidenceArtifacts`에는 리뷰어가 승인 전에 확인한 실제 CI/배포/촬영방 증거 파일의 SHA-256 해시가 기록되어야 한다.
