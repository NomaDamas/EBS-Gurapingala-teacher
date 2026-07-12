export const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' ws: wss:",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join("; "),
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};

const TEACHER_SESSION_COOKIE = "ebs_teacher_session";

export function isTeacherAuthorized(request, env) {
  const token = env.TEACHER_TOKEN;
  if (!token) return env.ALLOW_INSECURE_TEACHER === "true";
  const url = new URL(request.url);
  const supplied =
    request.headers.get("x-teacher-token") ||
    decodeTeacherWebSocketProtocol(request.headers.get("sec-websocket-protocol")) ||
    readCookie(request.headers.get("cookie"), TEACHER_SESSION_COOKIE) ||
    (url.pathname === "/teacher" ? url.searchParams.get("token") : "");
  return supplied === token;
}

export function teacherSessionCookie(token) {
  return `${TEACHER_SESSION_COOKIE}=${encodeURIComponent(String(token))}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict`;
}

export function encodeTeacherWebSocketProtocol(token) {
  if (!token) return "";
  const encoded = btoa(String(token)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `teacher-token.${encoded}`;
}

export function decodeTeacherWebSocketProtocol(value) {
  const selected = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .find((item) => item.startsWith("teacher-token."));
  if (!selected) return "";
  const encoded = selected.slice("teacher-token.".length).replace(/-/g, "+").replace(/_/g, "/");
  const padded = encoded + "=".repeat((4 - encoded.length % 4) % 4);
  try {
    return atob(padded);
  } catch {
    return "";
  }
}

export function unauthorized() {
  return new Response("Teacher token required", {
    status: 401,
    headers: {
      ...SECURITY_HEADERS,
      "content-type": "text/plain; charset=utf-8",
      "www-authenticate": "Bearer"
    }
  });
}

function readCookie(cookieHeader, name) {
  const prefix = `${name}=`;
  const value = String(cookieHeader || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export function rateLimitDecision({ timestamps = [], now = Date.now(), limit = 12, windowMs = 60000 }) {
  const active = timestamps.filter((timestamp) => now - timestamp < windowMs);
  const allowed = active.length < limit;
  return {
    allowed,
    retryAfterMs: allowed ? 0 : Math.max(0, windowMs - (now - active[0])),
    timestamps: allowed ? [...active, now] : active
  };
}
