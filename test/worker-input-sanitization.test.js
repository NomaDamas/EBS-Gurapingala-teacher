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

test("repeated composer guidance is rejected before OpenAI or telemetry work", async () => {
  let roomCalls = 0;
  const env = {
    ROOM: {
      idFromName: (name) => name,
      get: () => ({
        fetch: async () => {
          roomCalls += 1;
          throw new Error("composer guidance must be rejected before Durable Object access");
        }
      })
    }
  };
  const guidance = "앞선 대답에서 더 알고 싶은 점을 이어서 물어보세요";
  const res = await worker.fetch(new Request("https://example.com/api/chat", {
    method: "POST",
    body: JSON.stringify({
      sessionId: "student-1",
      sessionSecret: "secret-1",
      studentName: "민준",
      message: guidance.repeat(10) + guidance.slice(0, 12)
    })
  }), env);
  const payload = await res.json();

  assert.equal(res.status, 400);
  assert.equal(payload.error, "invalid_message");
  assert.equal(roomCalls, 0);
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
      list: async ({ prefix }) => new Map(
        [...storage].filter(([key]) => key.startsWith(prefix))
      ),
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
      at: new Date().toISOString()
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

test("ClassroomRoom keeps student transcript alongside legacy telemetry", async () => {
  const storage = new Map();
  const room = new ClassroomRoom({
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => storage.set(key, value),
      list: async ({ prefix }) => new Map(
        [...storage].filter(([key]) => key.startsWith(prefix))
      ),
      delete: async (key) => {
        for (const item of Array.isArray(key) ? key : [key]) storage.delete(item);
      }
    }
  });

  await room.fetch(new Request("https://room.local/event", {
    method: "POST",
    body: JSON.stringify({
      type: "chat_turn",
      sessionId: "student-1",
      studentName: "민준",
      studentMessage: "명량해전에서 몇 척으로 싸웠어?",
      studentVisibleAnswer: "조선 수군은 적은 수의 배로 해협의 물살을 활용했다.",
      at: new Date().toISOString()
    })
  }));
  storage.set("events", Array.from({ length: 1000 }, (_, index) => ({
    type: "student_heartbeat",
    sessionId: `other-${index}`,
    at: new Date().toISOString()
  })));

  const history = await room.fetch(
    new Request("https://room.local/history?sessionId=student-1")
  );
  const transcript = await history.json();
  assert.equal(transcript.length, 1);
  assert.equal(transcript[0].turn, 1);
  assert.equal(transcript[0].studentMessage, "명량해전에서 몇 척으로 싸웠어?");
  assert.equal(transcript[0].studentVisibleAnswer, "조선 수군은 적은 수의 배로 해협의 물살을 활용했다.");

  const snapshot = await room.fetch(new Request("https://room.local/snapshot"));
  const snapshotBody = await snapshot.json();
  const restoredTurn = snapshotBody.events.find((event) =>
    event.type === "chat_turn" && event.sessionId === "student-1"
  );
  assert.equal(restoredTurn.studentMessage, "명량해전에서 몇 척으로 싸웠어?");
  assert.equal(restoredTurn.studentVisibleAnswer, "조선 수군은 적은 수의 배로 해협의 물살을 활용했다.");
});

test("ClassroomRoom retains telemetry beyond 1000 events without time expiry", async () => {
  const storage = new Map();
  const room = createStoredRoom(storage);

  for (let index = 0; index < 1005; index += 1) {
    await room.fetch(new Request("https://room.local/event?ttlHours=1", {
      method: "POST",
      body: JSON.stringify({
        type: "student_joined",
        sessionId: `student-${index}`,
        studentName: `학생 ${index}`,
        at: new Date(Date.UTC(2020, 0, 1, 0, 0, index)).toISOString()
      })
    }));
  }

  const read = await room.fetch(new Request("https://room.local/events?ttlHours=1"));
  const events = await read.json();
  assert.equal(events.length, 1005);
  assert.equal(events[0].sessionId, "student-0");
  assert.equal(events[1004].sessionId, "student-1004");
});

test("ClassroomRoom broadcasts heartbeat presence without evicting audit events", async () => {
  const storage = new Map([
    ["events", [{
      type: "chat_turn",
      sessionId: "student-1",
      studentName: "민준",
      studentMessage: "질문",
      studentVisibleAnswer: "답변",
      teacherAudit: { preflight: { verdict: "PASS" } },
      at: new Date().toISOString()
    }]],
    ["studentSessions", {
      "student-1": {
        studentName: "민준",
        joinedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      }
    }]
  ]);
  const room = new ClassroomRoom({
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => storage.set(key, value),
      list: async ({ prefix }) => new Map(
        [...storage].filter(([key]) => key.startsWith(prefix))
      ),
      delete: async () => {}
    }
  });

  await room.fetch(new Request("https://room.local/event", {
    method: "POST",
    body: JSON.stringify({
      type: "student_heartbeat",
      sessionId: "student-1",
      studentName: "민준",
      at: new Date().toISOString()
    })
  }));

  assert.equal(storage.get("events").length, 1);
  assert.equal(storage.get("events")[0].type, "chat_turn");
  const snapshot = await room.fetch(new Request("https://room.local/snapshot"));
  const snapshotBody = await snapshot.json();
  assert.equal(snapshotBody.events.some((event) => event.type === "student_heartbeat"), true);
});

