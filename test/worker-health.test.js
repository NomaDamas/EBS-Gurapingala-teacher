import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

test("/api/health returns safe deployment metadata without secrets", async () => {
  const res = await worker.fetch(new Request("https://example.com/api/health"), {
    OPENAI_API_KEY: "secret-openai-key",
    TEACHER_TOKEN: "secret-teacher-token",
    DEFAULT_FALSE_LEVEL: "3",
    CHAT_RATE_LIMIT_PER_MINUTE: "9",
    EVENT_TTL_HOURS: "6",
    ROOM: {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => new Response("{}") })
    }
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.schemaVersion, "health/v1");
  assert.equal(body.openaiConfigured, true);
  assert.equal(body.teacherProtected, true);
  assert.equal(body.defaultFalseLevel, 3);
  assert.equal(body.chatRateLimitPerMinute, 9);
  assert.equal(body.eventTtlHours, 6);
  assert.equal(JSON.stringify(body).includes("secret-openai-key"), false);
  assert.equal(JSON.stringify(body).includes("secret-teacher-token"), false);
  assert.equal(body.endpoints.debriefCsv, "/api/debrief.csv");
});
