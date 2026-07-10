import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

test("teacher can select truth mode and receive verified truth telemetry without leaking audit to student", async () => {
  const originalFetch = globalThis.fetch;
  const openaiSchemas = [];
  globalThis.fetch = async (url, init) => {
    const schema = JSON.parse(init.body).text.format.name;
    openaiSchemas.push(schema);
    if (schema === "truth_preflight_verifier") {
      return json({
        id: "resp-truth-verifier",
        model: "gpt-verifier",
        output_text: JSON.stringify({
          approved: true,
          historically_supported: true,
          answers_current_question: true,
          unsupported_specifics: false,
          contradiction: false,
          rationale: "교사용 기준과 일치한다."
        })
      });
    }
    return json({
      id: "resp-truth-generator",
      model: "gpt-generator",
      output_text: JSON.stringify({
        correct_answer: "난중일기는 이순신이 임진왜란 중에 쓴 개인 일기다.",
        student_answer: "난중일기는 이순신 장군이 임진왜란 중에 전황과 생활, 생각을 적은 개인 일기야."
      })
    });
  };

  const room = createRoomMock();
  const env = {
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-generator",
    OPENAI_VERIFIER_MODEL: "gpt-verifier",
    DEFAULT_FALSE_LEVEL: "2",
    DEFAULT_RESPONSE_MODE: "experiment",
    DEFAULT_PERSONA: "친절한 역사 도우미",
    TEACHER_TOKEN: "teacher-secret",
    ROOM: {
      idFromName: (name) => name,
      get: () => ({ fetch: room.fetch })
    }
  };

  try {
    const configRes = await appFetch("/api/config", env, {
      method: "POST",
      headers: { "x-teacher-token": "teacher-secret" },
      body: {
        responseMode: "truth",
        level: 4,
        persona: "친절한 역사 도우미"
      }
    });
    const config = await configRes.json();
    assert.equal(config.responseMode, "truth");

    const join = await appFetch("/api/join", env, {
      method: "POST",
      body: {
        sessionId: "truth-s1",
        sessionSecret: "truth-secret",
        studentName: "민준"
      }
    });
    assert.equal(join.status, 200);

    const chat = await appFetch("/api/chat", env, {
      method: "POST",
      body: {
        sessionId: "truth-s1",
        sessionSecret: "truth-secret",
        studentName: "민준",
        message: "난중일기는 뭐야?"
      }
    });
    const chatBody = await chat.json();

    assert.equal(chat.status, 200);
    assert.deepEqual(openaiSchemas, ["verified_truth_answer", "truth_preflight_verifier"]);
    assert.match(chatBody.answer, /개인 일기/);
    assert.equal(JSON.stringify(chatBody).includes("correctAnswer"), false);
    assert.equal(JSON.stringify(chatBody).includes("preflight"), false);

    const exportRes = await appFetch("/api/export", env, {
      headers: { "x-teacher-token": "teacher-secret" }
    });
    const exportBody = await exportRes.json();
    const turn = exportBody.events.find((event) => event.type === "chat_turn");

    assert.equal(turn.teacherAudit.input.responseMode, "truth");
    assert.equal(turn.teacherAudit.input.appliedLevel, null);
    assert.equal(turn.teacherAudit.preflight.verdict, "PASS_VERIFIED_TRUTH");
    assert.equal(turn.teacherAudit.falseClaim, "");
    assert.equal(exportBody.debriefRows[0].debriefRequired, false);
    assert.equal(exportBody.sessionSummary[0].lastResponseMode, "truth");
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
  let config = {};
  return {
    fetch: async (input, init = {}) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request ? request.url : String(input));
      const method = request?.method || init.method || "GET";
      const bodyText = request ? await request.text() : init.body;

      if (url.pathname === "/config" && method === "POST") {
        config = JSON.parse(bodyText || "{}");
        events.push({
          type: "teacher_config_updated",
          sessionId: "teacher",
          config,
          ...config,
          at: new Date().toISOString()
        });
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
        sessions.set(body.sessionId, body);
        return json({ ok: true });
      }
      if (url.pathname === "/session-validate" && method === "POST") {
        const body = JSON.parse(bodyText);
        const existing = sessions.get(body.sessionId);
        return json(existing?.sessionSecret === body.sessionSecret
          ? { ok: true }
          : { ok: false, status: 401, error: "session_not_joined" });
      }
      if (url.pathname === "/rate-limit" && method === "POST") {
        return json({ allowed: true, retryAfterMs: 0 });
      }
      return new Response("not mocked", { status: 404 });
    }
  };
}

function json(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
