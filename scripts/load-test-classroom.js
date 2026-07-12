import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const baseUrl = String(process.env.WORKER_URL || "").replace(/\/+$/, "");
const teacherToken = String(process.env.TEACHER_TOKEN || "");
const roomId = String(process.env.LOAD_TEST_ROOM || `capacity-test-${Date.now()}`);
const studentCount = Number(process.env.LOAD_TEST_STUDENTS || 35);
const outputPath = process.env.LOAD_TEST_OUTPUT || "artifacts/classroom-capacity-evidence.json";
const persona = "일반적인 ChatGPT처럼 자연스럽고 명확한 한국어로 대화한다. 역할극 말투를 쓰지 않는다.";

if (!baseUrl) throw new Error("WORKER_URL is required");
if (!teacherToken) throw new Error("TEACHER_TOKEN is required");
if (!Number.isInteger(studentCount) || studentCount < 1 || studentCount > 100) {
  throw new Error("LOAD_TEST_STUDENTS must be an integer from 1 to 100");
}
if (["2026-07-13-3-5", "2026-07-16-3-1"].includes(roomId)) {
  throw new Error("Filming rooms cannot be used for load tests");
}

const startedAt = new Date().toISOString();
const students = Array.from({ length: studentCount }, (_, index) => ({
  sessionId: crypto.randomUUID(),
  sessionSecret: crypto.randomUUID(),
  studentName: `부하시험-${String(index + 1).padStart(2, "0")}`
}));

await teacherFetch("/api/config", {
  method: "POST",
  body: JSON.stringify({
    responseMode: "experiment",
    level: 2,
    mixLevels: [5, 1, 2, 3, 4],
    persona
  })
});

const joins = await runConcurrent(students, (student) =>
  studentFetch("/api/join", student));
const heartbeats = await runConcurrent(students, (student) =>
  studentFetch("/api/heartbeat", student));
const questions = [
  "명량해전에서 조선 수군이 이긴 이유는 뭐야?",
  "난중일기는 어떤 기록이야?",
  "거북선은 이순신 장군이 직접 발명한 거야?",
  "임진왜란은 왜 시작됐어?",
  "조선 수군은 임진왜란 동안 한 번도 지지 않았어?"
];
const chats = await runConcurrent(students, (student, index) =>
  studentFetch("/api/chat", {
    ...student,
    message: questions[index % questions.length]
  }));

const exportResponse = await teacherFetch("/api/export");
const exportBody = await exportResponse.json();
const chatEvents = exportBody.events?.filter((event) => event.type === "chat_turn") || [];
const observedSessionIds = new Set(exportBody.sessionSummary?.map((session) => session.sessionId) || []);
const latencies = chats.filter((item) => item.ok).map((item) => item.durationMs).sort((a, b) => a - b);
const providerCounts = {};
for (const event of chatEvents) {
  const provider = event.teacherAudit?.provider?.name || "unknown";
  providerCounts[provider] = (providerCounts[provider] || 0) + 1;
}

const evidence = {
  schemaVersion: "classroom-capacity-evidence/v1",
  startedAt,
  completedAt: new Date().toISOString(),
  baseUrl,
  roomId,
  requestedStudents: studentCount,
  joins: summarize(joins),
  heartbeats: summarize(heartbeats),
  chats: {
    ...summarize(chats),
    latencyMs: {
      min: latencies[0] ?? null,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: latencies.at(-1) ?? null
    }
  },
  telemetry: {
    sessionSummaryCount: exportBody.sessionSummary?.length || 0,
    uniqueObservedSessions: observedSessionIds.size,
    chatTurnCount: chatEvents.length,
    blockedTurns: chatEvents.filter((event) => event.blockedForStudent).length,
    providerCounts
  }
};
evidence.pass =
  evidence.joins.succeeded === studentCount &&
  evidence.heartbeats.succeeded === studentCount &&
  evidence.chats.succeeded === studentCount &&
  evidence.telemetry.uniqueObservedSessions === studentCount &&
  evidence.telemetry.chatTurnCount === studentCount &&
  evidence.telemetry.blockedTurns === 0 &&
  evidence.telemetry.providerCounts.openai === studentCount;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));

const purge = await teacherFetch("/api/purge", {
  method: "POST",
  headers: { "x-purge-room": roomId }
});
if (!purge.ok) throw new Error(`Failed to purge load-test room: ${purge.status}`);
if (!evidence.pass) process.exitCode = 1;

async function runConcurrent(items, operation) {
  return Promise.all(items.map(async (item, index) => {
    const start = performance.now();
    try {
      const response = await operation(item, index);
      const body = await readJson(response);
      return {
        ok: response.ok,
        status: response.status,
        durationMs: Math.round(performance.now() - start),
        error: response.ok ? "" : String(body.error || body.message || "request_failed")
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        durationMs: Math.round(performance.now() - start),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }));
}

function studentFetch(path, body) {
  return fetch(roomUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function teacherFetch(path, init = {}) {
  return fetch(roomUrl(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-teacher-token": teacherToken,
      ...(init.headers || {})
    }
  });
}

function roomUrl(path) {
  return `${baseUrl}${path}?room=${encodeURIComponent(roomId)}`;
}

function summarize(results) {
  const statuses = {};
  const errors = {};
  for (const result of results) {
    statuses[result.status] = (statuses[result.status] || 0) + 1;
    if (result.error) errors[result.error] = (errors[result.error] || 0) + 1;
  }
  return {
    total: results.length,
    succeeded: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    statuses,
    errors
  };
}

function percentile(values, ratio) {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
