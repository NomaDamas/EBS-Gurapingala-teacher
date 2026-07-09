import { normalizeLevel } from "./domain/misinfo-policy.js";
import { generateAuditedAnswer } from "./domain/llm-provider.js";
import { EVALUATION_SET_50 } from "./domain/evaluation-set.js";
import { buildDebriefCsv, buildDebriefRows, buildExportPayload } from "./domain/session-export.js";
import { buildSessionContext } from "./domain/session-context.js";
import { isTeacherAuthorized, rateLimitDecision, unauthorized } from "./domain/security.js";
import { studentHtml } from "./ui/student.js";
import { teacherHtml } from "./ui/teacher.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const roomId = normalizeRoomId(url.searchParams.get("room") || env.DEFAULT_ROOM_ID);
    const room = getRoom(env, roomId);

    if (url.pathname === "/") {
      return html(studentHtml);
    }
    if (url.pathname === "/teacher") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      return html(teacherHtml);
    }
    if (url.pathname === "/api/evaluation-set") {
      return json({ items: EVALUATION_SET_50 });
    }
    if (url.pathname === "/api/health") {
      return json(buildHealthPayload(env));
    }
    if (url.pathname === "/api/export") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      const events = await readEvents(room, env);
      return json({
        ...buildExportPayload(events),
        roomId
      });
    }
    if (url.pathname === "/api/debrief") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      const events = await readEvents(room, env);
      return json({
        schemaVersion: "debrief-table/v1",
        generatedAt: new Date().toISOString(),
        rows: buildDebriefRows(events)
      });
    }
    if (url.pathname === "/api/debrief.csv") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      const events = await readEvents(room, env);
      return csv(buildDebriefCsv(events), "debrief-table.csv");
    }
    if (url.pathname === "/api/purge" && request.method === "POST") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      await room.fetch("https://room.local/purge", { method: "POST" });
      return json({ ok: true });
    }
    if (url.pathname === "/api/join" && request.method === "POST") {
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      const validation = validateStudentPayload(parsed.body, { requireMessage: false });
      if (validation.error) return validation.error;
      const body = validation.value;
      await room.fetch(roomEventUrl(env), {
        method: "POST",
        body: JSON.stringify({
          type: "student_joined",
          roomId,
          sessionId: body.sessionId,
          studentName: body.studentName,
          at: new Date().toISOString()
        })
      });
      return json({ ok: true });
    }
    if (url.pathname === "/api/heartbeat" && request.method === "POST") {
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      const validation = validateStudentPayload(parsed.body, { requireMessage: false });
      if (validation.error) return validation.error;
      const body = validation.value;
      await room.fetch(roomEventUrl(env), {
        method: "POST",
        body: JSON.stringify({
          type: "student_heartbeat",
          roomId,
          sessionId: body.sessionId,
          studentName: body.studentName,
          at: new Date().toISOString()
        })
      });
      return json({ ok: true });
    }
    if (url.pathname === "/api/chat" && request.method === "POST") {
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      const validation = validateStudentPayload(parsed.body, { requireMessage: true });
      if (validation.error) return validation.error;
      const body = validation.value;
      const rateLimit = await checkRateLimit(room, body.sessionId, env);
      if (!rateLimit.allowed) {
        return json({
          error: "rate_limited",
          retryAfterMs: rateLimit.retryAfterMs
        }, 429);
      }
      const config = await readConfig(room, env);
      const events = await readEvents(room, env);
      const sessionContext = buildSessionContext(events, body.sessionId);
      const level = normalizeLevel(config.level || env.DEFAULT_FALSE_LEVEL);
      const persona = config.persona || env.DEFAULT_PERSONA;
      const result = await generateAuditedAnswer({
        message: body.message,
        level,
        persona,
        turnIndex: sessionContext.turnIndex,
        recentMessages: sessionContext.recentMessages,
        env
      });
      const { audit, answer } = result;

      if (!result.shouldSendToStudent) {
        return json({ error: "Preflight failed", audit }, 422);
      }

      await room.fetch(roomEventUrl(env), {
        method: "POST",
        body: JSON.stringify({
          type: "chat_turn",
          roomId,
          sessionId: body.sessionId,
          studentName: body.studentName,
          studentMessage: body.message,
          studentVisibleAnswer: answer,
          teacherAudit: audit,
          at: new Date().toISOString()
        })
      });

      return json({
        answer,
        telemetry: "sent",
        roomId
      });
    }
    if (url.pathname === "/ws/teacher") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      return room.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  }
};