test("ClassroomRoom purge deletes more than 128 transcripts without deleting config", async () => {
  const storage = new Map([
    ["config", { level: 2, responseMode: "experiment" }],
    ["event:0000000000000001:event-1", {
      eventId: "event-1",
      type: "student_joined",
      sessionId: "student-1"
    }],
    ...Array.from({ length: 129 }, (_, index) => [
      `transcript:student-${index}`,
      [{ turn: 1, studentMessage: "질문", studentVisibleAnswer: "답변" }]
    ])
  ]);
  const deleteBatches = [];
  const room = new ClassroomRoom({
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => storage.set(key, value),
      list: async ({ prefix }) => new Map(
        [...storage].filter(([key]) => key.startsWith(prefix))
      ),
      delete: async (key) => {
        const keys = Array.isArray(key) ? key : [key];
        deleteBatches.push(keys);
        for (const item of keys) storage.delete(item);
      }
    }
  });

  const purge = await room.fetch(new Request("https://room.local/purge", {
    method: "POST"
  }));
  assert.equal(purge.status, 200);
  assert.equal([...storage.keys()].some((key) => key.startsWith("transcript:")), false);
  assert.equal([...storage.keys()].some((key) => key.startsWith("event:")), false);
  assert.deepEqual(storage.get("config"), { level: 2, responseMode: "experiment" });
  assert.equal(deleteBatches.some((batch) => batch.length > 128), false);
});

test("ClassroomRoom keeps the complete transcript beyond 20 turns", async () => {
  const storage = new Map();
  const room = createStoredRoom(storage);

  for (let index = 1; index <= 25; index += 1) {
    await room.fetch(new Request("https://room.local/event", {
      method: "POST",
      body: JSON.stringify({
        type: "chat_turn",
        sessionId: "student-long",
        studentName: "민준",
        studentMessage: `질문 ${index}`,
        studentVisibleAnswer: `답변 ${index}`,
        at: new Date(Date.UTC(2026, 6, 13, 0, 0, index)).toISOString()
      })
    }));
  }

  const history = await room.fetch(new Request(
    "https://room.local/history?sessionId=student-long"
  ));
  const turns = await history.json();
  assert.equal(turns.length, 25);
  assert.equal(turns[0].studentMessage, "질문 1");
  assert.equal(turns[24].studentVisibleAnswer, "답변 25");
});

