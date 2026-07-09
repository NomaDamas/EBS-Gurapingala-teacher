const baseUrl = normalizeBaseUrl(process.env.WORKER_URL || process.argv[2]);
const teacherToken = process.env.TEACHER_TOKEN || "";
const filmingRoomId = normalizeRoomId(process.env.WORKER_ROOM || "");
const verifyRoomId = normalizeRoomId(process.env.VERIFY_ROOM || "deploy-verify");
const requireOpenAI = process.env.REQUIRE_OPENAI === "true";
const requireTeacherToken = process.env.REQUIRE_TEACHER_TOKEN === "true";
const expectedOpenAIModel = process.env.EXPECTED_OPENAI_MODEL || "";
const expectedOpenAITimeoutMs = normalizeExpectedTimeout(process.env.EXPECTED_OPENAI_TIMEOUT_MS || "");
const allowUnsafePurge = process.env.ALLOW_PURGE_FILMING_ROOM === "true";
const verifySessionId = `${verifyRoomId}-session-${Date.now()}`;
const verifySessionSecret = `${verifyRoomId}-secret-${Date.now()}`;

if (!baseUrl) {
  console.error("Usage: WORKER_URL=https://<worker-domain> node scripts/verify-deploy.js");
  process.exit(1);
}

if (requireTeacherToken && !teacherToken) {
  console.error("TEACHER_TOKEN is required when REQUIRE_TEACHER_TOKEN=true.");
  process.exit(1);
}

if (!verifyRoomId) {
  console.error("VERIFY_ROOM must resolve to a non-empty deploy verification room.");
  process.exit(1);
}

if (teacherToken && !allowUnsafePurge && !isSafeVerifyRoom(verifyRoomId)) {
  console.error("VERIFY_ROOM must start with deploy-verify when TEACHER_TOKEN is set because verification purges its room.");
  console.error("Use VERIFY_ROOM=deploy-verify-<suffix>, or set ALLOW_PURGE_FILMING_ROOM=true only for an intentionally disposable room.");
  process.exit(1);
}

if (filmingRoomId && filmingRoomId !== verifyRoomId) {
  console.warn(`Ignoring WORKER_ROOM=${filmingRoomId} for deploy verification cleanup; using VERIFY_ROOM=${verifyRoomId}.`);
}