export class ClassroomRoom {
  constructor(state) {
    this.state = state;
    this.sessions = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ws/teacher") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") {
        return new Response("Expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sessions.add(server);
      this.sendSnapshot(server);
      server.addEventListener("message", async (event) => {
        const data = safeJson(event.data);
        if (data?.type === "teacher_config") {
          const nextLevel = normalizeLevel(data.level);
          const nextPersona = sanitizeText(data.persona || "교육용 역사 챗봇", 240);
          await this.state.storage.put("config", {
            level: nextLevel,
            persona: nextPersona,
            updatedAt: new Date().toISOString()
          });
          this.broadcast({
            type: "teacher_config_updated",
            sessionId: "teacher",
            studentName: "teacher",
            level: nextLevel,
            persona: nextPersona,
            config: {
              level: nextLevel,
              persona: nextPersona
            },
            at: new Date().toISOString()
          });
        }
      });
      server.addEventListener("close", () => this.sessions.delete(server));
      server.addEventListener("error", () => this.sessions.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/event" && request.method === "POST") {
      const event = await request.json();
      await this.recordEvent(event, Number(url.searchParams.get("ttlHours") || 24));
      this.broadcast(event);
      return new Response("ok");
    }
    if (url.pathname === "/rate-limit" && request.method === "POST") {
      const body = await request.json();
      return json(await this.checkRateLimit(body.sessionId, body.limit));
    }
    if (url.pathname === "/events") {
      return json(await this.readEvents(Number(url.searchParams.get("ttlHours") || 24)));
    }
    if (url.pathname === "/purge" && request.method === "POST") {
      await this.state.storage.delete("events");
      await this.state.storage.delete("rateLimits");
      this.broadcast({
        type: "events_purged",
        sessionId: "teacher",
        studentName: "teacher",
        at: new Date().toISOString()
      });
      return new Response("ok");
    }
    if (url.pathname === "/config") {
      const config = await this.state.storage.get("config");
      return json(config || {});
    }
    return new Response("room not found", { status: 404 });
  }

  broadcast(event) {
    const payload = JSON.stringify(event);
    for (const socket of this.sessions) {
      try {
        socket.send(payload);
      } catch {
        this.sessions.delete(socket);
      }
    }
  }

  async recordEvent(event, ttlHours = 24) {
    const events = await this.readEvents(ttlHours);
    events.push(event);
    await this.state.storage.put("events", events.slice(-1000));
  }

  async readEvents(ttlHours = 24) {
    const events = await this.state.storage.get("events") || [];
    const pruned = events.filter((event) => {
      const eventTime = event.at ? Date.parse(event.at) : Date.now();
      return Number.isFinite(eventTime) && Date.now() - eventTime <= ttlHours * 60 * 60 * 1000;
    });
    if (pruned.length !== events.length) await this.state.storage.put("events", pruned);
    return pruned;
  }

  async checkRateLimit(sessionId, limit) {
    const key = String(sessionId || "anonymous");
    const rateLimits = await this.state.storage.get("rateLimits") || {};
    const decision = rateLimitDecision({
      timestamps: rateLimits[key] || [],
      limit: Number(limit) || 12
    });
    rateLimits[key] = decision.timestamps;
    await this.state.storage.put("rateLimits", rateLimits);
    return {
      allowed: decision.allowed,
      retryAfterMs: decision.retryAfterMs
    };
  }

  async sendSnapshot(socket) {
    try {
      const events = await this.readEvents();
      const config = await this.state.storage.get("config") || null;
      socket.send(JSON.stringify({
        type: "snapshot",
        sessionId: "teacher",
        studentName: "teacher",
        config,
        events,
        at: new Date().toISOString()
      }));
    } catch {
      this.sessions.delete(socket);
    }
  }
}

function getRoom(env, roomId = "default-classroom") {
  const id = env.ROOM.idFromName(normalizeRoomId(roomId));
  return env.ROOM.get(id);
}

function normalizeRoomId(value) {
  return String(value || "default-classroom")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "default-classroom";
}

async function readConfig(room, env) {
  const res = await room.fetch("https://room.local/config");
  const config = await res.json();
  return {
    level: config.level || env.DEFAULT_FALSE_LEVEL,
    persona: config.persona || env.DEFAULT_PERSONA
  };
}

async function readEvents(room, env) {
  const res = await room.fetch(`https://room.local/events?ttlHours=${encodeURIComponent(env.EVENT_TTL_HOURS || 24)}`);
  return await res.json();
}

function roomEventUrl(env) {
  return `https://room.local/event?ttlHours=${encodeURIComponent(env.EVENT_TTL_HOURS || 24)}`;
}

function buildHealthPayload(env) {
  return {
    schemaVersion: "health/v1",
    ok: true,
    provider: env.OPENAI_API_KEY && env.LLM_PROVIDER !== "rules" ? "openai" : "rules",
    openaiConfigured: Boolean(env.OPENAI_API_KEY),
    teacherProtected: Boolean(env.TEACHER_TOKEN),
    defaultFalseLevel: Number(env.DEFAULT_FALSE_LEVEL || 2),
    chatRateLimitPerMinute: Number(env.CHAT_RATE_LIMIT_PER_MINUTE || 12),
    eventTtlHours: Number(env.EVENT_TTL_HOURS || 24),
    defaultRoomId: normalizeRoomId(env.DEFAULT_ROOM_ID),
    endpoints: {
      student: "/",
      teacher: "/teacher",
      evaluationSet: "/api/evaluation-set",
      exportJson: "/api/export",
      debriefJson: "/api/debrief",
      debriefCsv: "/api/debrief.csv",
      purge: "/api/purge"
    }
  };
}

async function checkRateLimit(room, sessionId, env) {
  const res = await room.fetch("https://room.local/rate-limit", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      limit: Number(env.CHAT_RATE_LIMIT_PER_MINUTE || 12)
    })
  });
  return await res.json();
}

