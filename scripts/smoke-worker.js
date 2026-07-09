import worker from "../src/worker.js";

const events = [];
const config = {};
const rateLimitCalls = new Map();
const env = {
  DEFAULT_FALSE_LEVEL: "2",
  DEFAULT_PERSONA: "테스트 역사 도우미",
  LLM_PROVIDER: "rules",
  TEACHER_TOKEN: "teacher-secret",
  CHAT_RATE_LIMIT_PER_MINUTE: "1",
  EVENT_TTL_HOURS: "24",
  ROOM: {
    idFromName: (name) => name,
    get: () => ({
      fetch: async (input, init = {}) => roomFetch(input, init)
    })
  }
};

const checks = [
  ["student page loads", async () => {
    const res = await appFetch("https://example.com/");
    return res.status === 200 && (await res.text()).includes("질문의 온도");
  }],
  ["teacher page requires token", async () => {
    const res = await appFetch("https://example.com/teacher");
    return res.status === 401;
  }],
  ["teacher page accepts token", async () => {
    const res = await appFetch("https://example.com/teacher?token=teacher-secret");
    return res.status === 200 && (await res.text()).includes("실시간 교실 관찰");
  }],
  ["evaluation set exposes 50 turns", async () => {
    const res = await appFetch("https://example.com/api/evaluation-set");
    const body = await res.json();
    return res.status === 200 && body.items.length === 50;
  }],
  ["health endpoint reports safe runtime config", async () => {
    const res = await appFetch("https://example.com/api/health");
    const body = await res.json();
    return res.status === 200 &&
      body.ok === true &&
      body.provider === "rules" &&
      body.teacherProtected === true &&
      body.endpoints.debriefCsv === "/api/debrief.csv";
  }],
  ["student can join and chat with rules provider", async () => {
    const join = await appFetch("https://example.com/api/join", {
      method: "POST",
      body: JSON.stringify({ sessionId: "s1", studentName: "민준" })
    });
    const chat = await appFetch("https://example.com/api/chat", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "s1",
        studentName: "민준",
        message: "명량해전에서 몇 척으로 싸웠어?"
      })
    });
    const body = await chat.json();
    return join.status === 200 && chat.status === 200 && body.answer.includes("지휘력 하나만");
  }],
  ["rate limit returns 429", async () => {
    const res = await appFetch("https://example.com/api/chat", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "s1",
        studentName: "민준",
        message: "한 번 더 알려줘"
      })
    });
    const body = await res.json();
    return res.status === 429 && body.error === "rate_limited";
  }],
  ["export and debrief require token", async () => {
    const exportRes = await appFetch("https://example.com/api/export");
    const debriefRes = await appFetch("https://example.com/api/debrief");
    return exportRes.status === 401 && debriefRes.status === 401;
  }],
  ["export and debrief work with token", async () => {
    const exportRes = await appFetch("https://example.com/api/export?token=teacher-secret");
    const exportBody = await exportRes.json();
    const debriefRes = await appFetch("https://example.com/api/debrief?token=teacher-secret");
    const debriefBody = await debriefRes.json();
    const csvRes = await appFetch("https://example.com/api/debrief.csv?token=teacher-secret");
    const csvBody = await csvRes.text();
    return exportBody.events.length >= 2 && debriefBody.rows.length === 1 && csvBody.includes("correctAnswer");
  }],
  ["purge clears events", async () => {
    const purge = await appFetch("https://example.com/api/purge?token=teacher-secret", { method: "POST" });
    const exportRes = await appFetch("https://example.com/api/export?token=teacher-secret");
    const exportBody = await exportRes.json();
    return purge.status === 200 && exportBody.events.length === 0;
  }]
];

let failed = 0;
for (const [name, run] of checks) {
  const passed = await run();
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed += 1;
}
if (failed) {
  console.error(`worker smoke failed: ${failed}/${checks.length}`);
  process.exitCode = 1;
} else {
  console.log(`worker smoke passed: ${checks.length}/${checks.length}`);
}

async function appFetch(url, init = {}) {
  return worker.fetch(new Request(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    }
  }), env);
}

async function roomFetch(input, init = {}) {
  const url = new URL(String(input));
  if (url.pathname === "/config") return json(config);
  if (url.pathname === "/events") return json(events);
  if (url.pathname === "/event" && init.method === "POST") {
    events.push(JSON.parse(init.body));
    return new Response("ok");
  }
  if (url.pathname === "/rate-limit" && init.method === "POST") {
    const body = JSON.parse(init.body);
    const count = rateLimitCalls.get(body.sessionId) || 0;
    rateLimitCalls.set(body.sessionId, count + 1);
    return json({
      allowed: count < Number(body.limit || 1),
      retryAfterMs: count < Number(body.limit || 1) ? 0 : 60000
    });
  }
  if (url.pathname === "/purge" && init.method === "POST") {
    events.length = 0;
    rateLimitCalls.clear();
    return new Response("ok");
  }
  return new Response("not mocked", { status: 404 });
}

function json(value) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" }
  });
}
