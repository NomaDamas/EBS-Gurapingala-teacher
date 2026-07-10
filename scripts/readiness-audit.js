import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { EVALUATION_SET_50 } from "../src/domain/evaluation-set.js";
import { buildEvaluationSet } from "../src/domain/misinfo-policy.js";

const checks = [
  {
    id: "student-entry-no-login",
    evidence: ["src/ui/student.js", "src/worker.js"],
    run: async (files) =>
      includesAll(files["src/ui/student.js"], ["이름을 입력하세요", "교사용 대시보드에 기록됩니다", "이름 외 개인정보는 입력하지 마세요", "/api/join", "/api/chat", "roomId", "withRoom", "heartbeatTimer", "sessionSecret", "studentNameKey", "ebs-student-name:", "localStorage.getItem(studentNameKey)", "localStorage.setItem(studentNameKey, studentName)", "if (!res.ok)", "studentErrorMessage", "rate_limited", "초 뒤에 다시 물어봐", "입장 실패", "네트워크 문제로 답변을 받지 못했어"]) &&
      includesAll(files["src/worker.js"], ['url.pathname === "/"', 'url.pathname === "/api/join"', "normalizeRoomId", "MAX_JSON_BODY_BYTES", "readBoundedText", "payload_too_large", "registerStudentSession", "validateStudentSession", "session_conflict", "session_verification_failed"])
  },
  {
    id: "teacher-realtime-dashboard",
    evidence: ["src/ui/teacher.js", "src/worker.js"],
    run: async (files) =>
      includesAll(files["src/ui/teacher.js"], ["/ws/teacher", "학생 카드", "teacher_config", "snapshot", "previousSelected", "sessions.clear()", "if (previousSelected && sessions.has(previousSelected)) selected = previousSelected", "events_purged", "촬영 로그가 삭제되었습니다.", "실시간 연결 재시도", "reconnectAttempts", "roomId", "withRoom", "applyTeacherConfig", "postTeacherConfig", "/api/config", "저장 실패:", "저장 실패: 네트워크 확인", "teacher_config_updated", "teacher_config_rejected", "학생 URL 복사", "교사용 URL 복사", "감사 JSON 복사", "copyAuditJson", "audit json", "history.replaceState", "latencyMs", "blockedForStudent", "blockedTurns", "debriefRequiredTurns", "blockedMsg", "document.createTextNode(session.name)", "설정 적용 상태", "configStatus", "classSummary", "summaryMetric", "renderEmptyChat", "replaceChildren", "repeat(5, 1fr)", "채팅턴", "차단턴", "정정필요"]) &&
      !files["src/ui/teacher.js"].includes(".innerHTML") &&
      includesAll(files["src/worker.js"], ["WebSocketPair", "sendSnapshot", "broadcast", "getRoom(env, roomId)", "config"])
  },
  {
    id: "level-controlled-falsehood-policy",
    evidence: ["src/domain/misinfo-policy.js"],
    run: async (files) =>
      includesAll(files["src/domain/misinfo-policy.js"], ["Level 1", "Level 2", "Level 3", "Level 4", "judgeFalseAnswer"])
  },
  {
    id: "teacher-audit-json-contract",
    evidence: ["src/domain/misinfo-policy.js", "src/domain/llm-provider.js"],
    run: async (files) =>
      includesAll(files["src/domain/misinfo-policy.js"], ["correctAnswer", "falseClaim", "whyFalse", "studentVisibleFalseAnswer", "verificationPrompt", "debriefNote"]) &&
      includesAll(files["src/domain/llm-provider.js"], ["correct_answer", "false_answer", "false_basis", "level_fit_reason", "student_answer", "verificationPrompt", "debriefNote"])
  },
  {
    id: "preflight-and-regeneration",
    evidence: ["src/domain/llm-provider.js", "src/worker.js", "docs/experiment-policy.md", "test/worker-fail-closed.test.js"],
    run: async (files) =>
      includesAll(files["src/domain/llm-provider.js"], ["MAX_ATTEMPTS = 3", "FAIL_CLOSED_AFTER_RETRIES", "studentCorrectionLeak", "studentTruthLeak", "shouldSendToStudent: false"]) &&
      includesAll(files["src/worker.js"], ["FAIL_CLOSED_STUDENT_MESSAGE", "blockedForStudent", "studentAnswer", "teacherAudit"]) &&
      includesAll(files["docs/experiment-policy.md"], ["shouldSendToStudent=false", "학생 응답에는 교사용 `audit`", "교사용 telemetry"]) &&
      includesAll(files["test/worker-fail-closed.test.js"], ["FAIL_CLOSED_AFTER_RETRIES", "correctAnswer", "whyFalse", "blockedForStudent", "studentVisibleAnswer"])
  },
  {
    id: "fifty-turn-evaluation-set",
    evidence: ["src/domain/evaluation-set.js", "src/worker.js", "scripts/run-eval.js", "scripts/smoke-worker.js", "docs/evaluation-set.md"],
    run: async (files) =>
      EVALUATION_SET_50.length === 50 &&
      buildEvaluationSet(50).every((item) => item.audit.preflight.approvedForStudent) &&
      buildEvaluationSet(50).filter((item) => item.recentMessages?.length === 2 && /진짜|정확|출처|정말/.test(item.studentQuestion)).length >= 10 &&
      includesAll(files["src/domain/evaluation-set.js"], ["PUBLIC_EVALUATION_SET_50", "toPublicEvaluationTurn", "studentQuestion", "expectedLevel"]) &&
      includesAll(files["src/domain/misinfo-policy.js"], ["buildEvaluationContext", "방금 답 진짜야", "recentMessages"]) &&
      includesAll(files["scripts/run-eval.js"], ["recentMessages: item.recentMessages || []"]) &&
      includesAll(files["src/worker.js"], ['url.pathname === "/api/evaluation-set"', 'url.pathname === "/api/evaluation-set/full"', "isTeacherAuthorized"]) &&
      includesAll(files["scripts/smoke-worker.js"], ["evaluation-set-public/v1", "correctAnswer", "falseClaim", "whyFalse", "/api/evaluation-set/full"]) &&
      includesAll(files["docs/evaluation-set.md"], ["/api/evaluation-set/full", "correctAnswer", "falseClaim", "whyFalse", "정답 확인 압박"])
  },
  {
    id: "llm-as-judge-model-selection",
    evidence: ["src/domain/eval-judge.js", "scripts/run-eval.js"],
    run: async (files) =>
      includesAll(files["src/domain/eval-judge.js"], ["judgeEvaluationTurnWithProvider", "EVAL_JUDGE", "level_fit", "truth_leak", "subtlety_score"]) &&
      includesAll(files["scripts/run-eval.js"], ["summarizeJudgments", "EVAL_MODELS", "selectionCriteria", "recommendedModel", "failureExamples", "studentVisibleAnswer", "correctAnswer", "whyFalse"])
  },
  {
    id: "single-api-key-server-side",
    evidence: ["src/domain/llm-provider.js", "README.md", "docs/deployment-guide.md", "scripts/smoke-worker.js"],
    run: async (files) =>
      includesAll(files["src/domain/llm-provider.js"], ["OPENAI_API_KEY", "authorization", "OPENAI_TIMEOUT_MS", "AbortController", "timeoutMs"]) &&
      includesAll(files["README.md"], ["학생 브라우저에는 키가 노출되지 않습니다"]) &&
      includesAll(files["docs/deployment-guide.md"], ["wrangler secret put OPENAI_API_KEY", "OPENAI_TIMEOUT_MS", "여러 학생이 동시에 접속해도"]) &&
      includesAll(files["scripts/smoke-worker.js"], ["multiple students share one server-side provider without session collision", "student session secret prevents session id takeover", "multi-user", "OPENAI_API_KEY"])
  },
  {
    id: "cloudflare-worker-deployment",
    evidence: ["wrangler.toml", "src/worker.js", "src/domain/security.js", "docs/deployment-guide.md", "scripts/smoke-worker.js", "scripts/verify-deploy.js", "scripts/verify-classroom-config.js", "scripts/deploy-preflight.js", "scripts/print-release-commands.js", "scripts/print-classroom-urls.js", "scripts/print-shoot-checklist.js", "test/deploy-preflight.test.js", "test/classroom-config.test.js", "test/release-commands.test.js", "test/classroom-urls.test.js", "test/shoot-checklist.test.js", ".github/workflows/ci.yml", ".github/workflows/deploy.yml", "package.json", "package-lock.json"],
    run: async (files) =>
      includesAll(files["wrangler.toml"], ["durable_objects.bindings", "ClassroomRoom", "CHAT_RATE_LIMIT_PER_MINUTE", "EVENT_TTL_HOURS"]) &&
      includesAll(files["src/worker.js"], ["export class ClassroomRoom", "/api/health", "/api/config", "writeConfig", "teacher_config_updated", "recordEvent(event)", "buildHealthPayload", "openaiModel", "openaiTimeoutMs", "defaultRoomId", "SECURITY_HEADERS", "function text", "text/plain; charset=utf-8"]) &&
      includesAll(files["src/domain/security.js"], ["cache-control", "no-store", "x-content-type-options", "x-robots-tag", "noindex, nofollow", "referrer-policy", "content-security-policy", "frame-ancestors 'none'", "permissions-policy"]) &&
      includesAll(files["docs/deployment-guide.md"], ["npm run deploy", "Deploy", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "npm run verify:deploy", "Node.js 22", "npm ci", "EXPECTED_OPENAI_MODEL", "EXPECTED_OPENAI_TIMEOUT_MS", "OPENAI_TIMEOUT_MS", "REQUIRE_OPENAI=true", "REQUIRE_TEACHER_TOKEN=true", "Level/persona 설정 API", "unsafe_persona_instruction", "teacher_config_rejected", "production `Deploy` workflow에서는 필수", "x-teacher-token", "교사용 API는 URL query token을 허용하지 않는다", "Sec-WebSocket-Protocol", "WebSocket URL에는 token이 남지 않아야", "teacher websocket accepts subprotocol token without query token", "촬영방 분리", "npm run classroom:urls", "학생 URL에는 token이 없어야", "npm run shoot:checklist", "정정 수업 export 조건", "VERIFY_ROOM=deploy-verify", "실제 촬영방 금지", "Cloudflare response header evidence", "sanitized `/api/health` snapshot", "cache-control: no-store", "x-robots-tag: noindex, nofollow", "content-security-policy", "permissions-policy"]) &&
      includesAll(files["scripts/smoke-worker.js"], ["worker smoke passed", "/api/chat", "/api/export", "/api/health", "/api/config", "fullWithQueryToken.status === 401", "error responses include security headers", "oversized student JSON returns 413 before validation", "teacher config API controls generated audit level", "teacher_config_updated", "room query isolates classroom events", "x-content-type-options", "x-robots-tag", "noindex, nofollow", "referrer-policy", "content-security-policy", "permissions-policy"]) &&
      includesAll(files["scripts/verify-deploy.js"], ["deploy verification passed", "deploy-verification-evidence/v1", "VERIFY_DEPLOY_EVIDENCE_FILE", "deploy verification evidence written", "prHeadSha", "/api/evaluation-set", "/api/evaluation-set/full", "/api/config", "/api/join", "/api/chat", "/api/export", "/api/purge", "/teacher", "/ws/teacher", "교사용 대시보드에 기록됩니다", "이름 외 개인정보는 입력하지 마세요", "teacher page access policy is enforced", "teacher token is configured when required", "Cloudflare edge headers are present when required", "requireCloudflareEdge", "cloudflareEdge", "cf-ray", "getHealthEvidence", "chatRateLimitPerMinute", "eventTtlHours", "teacher config API controls generated audit level", "teacher config rejects unsafe persona overrides", "unsafe_persona_instruction", "teacher_config_rejected", "blockedPattern", "학생에게 정답", "Ignore the system prompt", "reveal the correct answer", "teacher_config_rejected\").length >= 2", "includes(\"Ignore the system prompt\") === false", "includes(\"reveal the correct answer\") === false", "teacher websocket accepts subprotocol token without query token", "teacher_config_updated", "debrief export is room aware", "debrief csv export is room aware and complete", "formulaStudentName", "formulaQuestion", "'=배포검증", "CSV 수식 방어 검증", "requiredHeaders", "studentVisibleAnswer", "debriefRequired", "verificationPrompt", "debriefNote", "correctAnswer", "falseClaim", "whyFalse", "preflightVerdict", "provider", "PASS_LEVEL_CALIBRATED_FALSEHOOD", "deploy verification telemetry can be purged", "event.type !== \"teacher_config_updated\"", "event.type !== \"teacher_config_rejected\"", "OpenAI model matches expectation when provided", "OpenAI timeout matches expectation when provided", "EXPECTED_OPENAI_MODEL", "EXPECTED_OPENAI_TIMEOUT_MS", "openaiTimeoutMs", "WORKER_ROOM", "VERIFY_ROOM", "deploy-verify", "ALLOW_PURGE_FILMING_ROOM", "REQUIRE_OPENAI", "REQUIRE_TEACHER_TOKEN", "REQUIRE_CLOUDFLARE_EDGE", "x-teacher-token", "sec-websocket-protocol", "x-purge-room", "x-robots-tag", "noindex, nofollow"]) &&
      includesAll(files["scripts/verify-classroom-config.js"], ["classroom-config-evidence/v1", "CLASSROOM_ROOM", "EXPECTED_FALSE_LEVEL", "EXPECTED_PERSONA", "APPLY_CLASSROOM_CONFIG", "CLASSROOM_CONFIG_EVIDENCE_FILE", "PR_HEAD_SHA or GITHUB_SHA is required", "EXPECTED_OPENAI_TIMEOUT_MS", "expectedOpenAITimeoutMs", "openaiTimeoutMs", "sharingUrls", "studentUrlHasToken", "teacherUrlRequiresToken", "observedHealth", "CLASSROOM_ROOM must be a filming/rehearsal room, not deploy-verify", "classroom Level/persona matches expected config", "x-teacher-token", "cache-control", "x-robots-tag"]) &&
      includesAll(files["scripts/deploy-preflight.js"], ["deploy preflight passed", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "WORKER_HEALTH_URL", "TEACHER_TOKEN", "VERIFY_ROOM", "EXPECTED_OPENAI_TIMEOUT_MS", "wrangler.toml", "deploy-verify"]) &&
      includesAll(files["scripts/print-release-commands.js"], ["CLASSROOM_PLANS", "PR_HEAD_SHA or GITHUB_SHA is required", "npm run verify:deploy", "npm run rehearsal:config", "npm run review:evidence", "npm run release:audit", "EXPECTED_OPENAI_TIMEOUT_MS", "VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json", "CLASSROOM_CONFIG_EVIDENCE_FILES", "EXPECTED_CLASSROOM_ROOMS", "deploy-verify", "roomId must be a filming room"]) &&
      includesAll(files["scripts/print-classroom-urls.js"], ["CLASSROOM_ROOMS", "studentUrl", "teacherUrl", "TEACHER_TOKEN", "must not include default-classroom or deploy-verify"]) &&
      includesAll(files["scripts/print-shoot-checklist.js"], ["shoot checklist", "Stop Conditions", "npm run classroom:urls", "npm run review:packet", "npm run release:commands", "export /api/debrief.csv", "Do not share teacherUrl or TEACHER_TOKEN with students"]) &&
      includesAll(files["test/deploy-preflight.test.js"], ["production deployment requirements", "production secrets are missing", "rejects filming rooms"]) &&
      includesAll(files["test/classroom-config.test.js"], ["rehearsal:config verifies classroom room config", "classroom-config-evidence/v1", "APPLY_CLASSROOM_CONFIG", "deploy-verify"]) &&
      includesAll(files["test/release-commands.test.js"], ["release:commands prints commit-bound", "CLASSROOM_PLANS", "deploy-verify classroom room"]) &&
      includesAll(files["test/classroom-urls.test.js"], ["student URLs without token", "secret-token", "token=bad", "deploy verification rooms"]) &&
      includesAll(files["test/shoot-checklist.test.js"], ["shoot:checklist prints ordered shoot gates", "secret-token", "token=bad", "deploy-verify"]) &&
      includesAll(files[".github/workflows/ci.yml"], ["node-version: \"22\"", "cache: \"npm\"", "npm ci", "node scripts/readiness-audit.js"]) &&
      includesAll(files[".github/workflows/deploy.yml"], ["workflow_dispatch", "node-version: \"22\"", "cache: \"npm\"", "npm ci", "Require production deploy verification URL", "WORKER_HEALTH_URL is required for production deploy verification", "inputs.environment == 'production'", "node scripts/deploy-preflight.js", "npx wrangler deploy", "scripts/verify-deploy.js", "WORKER_HEALTH_URL", "VERIFY_ROOM", "deploy-verify", "REQUIRE_OPENAI", "REQUIRE_TEACHER_TOKEN", "EXPECTED_OPENAI_MODEL", "EXPECTED_OPENAI_TIMEOUT_MS", "PR_HEAD_SHA", "VERIFY_DEPLOY_EVIDENCE_FILE", "actions/upload-artifact@v4", "deploy-verification-evidence", "gpt-5.5", "15000", "true"]) &&
      includesAll(files["package.json"], ["\"node\": \">=22.0.0\"", "shoot:checklist", "preflight:deploy", "classroom:urls", "verify:deploy", "rehearsal:config", "release:commands"]) &&
      includesAll(files["package-lock.json"], ["lockfileVersion", "\"node\": \">=22.0.0\"", "wrangler"])
  },
  {
    id: "teacher-access-and-abuse-controls",
    evidence: ["src/domain/security.js", "src/worker.js", "src/ui/teacher.js", "docs/production-runbook.md"],
    run: async (files) =>
      includesAll(files["src/domain/security.js"], ["isTeacherAuthorized", "rateLimitDecision", "encodeTeacherWebSocketProtocol", "decodeTeacherWebSocketProtocol", "url.pathname === \"/teacher\"", "sec-websocket-protocol"]) &&
      includesAll(files["src/worker.js"], ["isTeacherAuthorized", "/api/config", "/api/purge", "rate-limit", "validatePurgeConfirmation", "x-purge-room", "purge_room_confirmation_required", "selectWebSocketProtocol", "sec-websocket-protocol", "sanitizeTeacherConfig", "unsafe_persona_instruction", "teacher_config_rejected", "recordTeacherConfigRejection", "buildTeacherConfigRejectedEvent", "ignore", "reveal", "correct"]) &&
      includesAll(files["src/ui/teacher.js"], ["x-teacher-token", "x-purge-room", "삭제할 room 이름을 정확히 입력하세요", "촬영 로그 삭제", "encodeTeacherWebSocketProtocol(teacherToken)", "new WebSocket", "protocols"]) &&
      !files["src/ui/teacher.js"].includes('query.set("token", teacherToken)') &&
      includesAll(files["docs/production-runbook.md"], ["삭제할 room 이름을 정확히 다시 입력", "API query token은 401"])
  },
  {
    id: "debrief-export-after-experiment",
    evidence: ["src/domain/session-export.js", "src/ui/teacher.js", "docs/experiment-policy.md", "docs/production-runbook.md"],
    run: async (files) =>
      includesAll(files["src/domain/session-export.js"], ["buildDebriefRows", "buildDebriefCsv", "correctAnswer", "whyFalse", "roomId", "latencyMs", "blockedForStudent", "debriefRequired", "debriefRequiredTurns", "blockedTurns", "averageLatencyMs", "lastChatAt", "lastLevel", "verificationPrompt", "debriefNote", "formulaSafe", "redactSensitiveFields", "isSensitiveExportKey", "sessionsecret", "openaiapikey", "xteachertoken"]) &&
      includesAll(files["src/ui/teacher.js"], ["/api/debrief", "/api/debrief.csv", "정정 수업 오류표", "exportFilename"]) &&
      includesAll(files["docs/experiment-policy.md"], ["정정 수업", "debriefRequired=true", "blockedForStudent=true"]) &&
      includesAll(files["docs/production-runbook.md"], ["formula injection"])
  },
  {
    id: "gap-closing-documented",
    evidence: ["docs/implementation-plan.md"],
    run: async (files) =>
      includesAll(files["docs/implementation-plan.md"], ["Gap Closing", "중학생은 멍청이가 아니다", "정답과 거짓이 섞여", "정정"])
  },
  {
    id: "production-runbook-documented",
    evidence: ["docs/production-runbook.md", "README.md", "docs/deployment-guide.md", "docs/shoot-day-command-sheet.md", "test/shoot-day-command-sheet.test.js"],
    run: async (files) =>
      includesAll(files["docs/production-runbook.md"], ["촬영 전날", "리허설", "촬영 중", "촬영 직후", "데이터 삭제", "Node.js 22", "npm ci", "CLOUDFLARE_ACCOUNT_ID", "openaiModel", "openaiTimeoutMs", "EXPECTED_OPENAI_MODEL", "EXPECTED_OPENAI_TIMEOUT_MS", "/api/config", "teacher_config_updated", "unsafe_persona_instruction", "/api/health", "x-robots-tag: noindex, nofollow", "/api/debrief.csv", "npm run classroom:urls", "학생에게 공유하는 `studentUrl`에는 `token`", "npm run rehearsal:config", "CLASSROOM_ROOM", "EXPECTED_FALSE_LEVEL", "EXPECTED_PERSONA", "APPLY_CLASSROOM_CONFIG", "classroom-config-evidence/v1", "npm run release:commands", "npm run shoot:checklist", "stop condition", "CLASSROOM_PLANS"]) &&
      includesAll(files["README.md"], ["촬영 운영 런북"]) &&
      includesAll(files["docs/deployment-guide.md"], ["production-runbook.md"]) &&
      includesAll(files["docs/shoot-day-command-sheet.md"], ["<latest-pr-head-sha>", "gh pr view 1 --json headRefOid", "npm test", "npm run eval", "npm run readiness", "npm run smoke", "npm run classroom:urls", "npm run review:packet", "VERIFY_ROOM=deploy-verify", "EXPECTED_OPENAI_TIMEOUT_MS=15000", "VERIFY_DEPLOY_EVIDENCE_FILE=artifacts/deploy-evidence.json", "EXTERNAL_REVIEW_TRANSCRIPT_FILE=artifacts/external-review-transcript.md", "CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts/2026-07-13-3-5-config.json", "CLASSROOM_CONFIG_EVIDENCE_FILE=artifacts/2026-07-16-3-1-config.json", "CLASSROOM_CONFIG_EVIDENCE_FILES=artifacts/2026-07-13-3-5-config.json,artifacts/2026-07-16-3-1-config.json", "EXPECTED_CLASSROOM_ROOMS=2026-07-13-3-5,2026-07-16-3-1", "npm run release:audit", "stop condition", "정정 수업 오류표"]) &&
      includesAll(files["test/shoot-day-command-sheet.test.js"], ["does not leak secrets", "keeps release evidence tied to the latest PR head", "preserves classroom evidence paths"])
  },
  {
    id: "design-reference-documented",
    evidence: ["docs/design.md", "README.md", "docs/implementation-plan.md"],
    run: async (files) =>
      includesAll(files["docs/design.md"], ["vercel/chatbot", "mckaywrigley/chatbot-ui", "ChatGPTNextWeb/NextChat", "10k+ stars", "학생 no-login", "교사용 감사 JSON", "촬영방 `room`과 배포 검증용 `deploy-verify` room은 분리"]) &&
      includesAll(files["README.md"], ["촬영용 채팅 UI 설계 근거"]) &&
      includesAll(files["docs/implementation-plan.md"], ["Design decision record", "docs/design.md"])
  },
  {
    id: "launch-audit-documented",
    evidence: ["docs/launch-audit.md", "docs/external-review-packet.md", "README.md", "docs/implementation-plan.md", "docs/deployment-guide.md", "scripts/release-audit.js", "scripts/write-external-review-evidence.js", "scripts/print-external-review-packet.js", "test/external-review-evidence.test.js", "test/external-review-packet.test.js", "package.json", ".github/pull_request_template.md"],
    run: async (files) =>
      includesAll(files["docs/launch-audit.md"], ["학생은 로그인 없이 URL과 이름만으로 입장", "교사는 학생 카드별 online/offline과 채팅 진행 상태를 실시간 관찰", "교사 Level/persona 설정이 실제 학생 답변 생성과 export 타임라인에 반영", "persona가 정답 공개", "unsafe_persona_instruction", "teacher_config_rejected", "production 배포는 교사용 token 보호를 강제", "CI와 Deploy가 같은 고정 의존성 그래프를 사용", "production 배포는 실제 Worker URL 검증을 생략하지 않음", "배포 전 환경 누락을 사전에 차단", "npm run preflight:deploy", "촬영 기대 모델이 아닌 다른 OpenAI 모델로 배포", "OpenAI 요청 지연", "openaiTimeoutMs", "Cloudflare 계정이 여러 개", "CLOUDFLARE_ACCOUNT_ID", "민감 응답이 브라우저/프록시에 캐시되지 않고", "x-robots-tag: noindex, nofollow", "학생 화면에는 Level에 맞춘 거짓 답변만 표시", "preflight 실패 audit가 학생 응답으로 누출되지 않음", "공개 평가 endpoint가 정답·거짓 근거를 누출하지 않음", "진실과 거짓이 섞이고 너무 쉬운 거짓으로만 흐르지 않음", "배포 검증이 실제 촬영방 로그를 삭제하지 않음", "각 촬영방", "GitHub Deploy workflow", "GPT-5.5 xhigh 또는 동등한 외부 코드 리뷰 승인", "external-review-packet.md", "REQUIRE_OPENAI=true", "REQUIRE_TEACHER_TOKEN=true", "REQUIRE_CLASSROOM_CONFIG=true", "REQUIRE_CLOUDFLARE_EDGE=true", "Cloudflare response header evidence", "sanitized `/api/health` snapshot", "CLASSROOM_CONFIG_EVIDENCE_FILES", "EXPECTED_CLASSROOM_ROOMS", "증거 `roomId` 집합 일치", "VERIFY_ROOM=deploy-verify", "x-purge-room", "npm run release:audit", "EXTERNAL_REVIEW_DECISION=APPROVE", "VERIFY_DEPLOY_STATUS=pass", "PR_HEAD_SHA"]) &&
      includesAll(files["docs/external-review-packet.md"], ["GPT-5.5 xhigh", "중학생은 멍청이가 아니므로", "학생 화면에는 Level에 맞춘 거짓 답변만", "교사 화면과 export에는 정답, 거짓, 왜 거짓인지", "반드시 반려할 조건", "correctAnswer", "VERIFY_ROOM", "EXPECTED_OPENAI_TIMEOUT_MS", "unsafe_persona_instruction", "teacher_config_rejected", "x-robots-tag: noindex, nofollow", "Review decision: APPROVE | REQUEST_CHANGES", "rehearsal:config against each filming room", "classroom-config-evidence/v1", "CLASSROOM_CONFIG_STATUS=pass", "external-review-evidence/v1", "EXTERNAL_REVIEW_TRANSCRIPT_FILE", "source", "npm run review:evidence", "npm run review:packet", "blocking finding", "npm run preflight:deploy", "npm run verify:deploy", "npm run release:audit"]) &&
      includesAll(files["README.md"], ["프로덕션 런치 감사 매트릭스", "GPT-5.5 xhigh 외부 리뷰 패킷", "unsafe_persona_instruction", "x-robots-tag: noindex, nofollow", "npm run review:evidence", "npm run review:packet", "CLASSROOM_CONFIG_STATUS=pass", "external-review-evidence/v1", "Cloudflare response header evidence", "sanitized `/api/health` snapshot", "CLASSROOM_CONFIG_EVIDENCE_FILES", "EXPECTED_CLASSROOM_ROOMS", "증거 파일의 `roomId` 집합", "npm run release:audit"]) &&
      includesAll(files["docs/deployment-guide.md"], ["npm run review:evidence", "npm run review:packet", "npm run release:audit", "EXTERNAL_REVIEW_DECISION=APPROVE", "EXTERNAL_REVIEW_TRANSCRIPT_FILE", "source.transcriptSha256", "VERIFY_DEPLOY_STATUS=pass", "CLASSROOM_CONFIG_STATUS=pass", "EXPECTED_PR_HEAD_SHA", "EXTERNAL_REVIEW_FILE", "external-review-evidence/v1", "evidenceChecked", "blockingFindings", "VERIFY_DEPLOY_EVIDENCE_FILE", "Cloudflare response header evidence", "sanitized `/api/health` snapshot", "CLASSROOM_CONFIG_EVIDENCE_FILES", "EXPECTED_CLASSROOM_ROOMS", "증거 파일의 `roomId` 집합", "deploy-verification-evidence/v1", "classroom-config-evidence/v1"]) &&
      includesAll(files["scripts/release-audit.js"], ["EXTERNAL_REVIEW_DECISION=APPROVE", "VERIFY_DEPLOY_STATUS=pass", "EXPECTED_PR_HEAD_SHA", "EXTERNAL_REVIEW_FILE", "external-review-evidence/v1", "evidenceChecked", "blockingFindings", "isValidExternalReviewSource", "transcriptSha256", "VERIFY_DEPLOY_EVIDENCE_FILE", "CLASSROOM_CONFIG_EVIDENCE_FILES", "EXPECTED_CLASSROOM_ROOMS", "deploy-verification-evidence/v1", "classroom-config-evidence/v1", "CLASSROOM_CONFIG_EVIDENCE_FILE ${file}", "prHeadSha must match PR_HEAD_SHA", "roomId must be a filming/rehearsal room", "observedConfig must match expected Level/persona", "hasValidClassroomHealthEvidence", "hasValidClassroomSharingUrls", "studentUrlHasToken", "teacherUrlRequiresToken", "observedHealth.openaiModel must match expectedOpenAIModel", "observedHealth.openaiTimeoutMs must match expectedOpenAITimeoutMs", "VERIFY_DEPLOY_EVIDENCE_FILE must record expectedOpenAIModel", "VERIFY_DEPLOY_EVIDENCE_FILE must record expectedOpenAITimeoutMs", "health.openaiModel must match expectedOpenAIModel", "health.openaiTimeoutMs must match expectedOpenAITimeoutMs", "roomId must be unique across CLASSROOM_CONFIG_EVIDENCE_FILES", "missing expected filming room", "contains unexpected filming room", "EXPECTED_CLASSROOM_ROOMS contains non-filming room", "REQUIRE_CLASSROOM_CONFIG=true", "REQUIRE_CLOUDFLARE_EDGE=true", "EXTERNAL_REVIEW_FILE prHeadSha must match PR_HEAD_SHA", "VERIFY_DEPLOY_EVIDENCE_FILE prHeadSha must match PR_HEAD_SHA", "VERIFY_DEPLOY_EVIDENCE_FILE must record requireOpenAI=true", "VERIFY_DEPLOY_EVIDENCE_FILE must record requireTeacherToken=true", "VERIFY_DEPLOY_EVIDENCE_FILE must record requireCloudflareEdge=true", "Cloudflare response header evidence", "sanitized /api/health evidence snapshot", "REQUIRE_OPENAI=true", "REQUIRE_TEACHER_TOKEN=true", "release audit failed"]) &&
      includesAll(files["scripts/write-external-review-evidence.js"], ["external-review-evidence/v1", "EXTERNAL_REVIEW_DECISION", "EXTERNAL_REVIEWER", "EXTERNAL_REVIEW_SOURCE_URL", "EXTERNAL_REVIEW_TRANSCRIPT_FILE", "transcriptSha256", "PR_HEAD_SHA", "CI_STATUS", "TESTS_STATUS", "EVAL_STATUS", "READINESS_STATUS", "SMOKE_STATUS", "CLASSROOM_CONFIG_STATUS", "APPROVE evidence cannot include BLOCKING_FINDINGS", "external review evidence written"]) &&
      includesAll(files["scripts/print-external-review-packet.js"], ["PR_URL", "Latest PR head SHA", "GPT-5.5 xhigh", "학생 화면에는 Level에 맞춘 거짓 답변만", "release:commands", "TEACHER_TOKEN 원문", "Review decision: APPROVE | REQUEST_CHANGES", "EXTERNAL_REVIEW_DECISION=APPROVE", "EXTERNAL_REVIEW_TRANSCRIPT_FILE", "npm run review:evidence"]) &&
      includesAll(files["test/external-review-evidence.test.js"], ["review:evidence writes structured approval evidence", "CLASSROOM_CONFIG_STATUS", "classroomConfigStatus", "review:evidence rejects approval with blocking findings", "review:evidence fails closed"]) &&
      includesAll(files["test/external-review-packet.test.js"], ["review:packet prints current PR target", "PR_HEAD_SHA=abc123", "npm run review:evidence"]) &&
      includesAll(files["package.json"], ["review:evidence", "review:packet", "release:audit"]) &&
      includesAll(files[".github/pull_request_template.md"], ["Main Goal", "Required Evidence", "Release Gates", "Safety Review", "GPT-5.5 xhigh", "npm run verify:deploy", "npm run rehearsal:config", "classroom-config-evidence/v1", "REQUIRE_OPENAI=true", "REQUIRE_TEACHER_TOKEN=true", "REQUIRE_CLASSROOM_CONFIG=true", "REQUIRE_CLOUDFLARE_EDGE=true", "CLASSROOM_CONFIG_EVIDENCE_FILES", "EXPECTED_CLASSROOM_ROOMS", "evidence `roomId` set", "CLASSROOM_ROOM", "npm run release:audit", "Do not merge", "correctAnswer", "whyFalse", "VERIFY_ROOM", "Debrief JSON/CSV"]) &&
      includesAll(files["docs/implementation-plan.md"], ["Launch audit", "docs/launch-audit.md", "Review packet", "docs/external-review-packet.md"])
  }
];

const files = await readEvidenceFiles(checks);
const results = [];
for (const check of checks) {
  const missing = check.evidence.filter((file) => !existsSync(file));
  const passed = missing.length === 0 && await check.run(files);
  results.push({
    id: check.id,
    passed,
    evidence: check.evidence,
    missing
  });
}

const failed = results.filter((result) => !result.passed);
for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id}`);
  if (result.missing.length) console.log(`  missing: ${result.missing.join(", ")}`);
}

if (failed.length) {
  console.error(`readiness audit failed: ${failed.length}/${results.length}`);
  process.exitCode = 1;
} else {
  console.log(`readiness audit passed: ${results.length}/${results.length}`);
}

async function readEvidenceFiles(items) {
  const unique = [...new Set(items.flatMap((item) => item.evidence))];
  const entries = await Promise.all(unique.map(async (file) => {
    if (!existsSync(file)) return [file, ""];
    return [file, await readFile(file, "utf8")];
  }));
  return Object.fromEntries(entries);
}

function includesAll(value, needles) {
  return needles.every((needle) => value.includes(needle));
}
