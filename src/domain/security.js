export const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
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

export function isTeacherAuthorized(request, env) {
  const token = env.TEACHER_TOKEN;
  if (!token) return true;
  const url = new URL(request.url);
  const supplied = request.headers.get("x-teacher-token") || url.searchParams.get("token");
  return supplied === token;
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

export function rateLimitDecision({ timestamps = [], now = Date.now(), limit = 12, windowMs = 60000 }) {
  const active = timestamps.filter((timestamp) => now - timestamp < windowMs);
  const allowed = active.length < limit;
  return {
    allowed,
    retryAfterMs: allowed ? 0 : Math.max(0, windowMs - (now - active[0])),
    timestamps: allowed ? [...active, now] : active
  };
}
