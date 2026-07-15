import test from "node:test";
import assert from "node:assert/strict";
import worker, { resolveRoomStorageId } from "../src/worker.js";

test("/api/health returns safe deployment metadata without secrets", async () => {
  const res = await worker.fetch(new Request("https://example.com/api/health"), {
    OPENAI_API_KEY: "secret-openai-key",
    OPENAI_MODEL: "gpt-test-history",
    OPENAI_VERIFIER_MODEL: "gpt-test-verifier",
    OPENAI_REASONING_EFFORT: "none",
    OPENAI_VERIFIER_REASONING_EFFORT: "low",
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
  assert.equal(body.openaiVerifierModel, "gpt-test-verifier");
  assert.equal(body.openaiReasoningEffort, "none");
  assert.equal(body.openaiVerifierReasoningEffort, "low");
  assert.equal(body.strictDbFastPath, false);
  assert.equal(body.teacherProtected, true);
  assert.equal(body.defaultFalseLevel, 3);
  assert.equal(body.defaultFalseDensity, "single");
  assert.equal(body.chatRateLimitPerMinute, 9);
  assert.equal(body.eventRetentionMode, "manual");
  assert.equal(body.eventTtlHours, 0);
  assert.equal(body.openaiTimeoutMs, 4321);
  assert.equal(JSON.stringify(body).includes("secret-openai-key"), false);
  assert.equal(JSON.stringify(body).includes("secret-teacher-token"), false);
  assert.equal(body.endpoints.fullEvaluationSet, "/api/evaluation-set/full");
  assert.equal(body.endpoints.debriefCsv, "/api/debrief.csv");
  assert.equal(body.endpoints.transcriptsJson, "/api/transcripts");
  assert.equal(body.endpoints.transcriptsCsv, "/api/transcripts.csv");
  assert.equal(body.roomStorageAliases["3-5"], "dev");
  assert.equal(body.roomStorageAliases["3-1"], "2026-07-16-3-1");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.match(res.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(res.headers.get("content-security-policy"), /object-src 'none'/);
  assert.equal(res.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
});

test("class-name room URLs retain the existing filming storage", () => {
  assert.equal(resolveRoomStorageId("3-5"), "dev");
  assert.equal(resolveRoomStorageId("dev"), "dev");
  assert.equal(resolveRoomStorageId("2026-07-13-3-5"), "dev");
  assert.equal(resolveRoomStorageId("3-1"), "2026-07-16-3-1");
  assert.equal(resolveRoomStorageId("2026-07-16-3-1"), "2026-07-16-3-1");
});

test("/api/health reports the strict DB LLM-complete-answer fast path when enabled", async () => {
  const res = await worker.fetch(new Request("https://example.com/api/health"), {
    STRICT_DB_FAST_PATH: "true",
    ROOM: {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => new Response("{}") })
    }
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.strictDbFastPath, true);
  assert.equal(body.strictDbAnswerGeneration, "llm-complete-answer");
  assert.equal(body.strictDbVerification, "independent-openai-verifier");
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
