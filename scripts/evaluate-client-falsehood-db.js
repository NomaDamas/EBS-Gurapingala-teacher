import { writeFile } from "node:fs/promises";
import {
  CLIENT_FALSEHOOD_EVALUATION_SET,
  CLIENT_FALSEHOOD_QUESTION_COUNT
} from "../src/domain/client-falsehood-evaluation-set.js";

const workerUrl = String(process.env.WORKER_URL || "").replace(/\/$/, "");
const teacherToken = String(process.env.TEACHER_TOKEN || "");
const room = String(process.env.EVAL_ROOM || "client-falsehood-db-eval-20260712");
const output = String(process.env.EVAL_OUTPUT || "artifacts/client-falsehood-db-evaluation.json");
const concurrency = clamp(Number(process.env.EVAL_CONCURRENCY || 6), 1, 12);
const analyzeOnly = process.env.EVAL_ANALYZE_ONLY === "true";
const STOP_WORDS = new Set([
  "어떤", "어떻게", "알려줘", "설명해줘", "무엇", "맞아", "있었어", "임진왜란",
  "조선", "일본", "전쟁", "장군", "수군", "동안", "관련"
]);

if (!workerUrl || !teacherToken) {
  throw new Error("WORKER_URL and TEACHER_TOKEN are required.");
}

const sessions = CLIENT_FALSEHOOD_EVALUATION_SET.map((entry) => ({
  ...entry,
  sessionId: crypto.randomUUID(),
  sessionSecret: crypto.randomUUID(),
  studentName: `DB검증-${entry.id}`
}));

if (!analyzeOnly) {
  await runPool(sessions, concurrency, async (session) => {
    await request("/api/join", {
      body: studentBody(session)
    });
    for (const question of session.questions) {
      await request("/api/chat", {
        timeoutMs: 180000,
        body: { ...studentBody(session), message: question }
      });
    }
  });
}

const exported = await request("/api/export", { teacher: true, method: "GET" });
const events = Array.isArray(exported.events) ? exported.events : [];
const rows = sessions.map((session) => evaluateSession(session, events));
const turns = rows.flatMap((row) => row.turns);
const summary = {
  assertions: rows.length,
  questions: CLIENT_FALSEHOOD_QUESTION_COUNT,
  delivered: turns.filter((turn) => turn.delivered).length,
  approved: turns.filter((turn) => turn.approved).length,
  relatedToQuestion: turns.filter((turn) => turn.relatedToQuestion).length,
  intendedClaimMatch: turns.filter((turn) => turn.intendedClaimMatch).length,
  repeatedAuditSeeds: rows.filter((row) => row.repeatedAuditSeed).length,
  repeatedVerbatimStudentSeeds: rows.filter((row) => row.repeatedVerbatimStudentSeed).length,
  repeatedStudentAnswers: rows.filter((row) => row.repeatedStudentAnswer).length,
  absurdityRisks: rows.filter((row) => row.absurdityRisk !== "low").length,
  byGroup: summarizeGroups(rows)
};

const payload = {
  schemaVersion: "client-falsehood-db-evaluation/v1",
  generatedAt: new Date().toISOString(),
  workerUrl,
  room,
  model: turns.find((turn) => turn.model)?.model || "",
  summary,
  rows
};
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);

console.log(JSON.stringify(summary, null, 2));
console.log(`wrote ${output}`);
console.log(`teacher dashboard: ${workerUrl}/teacher?room=${encodeURIComponent(room)}&token=${encodeURIComponent(teacherToken)}`);

function evaluateSession(session, events) {
  const sessionEvents = events
    .filter((event) =>
      event.studentName === session.studentName &&
      event.type === "chat_turn"
    )
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const turns = session.questions.map((question, index) => {
    const event = sessionEvents[index] || {};
    const audit = event.teacherAudit || {};
    const falseClaim = String(audit.falseClaim || "");
    const answer = String(event.studentVisibleAnswer || audit.studentVisibleFalseAnswer || "");
    return {
      question,
      delivered: Boolean(answer),
      approved: audit.preflight?.approvedForStudent === true,
      model: audit.provider?.model || "",
      generatedFalseClaim: falseClaim,
      studentVisibleAnswer: answer,
      correctAnswer: audit.correctAnswer || "",
      whyFalse: audit.whyFalse || "",
      levelFitReason: audit.levelFitReason || "",
      relatedToQuestion: lexicalOverlap(falseClaim, question) >= 0.08,
      intendedClaimMatch: lexicalOverlap(falseClaim, session.falseClaim) >= 0.25,
      intendedClaimSimilarity: Number(lexicalOverlap(falseClaim, session.falseClaim).toFixed(3)),
      verdict: audit.preflight?.verdict || ""
    };
  });
  const normalizedClaims = turns.map((turn) => normalize(turn.generatedFalseClaim)).filter(Boolean);
  const normalizedAnswers = turns.map((turn) => normalize(turn.studentVisibleAnswer)).filter(Boolean);
  const normalizedSeed = normalize(session.falseClaim);
  const verbatimSeedUses = normalizedAnswers.filter((answer) => answer.includes(normalizedSeed)).length;
  return {
    id: session.id,
    group: session.group,
    topic: session.topic,
    intendedFalseClaim: session.falseClaim,
    absurdityRisk: classifyAbsurdityRisk(session.falseClaim),
    repeatedAuditSeed: new Set(normalizedClaims).size < normalizedClaims.length,
    repeatedVerbatimStudentSeed: verbatimSeedUses >= 2,
    repeatedStudentAnswer: new Set(normalizedAnswers).size < normalizedAnswers.length,
    turns
  };
}

function summarizeGroups(rows) {
  return Object.fromEntries([...new Set(rows.map((row) => row.group))].map((group) => {
    const groupRows = rows.filter((row) => row.group === group);
    const groupTurns = groupRows.flatMap((row) => row.turns);
    return [group, {
      assertions: groupRows.length,
      questions: groupTurns.length,
      delivered: groupTurns.filter((turn) => turn.delivered).length,
      approved: groupTurns.filter((turn) => turn.approved).length,
      relatedToQuestion: groupTurns.filter((turn) => turn.relatedToQuestion).length,
      intendedClaimMatch: groupTurns.filter((turn) => turn.intendedClaimMatch).length
    }];
  }));
}

function classifyAbsurdityRisk(claim) {
  if (/(평화 전쟁|미사일|전혀 통하지|전쟁을 원하지 않았|끝까지 백성과 함께)/.test(claim)) return "high";
  if (/(모든|대부분|한 번도|완전히|전적으로|가장|사실상 끝)/.test(claim)) return "medium";
  return "low";
}

function lexicalOverlap(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared / Math.min(a.size, b.size);
}

function tokens(value) {
  return new Set(normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function studentBody(session) {
  return {
    sessionId: session.sessionId,
    sessionSecret: session.sessionSecret,
    studentName: session.studentName
  };
}

async function request(path, { body, teacher = false, method = "POST", timeoutMs = 30000 } = {}) {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${workerUrl}${path}${separator}room=${encodeURIComponent(room)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(teacher ? { "x-teacher-token": teacherToken } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${method} ${path} failed: ${response.status} ${JSON.stringify(data)}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function runPool(items, size, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  }));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
