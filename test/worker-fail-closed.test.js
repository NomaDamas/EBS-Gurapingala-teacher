import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

test("worker는 LLM preflight 실패 시 학생에게 정답/audit를 숨기고 교사용 telemetry만 남긴다", async () => {
  const originalFetch = globalThis.fetch;
  let openaiCalls = 0;
  globalThis.fetch = async () => {
    openaiCalls += 1;
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        correct_answer: "임진왜란은 1592년에 시작되었다.",
        false_answer: "임진왜란은 1592년에 시작되었다.",
        false_basis: "거짓 근거 없음",
        level_fit_reason: "Level 1이라고 주장하지만 실제 오류가 없다.",
        student_answer: "임진왜란은 1592년에 시작되었어."
      })
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const room = createRoomMock();
  const env = {
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-test",
    OPENAI_TIMEOUT_MS: "2500",
    DEFAULT_FALSE_LEVEL: "1",
    DEFAULT_PERSONA: "역사 도우미",
    TEACHER_TOKEN: "teacher-secret",
    CHAT_RATE_LIMIT_PER_MINUTE: "12",
    EVENT_TTL_HOURS: "24",
    ROOM: {
      idFromName: (name) => name,
      get: () => ({ fetch: room.fetch })
    }
  };

  try {
    const join = await appFetch("/api/join", env, {
      method: "POST",
      body: {
        sessionId: "fail-closed-s1",
        sessionSecret: "fail-closed-secret",
        studentName: "민준"
      }
    });
    assert.equal(join.status, 200);

    const chat = await appFetch("/api/chat", env, {
      method: "POST",
      body: {
        sessionId: "fail-closed-s1",
        sessionSecret: "fail-closed-secret",
        studentName: "민준",
        message: "임진왜란은 언제 시작됐어?"
      }
    });
    const chatBody = await chat.json();

    assert.equal(chat.status, 200);
    assert.equal(openaiCalls, 3);
    assert.match(chatBody.answer, /답변을 만들지 못했어/);
    assert.equal(chatBody.answer.includes("1592"), false);
    assert.equal(JSON.stringify(chatBody).includes("correctAnswer"), false);
    assert.equal(JSON.stringify(chatBody).includes("whyFalse"), false);

    const exportRes = await appFetch("/api/export", env, {
      headers: { "x-teacher-token": "teacher-secret" }
    });
    const exportBody = await exportRes.json();
    const turn = exportBody.events.find((event) => event.type === "chat_turn");

    assert.equal(exportRes.status, 200);
    assert.equal(turn.blockedForStudent, true);
    assert.equal(turn.studentVisibleAnswer.includes("1592"), false);
    assert.equal(turn.teacherAudit.preflight.verdict, "FAIL_CLOSED_AFTER_RETRIES");
    assert.equal(turn.teacherAudit.correctAnswer.includes("1592"), true);
    assert.equal(turn.teacherAudit.provider.name, "openai");
    assert.equal(turn.teacherAudit.provider.timeoutMs, 2500);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function appFetch(path, env, { method = "GET", headers = {}, body } = {}) {
  return worker.fetch(new Request(`https://example.com${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  }), env);
}

function createRoomMock() {
  const events = [];
  const sessions = new Map();
  const rateLimits = new Map();
  let config = {};
  return {
    fetch: async (input, init = {}) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request ? request.url : String(input));
      const method = request?.method || init.method || "GET";
      const bodyText = request ? await request.text() : init.body;

      if (url.pathname === "/config" && method === "POST") {
        config = JSON.parse(bodyText || "{}");
        return json(config);
      }
      if (url.pathname === "/config") return json(config);
      if (url.pathname === "/events") return json(events);
      if (url.pathname === "/event" && method === "POST") {
        events.push(JSON.parse(bodyText));
        return new Response("ok");
      }
      if (url.pathname === "/session-register" && method === "POST") {
        const body = JSON.parse(bodyText);
        sessions.set(body.sessionId, {
          sessionSecret: body.sessionSecret,
          studentName: body.studentName
        });
        return json({ ok: true });
      }
      if (url.pathname === "/session-validate" && method === "POST") {
        const body = JSON.parse(bodyText);
        const existing = sessions.get(body.sessionId);
        if (!existing) return json({ ok: false, status: 401, error: "session_not_joined" });
        if (existing.sessionSecret !== body.sessionSecret) {
          return json({ ok: false, status: 409, error: "session_verification_failed" });
        }
        return json({ ok: true });
      }
      if (url.pathname === "/rate-limit" && method === "POST") {
        const body = JSON.parse(bodyText);
        const count = rateLimits.get(body.sessionId) || 0;
        rateLimits.set(body.sessionId, count + 1);
        return json({ allowed: true, retryAfterMs: 0 });
      }
      return new Response("not mocked", { status: 404 });
    }
  };
}

function json(value) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" }
  });
}
