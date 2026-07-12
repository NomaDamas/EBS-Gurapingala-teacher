import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeTeacherWebSocketProtocol,
  encodeTeacherWebSocketProtocol,
  isTeacherAuthorized,
  rateLimitDecision,
  teacherSessionCookie,
  unauthorized
} from "../src/domain/security.js";

test("isTeacherAuthorized는 TEACHER_TOKEN 누락 시 기본적으로 fail-closed 한다", () => {
  const request = new Request("https://example.com/teacher");
  assert.equal(isTeacherAuthorized(request, {}), false);
  assert.equal(isTeacherAuthorized(request, { ALLOW_INSECURE_TEACHER: "false" }), false);
  assert.equal(isTeacherAuthorized(request, { ALLOW_INSECURE_TEACHER: "true" }), true);
});

test("isTeacherAuthorized는 teacher page query token, API header, WebSocket protocol token을 허용한다", () => {
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

test("isTeacherAuthorized는 teacher API query token을 거부한다", () => {
  const exportRequest = new Request("https://example.com/api/export?token=secret");
  const fullEvaluationRequest = new Request("https://example.com/api/evaluation-set/full?token=secret");
  const websocketRequest = new Request("https://example.com/ws/teacher?token=secret");

  assert.equal(isTeacherAuthorized(exportRequest, { TEACHER_TOKEN: "secret" }), false);
  assert.equal(isTeacherAuthorized(fullEvaluationRequest, { TEACHER_TOKEN: "secret" }), false);
  assert.equal(isTeacherAuthorized(websocketRequest, { TEACHER_TOKEN: "secret" }), false);
});

test("교사 세션 쿠키는 새로고침과 API 인증을 유지한다", () => {
  const cookie = teacherSessionCookie("secret token");
  const request = new Request("https://example.com/api/export", {
    headers: { cookie: cookie.split(";")[0] }
  });

  assert.equal(isTeacherAuthorized(request, { TEACHER_TOKEN: "secret token" }), true);
  assert.match(cookie, /^ebs_teacher_session=secret%20token;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
});

test("isTeacherAuthorized는 잘못된 token을 거부한다", () => {
  const request = new Request("https://example.com/teacher?token=wrong");
  assert.equal(isTeacherAuthorized(request, { TEACHER_TOKEN: "secret" }), false);
});

test("unauthorized 응답은 공통 보안 헤더를 포함한다", () => {
  const response = unauthorized();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
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
