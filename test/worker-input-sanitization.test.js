import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

test("student inputs are normalized before telemetry is stored", async () => {
  const storedEvents = [];
  const sessions = new Map();
  const env = {
    DEFAULT_FALSE_LEVEL: "2",
    DEFAULT_PERSONA: "테스트 역사 도우미",
    LLM_PROVIDER: "rules",
    ROOM: {
      idFromName: (name) => name,
      get: () => ({
        fetch: async (input, init = {}) => {
          const url = new URL(input);
          if (url.pathname === "/event") {
            storedEvents.push(JSON.parse(init.body));
            return new Response("ok");
          }
          if (url.pathname === "/session-register") {
            const body = JSON.parse(init.body);
            sessions.set(body.sessionId, body.sessionSecret);
            return jsonResponse({ ok: true });
          }
          if (url.pathname === "/session-validate") {
            const body = JSON.parse(init.body);
            return jsonResponse({
              ok: sessions.get(body.sessionId) === body.sessionSecret
            });
          }
          if (url.pathname === "/events") return jsonResponse([]);
          if (url.pathname === "/config") return jsonResponse({});
          if (url.pathname === "/rate-limit") {
            return jsonResponse({ allowed: true, retryAfterMs: 0 });
          }
          return new Response("ok");
        }
      })
    }
  };

  const join = await worker.fetch(new Request("https://example.com/api/join", {
    method: "POST",
    body: JSON.stringify({
      sessionId: " s\n1\t",
      sessionSecret: " secret\n1\t",
      studentName: " 민\n준\t"
    })
  }), env);
  assert.equal(join.status, 200);

  const chat = await worker.fetch(new Request("https://example.com/api/chat", {
    method: "POST",
    body: JSON.stringify({
      sessionId: " s\n1\t",
      sessionSecret: " secret\n1\t",
      studentName: " 민\n준\t",
      message: "명량해전에서\n몇\t척으로 싸웠어?"
    })
  }), env);
  assert.equal(chat.status, 200);

  assert.equal(storedEvents[0].sessionId, "s 1");
  assert.equal(storedEvents[0].studentName, "민 준");
  assert.equal(storedEvents[1].sessionId, "s 1");
  assert.equal(storedEvents[1].studentName, "민 준");
  assert.equal(storedEvents[1].studentMessage, "명량해전에서 몇 척으로 싸웠어?");
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" }
  });
}