test("ClassroomRoom queues repeated requests per student while allowing different students concurrently", async () => {
  const storage = new Map();
  const room = createStoredRoom(storage);

  const first = await postRoomJson(room, "/chat-queue/acquire", {
    sessionId: "student-1",
    ticketId: "ticket-1",
    maxConcurrent: 40,
    maxStartsPerMinute: 45
  });
  const sameStudent = await postRoomJson(room, "/chat-queue/acquire", {
    sessionId: "student-1",
    ticketId: "ticket-2",
    maxConcurrent: 40,
    maxStartsPerMinute: 45
  });
  const otherStudent = await postRoomJson(room, "/chat-queue/acquire", {
    sessionId: "student-2",
    ticketId: "ticket-3",
    maxConcurrent: 40,
    maxStartsPerMinute: 45
  });

  assert.equal(first.acquired, true);
  assert.equal(sameStudent.acquired, false);
  assert.equal(sameStudent.terminal, false);
  assert.equal(otherStudent.acquired, true);

  await postRoomJson(room, "/chat-queue/release", {
    sessionId: "student-1",
    ticketId: "ticket-1"
  });
  const resumed = await postRoomJson(room, "/chat-queue/acquire", {
    sessionId: "student-1",
    ticketId: "ticket-2",
    maxConcurrent: 40,
    maxStartsPerMinute: 45
  });
  assert.equal(resumed.acquired, true);
});

test("ClassroomRoom keeps per-student rate excess in the queue instead of starting OpenAI work", async () => {
  const storage = new Map();
  const room = createStoredRoom(storage);

  const first = await postRoomJson(room, "/chat-queue/acquire", {
    sessionId: "student-rate",
    ticketId: "rate-1",
    maxConcurrent: 40,
    maxStartsPerMinute: 45,
    maxStartsPerSession: 1
  });
  await postRoomJson(room, "/chat-queue/release", {
    sessionId: "student-rate",
    ticketId: "rate-1"
  });
  const queued = await postRoomJson(room, "/chat-queue/acquire", {
    sessionId: "student-rate",
    ticketId: "rate-2",
    maxConcurrent: 40,
    maxStartsPerMinute: 45,
    maxStartsPerSession: 1
  });

  assert.equal(first.acquired, true);
  assert.equal(queued.acquired, false);
  assert.equal(queued.terminal, false);
  assert.equal(queued.position, 1);
  assert.ok(queued.retryAfterMs > 50000);
});

test("ClassroomRoom bounds an individual student's queue and deletes only the selected student", async () => {
  const storage = new Map([
    ["studentSessions", {
      "student-1": { sessionSecret: "one", studentName: "민준" },
      "student-2": { sessionSecret: "two", studentName: "서아" }
    }],
    ["events", [
      { type: "chat_turn", sessionId: "student-1" },
      { type: "chat_turn", sessionId: "student-2" }
    ]],
    ["rateLimits", { "student-1": [1], "student-2": [2] }],
    ["transcript:student-1", [{ turn: 1 }]],
    ["transcript:student-2", [{ turn: 1 }]]
  ]);
  const room = createStoredRoom(storage);

  for (const ticketId of ["ticket-1", "ticket-2", "ticket-3"]) {
    await postRoomJson(room, "/chat-queue/acquire", {
      sessionId: "student-1",
      ticketId,
      maxConcurrent: 1,
      maxStartsPerMinute: 45,
      maxQueuedPerSession: 3
    });
  }
  const overflow = await postRoomJson(room, "/chat-queue/acquire", {
    sessionId: "student-1",
    ticketId: "ticket-4",
    maxConcurrent: 1,
    maxStartsPerMinute: 45,
    maxQueuedPerSession: 3
  });
  assert.equal(overflow.error, "student_queue_full");

  const deleted = await postRoomJson(room, "/student-delete", { sessionId: "student-1" });
  assert.equal(deleted.ok, true);
  assert.equal(storage.get("studentSessions")["student-1"], undefined);
  assert.ok(storage.get("studentSessions")["student-2"]);
  assert.deepEqual(storage.get("events"), [{ type: "chat_turn", sessionId: "student-2" }]);
  assert.equal(storage.has("transcript:student-1"), false);
  assert.equal(storage.has("transcript:student-2"), true);
  assert.deepEqual(storage.get("rateLimits"), { "student-2": [2] });
  assert.equal(storage.get("chatQueue").waiting.some((item) => item.sessionId === "student-1"), false);
  assert.ok(storage.get("deletedSessions")["student-1"]);

  const reused = await postRoomJson(room, "/session-register", {
    sessionId: "student-1",
    sessionSecret: "one",
    studentName: "민준"
  });
  assert.equal(reused.status, 410);
  assert.equal(reused.error, "session_deleted");

  const rejoined = await postRoomJson(room, "/session-register", {
    sessionId: "student-1-new",
    sessionSecret: "new-secret",
    studentName: "민준"
  });
  assert.equal(rejoined.ok, true);
  assert.equal(storage.get("studentSessions")["student-1-new"].studentName, "민준");
});

