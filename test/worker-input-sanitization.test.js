import test from "node:test";
import assert from "node:assert/strict";
import worker, { ClassroomRoom } from "../src/worker.js";

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

test("student JSON body limit applies while streaming without content-length", async () => {
  const env = {
    ROOM: {
      idFromName: (name) => name,
      get: () => ({
        fetch: async () => {
          throw new Error("oversized body should fail before Durable Object access");
        }
      })
    }
  };
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"sessionId":"s","sessionSecret":"secret","studentName":"민준","message":"'));
      controller.enqueue(new TextEncoder().encode("가".repeat(9000)));
      controller.enqueue(new TextEncoder().encode('"}'));
      controller.close();
    }
  });

  const res = await worker.fetch(new Request("https://example.com/api/chat", {
    method: "POST",
    body,
    duplex: "half"
  }), env);
  const payload = await res.json();

  assert.equal(res.status, 413);
  assert.equal(payload.error, "payload_too_large");
});

test("ClassroomRoom redacts secrets before telemetry is stored", async () => {
  const storage = new Map();
  const room = new ClassroomRoom({
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => storage.set(key, value),
      delete: async (key) => storage.delete(key)
    }
  });

  const write = await room.fetch(new Request("https://room.local/event", {
    method: "POST",
    body: JSON.stringify({
      type: "chat_turn",
      sessionId: "s1",
      studentName: "민준",
      sessionSecret: "student-secret-leak",
      teacherTokenValue: "teacher-token-leak",
      teacherKeyValue: "teacher-key-leak",
      nested: {
        openaiApiKeyBackup: "openai-key-leak",
        openaiKeyBackup: "openai-key-variant-leak",
        bearerAuthorizationHeader: "Bearer hidden",
        safe: "kept"
      },
      at: "2026-07-10T01:00:00.000Z"
    })
  }));
  assert.equal(write.status, 200);

  const read = await room.fetch(new Request("https://room.local/events"));
  const events = await read.json();
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("student-secret-leak"), false);
  assert.equal(serialized.includes("teacher-token-leak"), false);
  assert.equal(serialized.includes("teacher-key-leak"), false);
  assert.equal(serialized.includes("openai-key-leak"), false);
  assert.equal(serialized.includes("openai-key-variant-leak"), false);
  assert.equal(serialized.includes("Bearer hidden"), false);
  assert.equal(events[0].nested.safe, "kept");
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" }
  });
}
