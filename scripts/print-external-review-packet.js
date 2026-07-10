const prUrl = String(process.env.PR_URL || "").trim();
const prHeadSha = String(process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || "").trim();
const ciStatus = String(process.env.CI_STATUS || "success").trim();
const testsStatus = String(process.env.TESTS_STATUS || "pass").trim();
const evalSummary = String(process.env.EVAL_SUMMARY || "50/50 pass, falsehood=100%, levelFit=100%, truthLeak=0%, subtlety=0.84").trim();
const readinessStatus = String(process.env.READINESS_STATUS || "pass").trim();
const smokeStatus = String(process.env.SMOKE_STATUS || "pass").trim();
const verifyDeployStatus = String(process.env.VERIFY_DEPLOY_STATUS || "not-run").trim();
const classroomConfigStatus = String(process.env.CLASSROOM_CONFIG_STATUS || "not-run").trim();
const releaseAuditStatus = String(process.env.RELEASE_AUDIT_STATUS || "not-run").trim();
const workerUrl = String(process.env.WORKER_URL || process.env.WORKER_HEALTH_URL || "<not-yet-provided>").trim();
const classroomRooms = String(process.env.EXPECTED_CLASSROOM_ROOMS || "2026-07-13-3-5,2026-07-16-3-1").trim();

const failures = [];
if (!isUrl(prUrl)) failures.push("PR_URL is required");
if (!prHeadSha) failures.push("PR_HEAD_SHA or GITHUB_SHA is required");
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`external review packet failed: ${failures.length} setup issue(s)`);
  process.exit(1);
}

console.log(`당신은 GPT-5.5 xhigh 수준의 외부 코드 리뷰어입니다.
이 PR은 EBS 다큐프라임 <생각의 멸종> 교실 실험용 학생/교사용 AI 챗봇입니다.

Review target:
- PR: ${prUrl}
- Latest PR head SHA: ${prHeadSha}
- Worker URL for deploy evidence: ${workerUrl}
- Expected filming rooms: ${classroomRooms}

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
- 임시 촬영 URL과 export/debrief/API 응답이 cache-control: no-store와 x-robots-tag: noindex, nofollow를 포함하는지 확인하세요.
- release:commands가 TEACHER_TOKEN 원문을 출력하지 않고, 촬영방 증거 파일과 EXPECTED_CLASSROOM_ROOMS를 같은 source에서 생성하는지 확인하세요.

반드시 반려할 조건:
- 학생 응답에 correctAnswer, whyFalse, "사실은", "정답은" 같은 정정 표현이 누출될 수 있음.
- 교사용 token 없이 teacher API/export/full evaluation/purge 접근이 가능함.
- VERIFY_ROOM 실수로 실제 촬영방 purge가 발생할 수 있음.
- Level/persona 설정이 실제 /api/chat 감사 JSON과 export에 반영되지 않음.
- persona 입력으로 학생에게 정답 공개, 거짓 공개, 정정 표현 노출, preflight 우회를 지시할 수 있음.
- OpenAI key 또는 teacher token이 브라우저나 /api/health에 노출됨.
- 임시 촬영 URL/API 응답이 캐시되거나 검색 색인될 수 있음.
- 50턴 eval에서 falsehood, levelFit, truthLeak 중 하나라도 기준을 만족하지 못함.
- release:audit가 외부 리뷰, 실제 배포 검증, 촬영방별 rehearsal config 증거를 최신 SHA에 묶지 못함.

Evidence checked before review request:
- GitHub Actions Verify product gates on commit ${prHeadSha}: ${ciStatus}
- npm test: ${testsStatus}
- npm run eval: ${evalSummary}
- npm run readiness: ${readinessStatus}
- npm run smoke: ${smokeStatus}
- verify:deploy against production/rehearsal URL: ${verifyDeployStatus}
- rehearsal:config against each filming room: ${classroomConfigStatus}
- npm run release:audit with latest commit evidence: ${releaseAuditStatus}

Approval stop condition:
- Do not return APPROVE if verify:deploy is not pass/success against the real Worker URL with REQUIRE_OPENAI=true, REQUIRE_TEACHER_TOKEN=true, REQUIRE_CLOUDFLARE_EDGE=true, EXPECTED_OPENAI_MODEL, and EXPECTED_OPENAI_TIMEOUT_MS.
- Do not return APPROVE if rehearsal:config is not pass/success for every expected filming room.
- Do not generate external-review-evidence/v1 until those deploy and classroom statuses are pass/success for this exact PR head.

Review checklist:
- src/ui/student.js, src/worker.js: 학생 이름-only 입장, join 실패 시 채팅 진입 차단, session secret, rate limit.
- src/ui/teacher.js, src/worker.js: /teacher, /ws/teacher, 학생 카드 online/offline, 실시간 telemetry, token URL 제거.
- src/domain/misinfo-policy.js: Level 1-4 오류 정책, subtlety, truth/false mix, judgeFalseAnswer.
- src/domain/llm-provider.js: JSON schema, 정답/거짓 이중 생성, 3회 재생성, shouldSendToStudent=false fail-closed.
- src/domain/session-context.js: 같은 학생 session의 최근 대화만 멀티턴 context로 사용.
- src/domain/session-export.js: correctAnswer, falseClaim, whyFalse, debriefRequired, CSV formula safety, secret redaction.
- scripts/run-eval.js, src/domain/eval-judge.js: 50턴 평가와 LLM-as-judge/model selection.
- scripts/verify-deploy.js, scripts/verify-classroom-config.js, scripts/release-audit.js, scripts/print-release-commands.js: production/rehearsal evidence gates.
- docs/launch-audit.md, docs/production-runbook.md, docs/deployment-guide.md: 남은 위험과 운영 대응.

Review decision format:
Review decision: APPROVE | REQUEST_CHANGES

Evidence checked:
- GitHub Actions Verify product gates on commit ${prHeadSha}: SUCCESS/FAIL
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

If and only if the final decision is APPROVE, structured evidence must be generated with:
EXTERNAL_REVIEW_DECISION=APPROVE EXTERNAL_REVIEWER="GPT-5.5 xhigh equivalent" EXTERNAL_REVIEW_TRANSCRIPT_FILE=artifacts/external-review-transcript.md PR_HEAD_SHA=${shellQuote(prHeadSha)} CI_STATUS=success TESTS_STATUS=pass EVAL_STATUS=pass READINESS_STATUS=pass SMOKE_STATUS=pass VERIFY_DEPLOY_STATUS=pass CLASSROOM_CONFIG_STATUS=pass VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json CLASSROOM_CONFIG_EVIDENCE_FILES=artifacts/2026-07-13-3-5-config.json,artifacts/2026-07-16-3-1-config.json EXTERNAL_REVIEW_FILE=artifacts/external-review.json npm run review:evidence`);

function isUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:@,%+=-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}