test("ClassroomRoom stores independent response mode and Level overrides per student", async () => {
  const storage = new Map([
    ["studentSessions", {
      "student-1": { sessionSecret: "one", studentName: "민준" },
      "student-2": { sessionSecret: "two", studentName: "서아" }
    }]
  ]);
  const room = createStoredRoom(storage);

  const first = await postRoomJson(room, "/student-config", {
    sessionId: "student-1",
    responseMode: "truth",
    level: 4
  });
  const second = await postRoomJson(room, "/student-config", {
    sessionId: "student-2",
    responseMode: "mixed",
    level: 3,
    falseDensity: "all"
  });
  const firstRead = await room.fetch(
    new Request("https://room.local/student-config?sessionId=student-1")
  );
  const secondRead = await room.fetch(
    new Request("https://room.local/student-config?sessionId=student-2")
  );

  assert.equal(first.responseMode, "truth");
  assert.equal(second.responseMode, "mixed");
  assert.deepEqual(await firstRead.json(), {
    responseMode: "truth",
    level: 4,
    falseDensity: "single",
    updatedAt: first.updatedAt
  });
  assert.deepEqual(await secondRead.json(), {
    responseMode: "mixed",
    level: 3,
    falseDensity: "all",
    updatedAt: second.updatedAt
  });
});

test("ClassroomRoom verified-answer cache coalesces identical generation work", async () => {
  const storage = new Map();
  const room = createStoredRoom(storage);

  const owner = await postRoomJson(room, "/answer-cache/acquire", {
    key: "same-question",
    ticketId: "ticket-1"
  });
  const waiter = await postRoomJson(room, "/answer-cache/acquire", {
    key: "same-question",
    ticketId: "ticket-2"
  });

  assert.equal(owner.status, "owner");
  assert.equal(waiter.status, "waiting");

  const stored = await postRoomJson(room, "/answer-cache/put", {
    key: "same-question",
    ticketId: "ticket-1",
    value: {
      answer: "검증된 답변",
      audit: {
        preflight: { approvedForStudent: true },
        provider: { name: "openai" }
      }
    }
  });
  const hit = await postRoomJson(room, "/answer-cache/acquire", {
    key: "same-question",
    ticketId: "ticket-2"
  });

  assert.equal(stored.ok, true);
  assert.equal(hit.status, "hit");
  assert.equal(hit.entry.answer, "검증된 답변");
  assert.equal(hit.entry.audit.preflight.approvedForStudent, true);
});

function createStoredRoom(storage) {
  return new ClassroomRoom({
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => storage.set(key, value),
      list: async ({ prefix }) => new Map(
        [...storage].filter(([key]) => key.startsWith(prefix))
      ),
      delete: async (key) => {
        for (const item of Array.isArray(key) ? key : [key]) storage.delete(item);
      }
    }
  });
}

async function postRoomJson(room, path, body) {
  const response = await room.fetch(new Request(`https://room.local${path}`, {
    method: "POST",
    body: JSON.stringify(body)
  }));
  return await response.json();
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" }
  });
}
