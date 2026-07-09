import worker from "../src/worker.js";

const eventsByRoom = new Map();
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
    get: (name) => ({
      fetch: async (input, init = {}) => roomFetch(name, input, init)
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
    const body = await res.text();
    return res.status === 200 &&
      body.includes("실시간 교실 관찰") &&
      body.includes("실시간 연결 재시도") &&
      body.includes("학생 URL 복사") &&
      body.includes("교사용 URL 복사");
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
  ["invalid student JSON returns 400", async () => {
    const res = await appFetch("https://example.com/api/join", {
      method: "POST",
      body: "not-json"
    });
    const body = await res.json();
    return res.status === 400 && body.error === "invalid_json";
  }],
  ["student payload validation returns 400", async () => {
    const missingMessage = await appFetch("https://example.com/api/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "s-validation", studentName: "민준" })
    });
    const longName = await appFetch("https://example.com/api/join", {
      method: "POST",
      body: JSON.stringify({ sessionId: "s-validation", studentName: "가".repeat(41) })
    });
    const missingMessageBody = await missingMessage.json();
    const longNameBody = await longName.json();
    return missingMessage.status === 400 &&
      missingMessageBody.error === "missing_message" &&
      longName.status === 400 &&
      longNameBody.error === "student_name_too_long";
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
  ["room query isolates classroom events", async () => {
    await appFetch("https://example.com/api/join?room=room-a", {
      method: "POST",
      body: JSON.stringify({ sessionId: "room-student", studentName: "서연" })
    });
    await appFetch("https://example.com/api/chat?room=room-a", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "room-student",
        studentName: "서연",
        message: "거북선은 누가 만들었어?"
      })
    });
    const roomA = await (await appFetch("https://example.com/api/export?room=room-a&token=teacher-secret")).json();
    const roomB = await (await appFetch("https://example.com/api/export?room=room-b&token=teacher-secret")).json();
    return roomA.roomId === "room-a" &&
      roomB.roomId === "room-b" &&
      roomA.events.some((event) => event.studentName === "서연") &&
      roomB.events.length === 0;
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

async function roomFetch(roomName, input, init = {}) {
  const events = eventsFor(roomName);
  const url = new URL(String(input));
  if (url.pathname === "/config") return json(config);
  if (url.pathname === "/events") return json(events);
  if (url.pathname === "/event" && init.method === "POST") {
    events.push(JSON.parse(init.body));
    return new Response("ok");
  }
  if (url.pathname === "/rate-limit" && init.method === "POST") {
    const body = JSON.parse(init.body);
    const key = `${roomName}:${body.sessionId}`;
    const count = rateLimitCalls.get(key) || 0;
    rateLimitCalls.set(key, count + 1);
    return json({
      allowed: count < Number(body.limit || 1),
      retryAfterMs: count < Number(body.limit || 1) ? 0 : 60000
    });
  }
  if (url.pathname === "/purge" && init.method === "POST") {
    events.length = 0;
    for (const key of rateLimitCalls.keys()) {
      if (key.startsWith(`${roomName}:`)) rateLimitCalls.delete(key);
    }
    return new Response("ok");
  }
  return new Response("not mocked", { status: 404 });
}

function eventsFor(roomName) {
  if (!eventsByRoom.has(roomName)) eventsByRoom.set(roomName, []);
  return eventsByRoom.get(roomName);
}

function json(value) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" }
  });
}
