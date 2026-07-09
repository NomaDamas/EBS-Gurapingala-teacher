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
      includesAll(files["src/ui/teacher.js"], ["/ws/teacher", "학생 카드", "teacher_config", "snapshot", "실시간 연결 재시도", "reconnectAttempts", "roomId", "withRoom", "applyTeacherConfig", "teacher_config_updated", "학생 URL 복사", "교사용 URL 복사", "history.replaceState", "latencyMs"]) &&
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
    evidence: ["src/domain/llm-provider.js"],
    run: async (files) =>
      includesAll(files["src/domain/llm-provider.js"], ["MAX_ATTEMPTS = 3", "FAIL_CLOSED_AFTER_RETRIES", "studentCorrectionLeak"])
  },
  {
    id: "fifty-turn-evaluation-set",
    evidence: ["src/domain/evaluation-set.js", "scripts/run-eval.js"],
    run: async () => EVALUATION_SET_50.length === 50 && buildEvaluationSet(50).every((item) => item.audit.preflight.approvedForStudent)
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
    evidence: ["wrangler.toml", "src/worker.js", "docs/deployment-guide.md", "scripts/smoke-worker.js", "scripts/verify-deploy.js", ".github/workflows/deploy.yml", "package.json"],
    run: async (files) =>
      includesAll(files["wrangler.toml"], ["durable_objects.bindings", "ClassroomRoom", "CHAT_RATE_LIMIT_PER_MINUTE", "EVENT_TTL_HOURS"]) &&
      includesAll(files["src/worker.js"], ["export class ClassroomRoom", "/api/health", "buildHealthPayload", "defaultRoomId"]) &&
      includesAll(files["docs/deployment-guide.md"], ["npm run deploy", "Deploy", "CLOUDFLARE_API_TOKEN", "npm run verify:deploy", "촬영방 분리"]) &&
      includesAll(files["scripts/smoke-worker.js"], ["worker smoke passed", "/api/chat", "/api/export", "/api/health", "room query isolates classroom events"]) &&
      includesAll(files["scripts/verify-deploy.js"], ["deploy verification passed", "/api/evaluation-set", "/teacher", "teacher page access policy is enforced", "WORKER_ROOM"]) &&
      includesAll(files[".github/workflows/deploy.yml"], ["workflow_dispatch", "npx wrangler deploy", "scripts/verify-deploy.js", "WORKER_HEALTH_URL"]) &&
      includesAll(files["package.json"], ["verify:deploy"])
  },
  {
    id: "teacher-access-and-abuse-controls",
    evidence: ["src/domain/security.js", "src/worker.js", "src/ui/teacher.js"],
    run: async (files) =>
      includesAll(files["src/domain/security.js"], ["isTeacherAuthorized", "rateLimitDecision"]) &&
      includesAll(files["src/worker.js"], ["isTeacherAuthorized", "/api/purge", "rate-limit"]) &&
      includesAll(files["src/ui/teacher.js"], ["x-teacher-token", "촬영 로그 삭제"])
  },
  {
    id: "debrief-export-after-experiment",
    evidence: ["src/domain/session-export.js", "src/ui/teacher.js", "docs/experiment-policy.md"],
    run: async (files) =>
      includesAll(files["src/domain/session-export.js"], ["buildDebriefRows", "buildDebriefCsv", "correctAnswer", "whyFalse", "roomId", "latencyMs", "verificationPrompt", "debriefNote"]) &&
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
      includesAll(files["docs/production-runbook.md"], ["촬영 전날", "리허설", "촬영 중", "촬영 직후", "데이터 삭제", "/api/health", "/api/debrief.csv"]) &&
      includesAll(files["README.md"], ["촬영 운영 런북"]) &&
      includesAll(files["docs/deployment-guide.md"], ["production-runbook.md"])
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
