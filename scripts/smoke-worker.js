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
    const body = await res.text();
    return res.status === 200 &&
      body.includes("질문의 온도") &&
      body.includes("교사용 대시보드에 기록됩니다") &&
      body.includes("이름 외 개인정보는 입력하지 마세요");
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
      body.includes("설정 적용 상태") &&
      body.includes("채팅턴") &&
      body.includes("학생 URL 복사") &&
      body.includes("교사용 URL 복사") &&
      body.includes("blockedForStudent") &&
      body.includes("x-purge-room");
  }],
  ["evaluation set exposes 50 turns", async () => {
    const res = await appFetch("https://example.com/api/evaluation-set");
    const body = await res.json();
    const fullWithoutToken = await appFetch("https://example.com/api/evaluation-set/full");
    const fullWithToken = await appFetch("https://example.com/api/evaluation-set/full", {
      headers: { "x-teacher-token": "teacher-secret" }
    });
    const fullBody = await fullWithToken.json();
    const serializedPublic = JSON.stringify(body);
    return res.status === 200 &&
      body.schemaVersion === "evaluation-set-public/v1" &&
      body.items.length === 50 &&
      serializedPublic.includes("correctAnswer") === false &&
      serializedPublic.includes("falseClaim") === false &&
      serializedPublic.includes("whyFalse") === false &&
      fullWithoutToken.status === 401 &&
      fullWithToken.status === 200 &&
      fullBody.items.length === 50 &&
      Boolean(fullBody.items[0].audit?.correctAnswer);
  }],
  ["health endpoint reports safe runtime config", async () => {
    const res = await appFetch("https://example.com/api/health");
    const body = await res.json();
    return res.status === 200 &&
      body.ok === true &&
      body.provider === "rules" &&
      body.openaiModel === "gpt-5.5" &&
      body.teacherProtected === true &&
      body.endpoints.debriefCsv === "/api/debrief.csv" &&
      res.headers.get("cache-control") === "no-store" &&
      res.headers.get("x-content-type-options") === "nosniff" &&
      res.headers.get("referrer-policy") === "no-referrer";
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
    return join.status === 200 &&
      chat.status === 200 &&
      body.answer.includes("지휘력 하나만") &&
      Number.isFinite(body.latencyMs);
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
    const exportRes = await appFetch("https://example.com/api/export", {
      headers: { "x-teacher-token": "teacher-secret" }
    });
    const exportBody = await exportRes.json();
    const debriefRes = await appFetch("https://example.com/api/debrief", {
      headers: { "x-teacher-token": "teacher-secret" }
    });
    const debriefBody = await debriefRes.json();
    const csvRes = await appFetch("https://example.com/api/debrief.csv", {
      headers: { "x-teacher-token": "teacher-secret" }
    });
    const csvBody = await csvRes.text();
    const csvDisposition = csvRes.headers.get("content-disposition") || "";
    return exportBody.roomId === "default-classroom" &&
      exportBody.events.length >= 2 &&
      exportBody.events.some((event) => event.type === "chat_turn" && Number.isFinite(event.latencyMs)) &&
      exportBody.sessionSummary.some((session) => session.lastChatAt && Number.isFinite(session.averageLatencyMs) && session.lastLevel === 2) &&
      debriefBody.roomId === "default-classroom" &&
      debriefBody.rows.length === 1 &&
      Number.isFinite(debriefBody.rows[0].latencyMs) &&
      debriefBody.rows[0].verificationPrompt.includes("명량해전") &&
      debriefBody.rows[0].debriefNote.includes("정정") &&
      csvBody.includes("correctAnswer") &&
      csvBody.includes("latencyMs") &&
      csvBody.includes("verificationPrompt") &&
      csvBody.includes("debriefNote") &&
      csvDisposition.includes("default-classroom-debrief-table.csv");
  }],
  ["teacher config API controls generated audit level", async () => {
    const teacherHeaders = { "x-teacher-token": "teacher-secret" };
    const update = await appFetch("https://example.com/api/config", {
      method: "POST",
      headers: teacherHeaders,
      body: JSON.stringify({
        level: 4,
        persona: "검증용 페르소나"
      })
    });
    const updated = await update.json();
    const read = await appFetch("https://example.com/api/config", { headers: teacherHeaders });
    const configBody = await read.json();
    const chat = await appFetch("https://example.com/api/chat", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "config-s1",
        studentName: "지우",
        message: "거북선은 어떤 배였어?"
      })
    });
    const exportRes = await appFetch("https://example.com/api/export", { headers: teacherHeaders });
    const exportBody = await exportRes.json();
    const configEvent = exportBody.events.find((event) => event.type === "teacher_config_updated");
    const turn = exportBody.events.find((event) => event.sessionId === "config-s1" && event.type === "chat_turn");
    return update.status === 200 &&
      read.status === 200 &&
      updated.level === 4 &&
      configBody.level === 4 &&
      configBody.persona === "검증용 페르소나" &&
      chat.status === 200 &&
      configEvent?.level === 4 &&
      configEvent?.persona === "검증용 페르소나" &&
      turn?.teacherAudit?.input?.appliedLevel === 4 &&
      turn?.teacherAudit?.input?.persona === "검증용 페르소나";
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
    const teacherHeaders = { "x-teacher-token": "teacher-secret" };
    const roomA = await (await appFetch("https://example.com/api/export?room=room-a", { headers: teacherHeaders })).json();
    const roomB = await (await appFetch("https://example.com/api/export?room=room-b", { headers: teacherHeaders })).json();
    return roomA.roomId === "room-a" &&
      roomB.roomId === "room-b" &&
      roomA.events.some((event) => event.studentName === "서연") &&
      roomB.events.length === 0;
  }],
  ["purge clears events", async () => {
    const rejected = await appFetch("https://example.com/api/purge", {
      method: "POST",
      headers: { "x-teacher-token": "teacher-secret" }
    });
    const rejectedBody = await rejected.json();
    const purge = await appFetch("https://example.com/api/purge", {
      method: "POST",
      headers: {
        "x-teacher-token": "teacher-secret",
        "x-purge-room": "default-classroom"
      }
    });
    const exportRes = await appFetch("https://example.com/api/export", {
      headers: { "x-teacher-token": "teacher-secret" }
    });
    const exportBody = await exportRes.json();
    return rejected.status === 409 &&
      rejectedBody.error === "purge_room_confirmation_required" &&
      purge.status === 200 &&
      exportBody.events.length === 0;
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
  if (url.pathname === "/config" && init.method === "POST") {
    Object.assign(config, JSON.parse(init.body), { updatedAt: new Date().toISOString() });
    events.push({
      type: "teacher_config_updated",
      sessionId: "teacher",
      studentName: "teacher",
      level: config.level,
      persona: config.persona,
      config,
      at: config.updatedAt
    });
    return json(config);
  }
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
