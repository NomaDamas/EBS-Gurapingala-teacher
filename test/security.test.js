import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeTeacherWebSocketProtocol,
  encodeTeacherWebSocketProtocol,
  isTeacherAuthorized,
  rateLimitDecision,
  unauthorized
} from "../src/domain/security.js";

test("isTeacherAuthorized는 TEACHER_TOKEN이 없으면 통과시킨다", () => {
  const request = new Request("https://example.com/teacher");
  assert.equal(isTeacherAuthorized(request, {}), true);
});

test("isTeacherAuthorized는 query token과 header token을 허용한다", () => {
  const queryRequest = new Request("https://example.com/teacher?token=secret");
  const headerRequest = new Request("https://example.com/api/export", {
    headers: { "x-teacher-token": "secret" }
  });
  const websocketRequest = new Request("https://example.com/ws/teacher?room=classroom", {
    headers: { "sec-websocket-protocol": encodeTeacherWebSocketProtocol("secret") }
  });

  assert.equal(isTeacherAuthorized(queryRequest, { TEACHER_TOKEN: "secret" }), true);
  assert.equal(isTeacherAuthorized(headerRequest, { TEACHER_TOKEN: "secret" }), true);
  assert.equal(isTeacherAuthorized(websocketRequest, { TEACHER_TOKEN: "secret" }), true);
});

test("isTeacherAuthorized는 잘못된 token을 거부한다", () => {
  const request = new Request("https://example.com/teacher?token=wrong");
  assert.equal(isTeacherAuthorized(request, { TEACHER_TOKEN: "secret" }), false);
});

test("unauthorized 응답은 공통 보안 헤더를 포함한다", () => {
  const response = unauthorized();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
});

test("교사용 WebSocket token protocol은 URL query 없이 round-trip 된다", () => {
  const protocol = encodeTeacherWebSocketProtocol("secret-token_123");

  assert.match(protocol, /^teacher-token\.[A-Za-z0-9_-]+$/);
  assert.equal(decodeTeacherWebSocketProtocol(`chat, ${protocol}`), "secret-token_123");
  assert.equal(decodeTeacherWebSocketProtocol("teacher-token.invalid%%%"), "");
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