function html(body) {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: JSON_HEADERS
  });
}

function csv(body, filename) {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}

async function readJsonBody(request) {
  try {
    return { body: await request.json() };
  } catch {
    return {
      error: validationError("invalid_json", "요청 본문은 JSON이어야 합니다.")
    };
  }
}

function validateStudentPayload(body, { requireMessage }) {
  const sessionId = sanitizeText(body?.sessionId, 120);
  const studentName = sanitizeText(body?.studentName, 40);
  const message = sanitizeText(body?.message, 600);

  if (!sessionId) {
    return { error: validationError("missing_session_id", "세션 정보가 없습니다.") };
  }
  if (!studentName) {
    return { error: validationError("missing_student_name", "이름을 입력해야 합니다.") };
  }
  if (requireMessage && !message) {
    return { error: validationError("missing_message", "질문을 입력해야 합니다.") };
  }
  if (String(body?.sessionId || "").length > 120) {
    return { error: validationError("session_id_too_long", "세션 정보가 너무 깁니다.") };
  }
  if (String(body?.studentName || "").length > 40) {
    return { error: validationError("student_name_too_long", "이름은 40자 이내로 입력해야 합니다.") };
  }
  if (requireMessage && String(body?.message || "").length > 600) {
    return { error: validationError("message_too_long", "질문은 600자 이내로 입력해야 합니다.") };
  }

  return {
    value: {
      sessionId,
      studentName,
      ...(requireMessage ? { message } : {})
    }
  };
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function validationError(code, message) {
  return json({ error: code, message }, 400);
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
