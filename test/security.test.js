import test from "node:test";
import assert from "node:assert/strict";
import { isTeacherAuthorized, rateLimitDecision } from "../src/domain/security.js";

test("isTeacherAuthorized는 TEACHER_TOKEN이 없으면 통과시킨다", () => {
  const request = new Request("https://example.com/teacher");
  assert.equal(isTeacherAuthorized(request, {}), true);
});

test("isTeacherAuthorized는 query token과 header token을 허용한다", () => {
  const queryRequest = new Request("https://example.com/teacher?token=secret");
  const headerRequest = new Request("https://example.com/api/export", {
    headers: { "x-teacher-token": "secret" }
  });

  assert.equal(isTeacherAuthorized(queryRequest, { TEACHER_TOKEN: "secret" }), true);
  assert.equal(isTeacherAuthorized(headerRequest, { TEACHER_TOKEN: "secret" }), true);
});

test("isTeacherAuthorized는 잘못된 token을 거부한다", () => {
  const request = new Request("https://example.com/teacher?token=wrong");
  assert.equal(isTeacherAuthorized(request, { TEACHER_TOKEN: "secret" }), false);
});

test("rateLimitDecision은 window 안의 요청 수를 제한한다", () => {
  const allowed = rateLimitDecision({
    timestamps: [0, 1000],
    now: 2000,
    limit: 3,
    windowMs: 60000
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.timestamps.length, 3);

  const denied = rateLimitDecision({
    timestamps: [0, 1000, 2000],
    now: 3000,
    limit: 3,
    windowMs: 60000
  });
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterMs > 0);
});