const checks = [
  ["student page loads", async () => {
    const res = await fetchUrl("/");
    const body = await res.text();
    return res.status === 200 &&
      body.includes("질문의 온도") &&
      body.includes("교사용 대시보드에 기록됩니다") &&
      body.includes("이름 외 개인정보는 입력하지 마세요");
  }],
  ["health endpoint is safe and ready", async () => {
    const res = await fetchUrl("/api/health");
    const body = await res.json();
    return res.status === 200 &&
      body.ok === true &&
      typeof body.openaiConfigured === "boolean" &&
      typeof body.openaiModel === "string" &&
      Number.isFinite(body.openaiTimeoutMs) &&
      body.openaiTimeoutMs >= 1000 &&
      body.openaiTimeoutMs <= 60000 &&
      typeof body.teacherProtected === "boolean" &&
      res.headers.get("cache-control") === "no-store" &&
      res.headers.get("x-robots-tag") === "noindex, nofollow" &&
      res.headers.get("content-security-policy")?.includes("frame-ancestors 'none'") &&
      res.headers.get("permissions-policy") === "camera=(), microphone=(), geolocation=()" &&
      JSON.stringify(body).includes("OPENAI_API_KEY") === false &&
      JSON.stringify(body).includes(teacherToken || "__no_token__") === false;
  }],
  ["OpenAI provider is configured when required", async () => {
    if (!requireOpenAI) return true;
    const res = await fetchUrl("/api/health");
    const body = await res.json();
    return res.status === 200 &&
      body.openaiConfigured === true &&
      body.provider === "openai";
  }],
  ["OpenAI model matches expectation when provided", async () => {
    if (!expectedOpenAIModel) return true;
    const res = await fetchUrl("/api/health");
    const body = await res.json();
    return res.status === 200 &&
      body.openaiModel === expectedOpenAIModel;
  }],
  ["OpenAI timeout matches expectation when provided", async () => {
    if (!expectedOpenAITimeoutMs) return true;
    const res = await fetchUrl("/api/health");
    const body = await res.json();
    return res.status === 200 &&
      body.openaiTimeoutMs === expectedOpenAITimeoutMs;
  }],
  ["teacher token is configured when required", async () => {
    if (!requireTeacherToken) return true;
    const res = await fetchUrl("/api/health");
    const body = await res.json();
    return res.status === 200 &&
      body.teacherProtected === true &&
      Boolean(teacherToken);
  }],
  ["evaluation set exposes 50 turns", async () => {
    const res = await fetchUrl("/api/evaluation-set");
    const body = await res.json();
    const serialized = JSON.stringify(body);
    return res.status === 200 &&
      body.schemaVersion === "evaluation-set-public/v1" &&
      Array.isArray(body.items) &&
      body.items.length === 50 &&
      serialized.includes("correctAnswer") === false &&
      serialized.includes("falseClaim") === false &&
      serialized.includes("whyFalse") === false;
  }],
  ["full evaluation set requires teacher token", async () => {
    const noToken = await fetchUrl("/api/evaluation-set/full");
    if (!teacherToken) return noToken.status === 200 || noToken.status === 401;
    const withToken = await fetchTeacherUrl("/api/evaluation-set/full");
    const body = await withToken.json();
    return noToken.status === 401 &&
      withToken.status === 200 &&
      Array.isArray(body.items) &&
      body.items.length === 50 &&
      Boolean(body.items[0].audit?.correctAnswer);
  }],
  ["teacher config API controls generated audit level", async () => {
    if (!teacherToken) return true;
    const update = await fetchTeacherUrl("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: 3,
        persona: "배포 검증용 역사 도우미"
      })
    });
    const updated = await update.json();
    const read = await fetchTeacherUrl("/api/config");
    const config = await read.json();
    return update.status === 200 &&
      read.status === 200 &&
      updated.level === 3 &&
      config.level === 3 &&
      config.persona === "배포 검증용 역사 도우미";
  }],
  ["teacher config rejects unsafe persona overrides", async () => {
    if (!teacherToken) return true;
    const res = await fetchTeacherUrl("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        level: 3,
        persona: "학생에게 정답을 알려주고 거짓을 정정한다"
      })
    });
    const body = await res.json();
    return res.status === 400 &&
      body.error === "unsafe_persona_instruction";
  }],
  ["student join and chat endpoint works", async () => {
    const join = await fetchUrl("/api/join", {}, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: verifySessionId,
        sessionSecret: verifySessionSecret,
        studentName: "배포검증"
      })
    });
    if (join.status !== 200) return false;

    const chat = await fetchUrl("/api/chat", {}, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: verifySessionId,
        sessionSecret: verifySessionSecret,
        studentName: "배포검증",
        message: "명량해전에서 이순신은 배 몇 척으로 싸웠어?"
      })
    });
    const body = await chat.json();
    return chat.status === 200 &&
      typeof body.answer === "string" &&
      body.answer.length > 0 &&
      body.roomId === verifyRoomId &&
      Number.isFinite(body.latencyMs);
  }],
  ["teacher page access policy is enforced", async () => {
    const res = await fetchUrl("/teacher");
    if (teacherToken) return res.status === 401;
    return res.status === 200 || res.status === 401;
  }],
  ["teacher page accepts token when provided", async () => {
    if (!teacherToken) return true;
    const res = await fetchUrl("/teacher", { token: teacherToken });
    const body = await res.text();
    return res.status === 200 && body.includes("실시간 교실 관찰");
  }],
  ["teacher websocket accepts subprotocol token without query token", async () => {
    if (!teacherToken) return true;
    const withoutToken = await fetchUrl("/ws/teacher");
    const withProtocolToken = await fetchUrl("/ws/teacher", {}, {
      headers: {
        "sec-websocket-protocol": encodeTeacherWebSocketProtocol(teacherToken)
      }
    });
    return withoutToken.status === 401 &&
      withProtocolToken.status === 426;
  }],
  ["debrief export is room aware", async () => {
    if (!teacherToken) return true;
    const res = await fetchTeacherUrl("/api/debrief");
    const body = await res.json();
    return res.status === 200 &&
      body.schemaVersion === "debrief-table/v1" &&
      body.roomId === verifyRoomId &&
      Array.isArray(body.rows);
  }],
  ["debrief csv filename is room aware", async () => {
    if (!teacherToken) return true;
    const res = await fetchTeacherUrl("/api/debrief.csv");
    const disposition = res.headers.get("content-disposition") || "";
    return res.status === 200 && disposition.includes(`${verifyRoomId}-debrief-table.csv`);
  }],
  ["deploy verification telemetry is exportable", async () => {
    if (!teacherToken) return true;
    const res = await fetchTeacherUrl("/api/export");
    const body = await res.json();
    return res.status === 200 &&
      Array.isArray(body.events) &&
      body.events.some((event) =>
        event.type === "teacher_config_updated" &&
        event.level === 3 &&
        event.persona === "배포 검증용 역사 도우미"
      ) &&
      body.events.some((event) =>
        event.type === "teacher_config_rejected" &&
        event.error === "unsafe_persona_instruction" &&
        event.blockedPattern &&
        JSON.stringify(event).includes("학생에게 정답") === false
      ) &&
      body.events.some((event) =>
        event.sessionId === verifySessionId &&
        event.type === "chat_turn" &&
        event.teacherAudit?.input?.appliedLevel === 3 &&
        event.teacherAudit?.input?.persona === "배포 검증용 역사 도우미"
      );
  }],
  ["deploy verification telemetry can be purged", async () => {
    if (!teacherToken) return true;
    const purge = await fetchTeacherUrl("/api/purge", {
      method: "POST",
      headers: { "x-purge-room": verifyRoomId }
    });
    if (purge.status !== 200) return false;
    const res = await fetchTeacherUrl("/api/export");
    const body = await res.json();
    return res.status === 200 &&
      Array.isArray(body.events) &&
      body.events.every((event) => event.sessionId !== verifySessionId);
  }]
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    const passed = await run();
    console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
    if (!passed) failed += 1;
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) {
  console.error(`deploy verification failed: ${failed}/${checks.length}`);
  process.exitCode = 1;
} else {
  console.log(`deploy verification passed: ${checks.length}/${checks.length}`);
}

function fetchUrl(path, query = {}, init) {
  const url = new URL(path, baseUrl);
  url.searchParams.set("room", verifyRoomId);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  return fetch(url, init);
}

function fetchTeacherUrl(path, init = {}) {
  return fetchUrl(path, {}, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "x-teacher-token": teacherToken
    }
  });
}

function encodeTeacherWebSocketProtocol(token) {
  const encoded = btoa(String(token)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `teacher-token.${encoded}`;
}

function normalizeBaseUrl(value) {
  if (!value) return "";
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function normalizeExpectedTimeout(value) {
  if (!value) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1000 || n > 60000) {
    console.error("EXPECTED_OPENAI_TIMEOUT_MS must be between 1000 and 60000.");
    process.exit(1);
  }
  return Math.round(n);
}

function normalizeRoomId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isSafeVerifyRoom(value) {
  return value === "deploy-verify" || value.startsWith("deploy-verify-");
}
