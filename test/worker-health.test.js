import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

test("/api/health returns safe deployment metadata without secrets", async () => {
  const res = await worker.fetch(new Request("https://example.com/api/health"), {
    OPENAI_API_KEY: "secret-openai-key",
    OPENAI_MODEL: "gpt-test-history",
    TEACHER_TOKEN: "secret-teacher-token",
    DEFAULT_FALSE_LEVEL: "3",
    CHAT_RATE_LIMIT_PER_MINUTE: "9",
    EVENT_TTL_HOURS: "6",
    OPENAI_TIMEOUT_MS: "4321",
    ROOM: {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => new Response("{}") })
    }
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.schemaVersion, "health/v1");
  assert.equal(body.openaiConfigured, true);
  assert.equal(body.openaiModel, "gpt-test-history");
  assert.equal(body.teacherProtected, true);
  assert.equal(body.defaultFalseLevel, 3);
  assert.equal(body.chatRateLimitPerMinute, 9);
  assert.equal(body.eventTtlHours, 6);
  assert.equal(body.openaiTimeoutMs, 4321);
  assert.equal(JSON.stringify(body).includes("secret-openai-key"), false);
  assert.equal(JSON.stringify(body).includes("secret-teacher-token"), false);
  assert.equal(body.endpoints.fullEvaluationSet, "/api/evaluation-set/full");
  assert.equal(body.endpoints.debriefCsv, "/api/debrief.csv");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.match(res.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(res.headers.get("content-security-policy"), /object-src 'none'/);
  assert.equal(res.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
});

test("not found responses include common security headers", async () => {
  const res = await worker.fetch(new Request("https://example.com/no-such-route"), {
    ROOM: {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => new Response("{}") })
    }
  });

  assert.equal(res.status, 404);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(res.headers.get("content-security-policy"), /frame-ancestors 'none'/);
});
