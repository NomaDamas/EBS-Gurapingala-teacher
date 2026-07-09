const baseUrl = normalizeBaseUrl(process.env.WORKER_URL || process.argv[2]);
const teacherToken = process.env.TEACHER_TOKEN || "";
const roomId = normalizeRoomId(process.env.WORKER_ROOM || "");
const requireOpenAI = process.env.REQUIRE_OPENAI === "true";
const verifySessionId = `deploy-verify-${Date.now()}`;

if (!baseUrl) {
  console.error("Usage: WORKER_URL=https://<worker-domain> node scripts/verify-deploy.js");
  process.exit(1);
}

const checks = [
  ["student page loads", async () => {
    const res = await fetchUrl("/");
    const body = await res.text();
    return res.status === 200 && body.includes("질문의 온도");
  }],
  ["health endpoint is safe and ready", async () => {
    const res = await fetchUrl("/api/health");
    const body = await res.json();
    return res.status === 200 &&
      body.ok === true &&
      typeof body.openaiConfigured === "boolean" &&
      typeof body.teacherProtected === "boolean" &&
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
  ["evaluation set exposes 50 turns", async () => {
    const res = await fetchUrl("/api/evaluation-set");
    const body = await res.json();
    return res.status === 200 && Array.isArray(body.items) && body.items.length === 50;
  }],
  ["student join and chat endpoint works", async () => {
    const join = await fetchUrl("/api/join", {}, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: verifySessionId,
        studentName: "배포검증"
      })
    });
    if (join.status !== 200) return false;

    const chat = await fetchUrl("/api/chat", {}, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: verifySessionId,
        studentName: "배포검증",
        message: "명량해전에서 이순신은 배 몇 척으로 싸웠어?"
      })
    });
    const body = await chat.json();
    return chat.status === 200 &&
      typeof body.answer === "string" &&
      body.answer.length > 0 &&
      body.roomId === (roomId || "default-classroom") &&
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
  ["debrief export is room aware", async () => {
    if (!teacherToken || !roomId) return true;
    const res = await fetchUrl("/api/debrief", { token: teacherToken });
    const body = await res.json();
    return res.status === 200 &&
      body.schemaVersion === "debrief-table/v1" &&
      body.roomId === roomId &&
      Array.isArray(body.rows);
  }],
  ["debrief csv filename is room aware", async () => {
    if (!teacherToken || !roomId) return true;
    const res = await fetchUrl("/api/debrief.csv", { token: teacherToken });
    const disposition = res.headers.get("content-disposition") || "";
    return res.status === 200 && disposition.includes(`${roomId}-debrief-table.csv`);
  }],
  ["deploy verification telemetry is exportable", async () => {
    if (!teacherToken) return true;
    const res = await fetchUrl("/api/export", { token: teacherToken });
    const body = await res.json();
    return res.status === 200 &&
      Array.isArray(body.events) &&
      body.events.some((event) => event.sessionId === verifySessionId && event.type === "chat_turn");
  }],
  ["deploy verification telemetry can be purged", async () => {
    if (!teacherToken) return true;
    const purge = await fetchUrl("/api/purge", { token: teacherToken }, { method: "POST" });
    if (purge.status !== 200) return false;
    const res = await fetchUrl("/api/export", { token: teacherToken });
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
  if (roomId) url.searchParams.set("room", roomId);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  return fetch(url, init);
}

function normalizeBaseUrl(value) {
  if (!value) return "";
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function normalizeRoomId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
