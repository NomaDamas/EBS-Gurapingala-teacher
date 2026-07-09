import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { EVALUATION_SET_50 } from "../src/domain/evaluation-set.js";
import { buildEvaluationSet } from "../src/domain/misinfo-policy.js";

const checks = [
  {
    id: "student-entry-no-login",
    evidence: ["src/ui/student.js", "src/worker.js"],
    run: async (files) =>
      includesAll(files["src/ui/student.js"], ["이름을 입력하세요", "/api/join", "/api/chat", "roomId", "withRoom"]) &&
      includesAll(files["src/worker.js"], ['url.pathname === "/"', 'url.pathname === "/api/join"', "normalizeRoomId"])
  },
  {
    id: "teacher-realtime-dashboard",
    evidence: ["src/ui/teacher.js", "src/worker.js"],
    run: async (files) =>
      includesAll(files["src/ui/teacher.js"], ["/ws/teacher", "학생 카드", "teacher_config", "snapshot", "실시간 연결 재시도", "reconnectAttempts", "roomId", "withRoom", "applyTeacherConfig", "teacher_config_updated", "학생 URL 복사", "교사용 URL 복사", "history.replaceState", "latencyMs", "설정 적용 상태", "configStatus", "classSummary", "채팅턴"]) &&
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
    evidence: ["src/domain/llm-provider.js", "src/worker.js", "docs/experiment-policy.md"],
    run: async (files) =>
      includesAll(files["src/domain/llm-provider.js"], ["MAX_ATTEMPTS = 3", "FAIL_CLOSED_AFTER_RETRIES", "studentCorrectionLeak"]) &&
      includesAll(files["src/worker.js"], ["FAIL_CLOSED_STUDENT_MESSAGE", "blockedForStudent", "studentAnswer", "teacherAudit"]) &&
      includesAll(files["docs/experiment-policy.md"], ["shouldSendToStudent=false", "학생 응답에는 교사용 `audit`", "교사용 telemetry"])
  },
  {
    id: "fifty-turn-evaluation-set",
    evidence: ["src/domain/evaluation-set.js", "src/worker.js", "scripts/run-eval.js", "scripts/smoke-worker.js", "docs/evaluation-set.md"],
    run: async (files) =>
      EVALUATION_SET_50.length === 50 &&
      buildEvaluationSet(50).every((item) => item.audit.preflight.approvedForStudent) &&
      includesAll(files["src/domain/evaluation-set.js"], ["PUBLIC_EVALUATION_SET_50", "toPublicEvaluationTurn", "studentQuestion", "expectedLevel"]) &&
      includesAll(files["src/worker.js"], ['url.pathname === "/api/evaluation-set"', 'url.pathname === "/api/evaluation-set/full"', "isTeacherAuthorized"]) &&
      includesAll(files["scripts/smoke-worker.js"], ["evaluation-set-public/v1", "correctAnswer", "falseClaim", "whyFalse", "/api/evaluation-set/full"]) &&
      includesAll(files["docs/evaluation-set.md"], ["/api/evaluation-set/full", "correctAnswer", "falseClaim", "whyFalse"])
  },
  {
    id: "llm-as-judge-model-selection",
    evidence: ["src/domain/eval-judge.js", "scripts/run-eval.js"],
    run: async (files) =>
      includesAll(files["src/domain/eval-judge.js"], ["judgeEvaluationTurnWithProvider", "EVAL_JUDGE", "level_fit", "truth_leak", "subtlety_score"]) &&
      includesAll(files["scripts/run-eval.js"], ["summarizeJudgments", "EVAL_MODELS"])
  },
  {
    id: "single-api-key-server-side",
    evidence: ["src/domain/llm-provider.js", "README.md", "docs/deployment-guide.md"],
    run: async (files) =>
      includesAll(files["src/domain/llm-provider.js"], ["OPENAI_API_KEY", "authorization"]) &&
      includesAll(files["README.md"], ["학생 브라우저에는 키가 노출되지 않습니다"]) &&
      includesAll(files["docs/deployment-guide.md"], ["wrangler secret put OPENAI_API_KEY"])
  },
  {
    id: "cloudflare-worker-deployment",
    evidence: ["wrangler.toml", "src/worker.js", "docs/deployment-guide.md", "scripts/smoke-worker.js", "scripts/verify-deploy.js", ".github/workflows/ci.yml", ".github/workflows/deploy.yml", "package.json", "package-lock.json"],
    run: async (files) =>
      includesAll(files["wrangler.toml"], ["durable_objects.bindings", "ClassroomRoom", "CHAT_RATE_LIMIT_PER_MINUTE", "EVENT_TTL_HOURS"]) &&
      includesAll(files["src/worker.js"], ["export class ClassroomRoom", "/api/health", "buildHealthPayload", "defaultRoomId", "SECURITY_HEADERS", "cache-control", "no-store", "x-content-type-options", "referrer-policy"]) &&
      includesAll(files["docs/deployment-guide.md"], ["npm run deploy", "Deploy", "CLOUDFLARE_API_TOKEN", "npm run verify:deploy", "Node.js 22", "npm ci", "REQUIRE_OPENAI=true", "REQUIRE_TEACHER_TOKEN=true", "production `Deploy` workflow에서는 필수", "x-teacher-token", "촬영방 분리", "VERIFY_ROOM=deploy-verify", "실제 촬영방 금지", "cache-control: no-store"]) &&
      includesAll(files["scripts/smoke-worker.js"], ["worker smoke passed", "/api/chat", "/api/export", "/api/health", "room query isolates classroom events", "x-content-type-options", "referrer-policy"]) &&
      includesAll(files["scripts/verify-deploy.js"], ["deploy verification passed", "/api/evaluation-set", "/api/evaluation-set/full", "/api/join", "/api/chat", "/api/export", "/api/purge", "/teacher", "teacher page access policy is enforced", "teacher token is configured when required", "WORKER_ROOM", "VERIFY_ROOM", "deploy-verify", "ALLOW_PURGE_FILMING_ROOM", "REQUIRE_OPENAI", "REQUIRE_TEACHER_TOKEN", "x-teacher-token", "x-purge-room"]) &&
      includesAll(files[".github/workflows/ci.yml"], ["node-version: \"22\"", "cache: \"npm\"", "npm ci", "node scripts/readiness-audit.js"]) &&
      includesAll(files[".github/workflows/deploy.yml"], ["workflow_dispatch", "node-version: \"22\"", "cache: \"npm\"", "npm ci", "Require production deploy verification URL", "WORKER_HEALTH_URL is required for production deploy verification", "inputs.environment == 'production'", "npx wrangler deploy", "scripts/verify-deploy.js", "WORKER_HEALTH_URL", "VERIFY_ROOM", "deploy-verify", "REQUIRE_OPENAI", "REQUIRE_TEACHER_TOKEN", "true"]) &&
      includesAll(files["package.json"], ["\"node\": \">=22.0.0\"", "verify:deploy"]) &&
      includesAll(files["package-lock.json"], ["lockfileVersion", "\"node\": \">=22.0.0\"", "wrangler"])
  },
  {
    id: "teacher-access-and-abuse-controls",
    evidence: ["src/domain/security.js", "src/worker.js", "src/ui/teacher.js", "docs/production-runbook.md"],
    run: async (files) =>
      includesAll(files["src/domain/security.js"], ["isTeacherAuthorized", "rateLimitDecision"]) &&
      includesAll(files["src/worker.js"], ["isTeacherAuthorized", "/api/purge", "rate-limit", "validatePurgeConfirmation", "x-purge-room", "purge_room_confirmation_required"]) &&
      includesAll(files["src/ui/teacher.js"], ["x-teacher-token", "x-purge-room", "삭제할 room 이름을 정확히 입력하세요", "촬영 로그 삭제"]) &&
      includesAll(files["docs/production-runbook.md"], ["삭제할 room 이름을 정확히 다시 입력"])
  },
  {
    id: "debrief-export-after-experiment",
    evidence: ["src/domain/session-export.js", "src/ui/teacher.js", "docs/experiment-policy.md"],
    run: async (files) =>
      includesAll(files["src/domain/session-export.js"], ["buildDebriefRows", "buildDebriefCsv", "correctAnswer", "whyFalse", "roomId", "latencyMs", "averageLatencyMs", "lastChatAt", "lastLevel", "verificationPrompt", "debriefNote"]) &&
      includesAll(files["src/ui/teacher.js"], ["/api/debrief", "/api/debrief.csv", "정정 수업 오류표", "exportFilename"]) &&
      includesAll(files["docs/experiment-policy.md"], ["정정 수업"])
  },
  {
    id: "gap-closing-documented",
    evidence: ["docs/implementation-plan.md"],
    run: async (files) =>
      includesAll(files["docs/implementation-plan.md"], ["Gap Closing", "중학생은 멍청이가 아니다", "정답과 거짓이 섞여", "정정"])
  },
  {
    id: "production-runbook-documented",
    evidence: ["docs/production-runbook.md", "README.md", "docs/deployment-guide.md"],
    run: async (files) =>
      includesAll(files["docs/production-runbook.md"], ["촬영 전날", "리허설", "촬영 중", "촬영 직후", "데이터 삭제", "Node.js 22", "npm ci", "/api/health", "/api/debrief.csv"]) &&
      includesAll(files["README.md"], ["촬영 운영 런북"]) &&
      includesAll(files["docs/deployment-guide.md"], ["production-runbook.md"])
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
    evidence: ["docs/launch-audit.md", "README.md", "docs/implementation-plan.md"],
    run: async (files) =>
      includesAll(files["docs/launch-audit.md"], ["학생은 로그인 없이 URL과 이름만으로 입장", "교사는 학생 카드별 online/offline과 채팅 진행 상태를 실시간 관찰", "production 배포는 교사용 token 보호를 강제", "CI와 Deploy가 같은 고정 의존성 그래프를 사용", "production 배포는 실제 Worker URL 검증을 생략하지 않음", "민감 응답이 브라우저/프록시에 캐시되지 않음", "학생 화면에는 Level에 맞춘 거짓 답변만 표시", "preflight 실패 audit가 학생 응답으로 누출되지 않음", "공개 평가 endpoint가 정답·거짓 근거를 누출하지 않음", "진실과 거짓이 섞이고 너무 쉬운 거짓으로만 흐르지 않음", "배포 검증이 실제 촬영방 로그를 삭제하지 않음", "GitHub Deploy workflow", "GPT-5.5 xhigh 또는 동등한 외부 코드 리뷰 승인", "REQUIRE_OPENAI=true", "REQUIRE_TEACHER_TOKEN=true", "VERIFY_ROOM=deploy-verify", "x-purge-room"]) &&
      includesAll(files["README.md"], ["프로덕션 런치 감사 매트릭스"]) &&
      includesAll(files["docs/implementation-plan.md"], ["Launch audit", "docs/launch-audit.md"])
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
