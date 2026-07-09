import { normalizeLevel } from "./domain/misinfo-policy.js";
import { DEFAULT_OPENAI_MODEL, generateAuditedAnswer } from "./domain/llm-provider.js";
import { EVALUATION_SET_50, PUBLIC_EVALUATION_SET_50 } from "./domain/evaluation-set.js";
import { buildDebriefCsv, buildDebriefRows, buildExportPayload } from "./domain/session-export.js";
import { buildSessionContext } from "./domain/session-context.js";
import { SECURITY_HEADERS, isTeacherAuthorized, rateLimitDecision, unauthorized } from "./domain/security.js";
import { studentHtml } from "./ui/student.js";
import { teacherHtml } from "./ui/teacher.js";

const JSON_HEADERS = {
  ...SECURITY_HEADERS,
  "content-type": "application/json; charset=utf-8"
};
const FAIL_CLOSED_STUDENT_MESSAGE = "답변을 다시 점검해야 해. 질문을 한 번만 더 다르게 물어봐 줄래?";

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
      return json({ schemaVersion: "evaluation-set-public/v1", items: PUBLIC_EVALUATION_SET_50 });
    }
    if (url.pathname === "/api/evaluation-set/full") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      return json({ items: EVALUATION_SET_50 });
    }
    if (url.pathname === "/api/health") {
      return json(buildHealthPayload(env));
    }
    if (url.pathname === "/api/config") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      if (request.method === "GET") {
        return json(await readConfig(room, env));
      }
      if (request.method === "POST") {
        const parsed = await readJsonBody(request);
        if (parsed.error) return parsed.error;
        const updated = await writeConfig(room, parsed.body, env, roomId);
        return json(updated);
      }
      return json({ error: "method_not_allowed" }, 405);
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
        roomId,
        generatedAt: new Date().toISOString(),
        rows: buildDebriefRows(events)
      });
    }
    if (url.pathname === "/api/debrief.csv") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      const events = await readEvents(room, env);
      return csv(buildDebriefCsv(events), `${roomId}-debrief-table.csv`);
    }
    if (url.pathname === "/api/purge" && request.method === "POST") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      const purgeCheck = validatePurgeConfirmation(request, roomId);
      if (purgeCheck) return purgeCheck;
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
      const startedAtMs = Date.now();
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
      const latencyMs = Date.now() - startedAtMs;
      const studentAnswer = result.shouldSendToStudent ? answer : FAIL_CLOSED_STUDENT_MESSAGE;

      await room.fetch(roomEventUrl(env), {
        method: "POST",
        body: JSON.stringify({
          type: "chat_turn",
          roomId,
          sessionId: body.sessionId,
          studentName: body.studentName,
          studentMessage: body.message,
          studentVisibleAnswer: studentAnswer,
          blockedForStudent: !result.shouldSendToStudent,
          latencyMs,
          teacherAudit: audit,
          at: new Date().toISOString()
        })
      });

      return json({
        answer: studentAnswer,
        telemetry: "sent",
        roomId,
        latencyMs
      });
    }
    if (url.pathname === "/ws/teacher") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      return room.fetch(request);
    }
    return text("Not found", 404);
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
        return text("Expected websocket", 426);
      }
      const protocol = selectWebSocketProtocol(request);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sessions.add(server);
      this.sendSnapshot(server);
      server.addEventListener("message", async (event) => {
        const data = safeJson(event.data);
        if (data?.type === "teacher_config") {
          await this.updateConfig(data, normalizeRoomId(url.searchParams.get("room")));
        }
      });
      server.addEventListener("close", () => this.sessions.delete(server));
      server.addEventListener("error", () => this.sessions.delete(server));
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: protocol ? { "sec-websocket-protocol": protocol } : {}
      });
    }
    if (url.pathname === "/event" && request.method === "POST") {
      const event = await request.json();
      await this.recordEvent(event, Number(url.searchParams.get("ttlHours") || 24));
      this.broadcast(event);
      return text("ok");
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
      return text("ok");
    }
    if (url.pathname === "/config" && request.method === "POST") {
      return json(await this.updateConfig(await request.json(), normalizeRoomId(url.searchParams.get("room"))));
    }
    if (url.pathname === "/config") {
      const config = await this.state.storage.get("config");
      return json(config || {});
    }
    return text("room not found", 404);
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

  async updateConfig(data, roomId = "default-classroom") {
    const nextLevel = normalizeLevel(data.level);
    const nextPersona = sanitizeText(data.persona || "교육용 역사 챗봇", 240);
    const updatedAt = new Date().toISOString();
    const config = {
      level: nextLevel,
      persona: nextPersona,
      updatedAt
    };
    await this.state.storage.put("config", config);
    const event = {
      type: "teacher_config_updated",
      sessionId: "teacher",
      studentName: "teacher",
      roomId: normalizeRoomId(roomId),
      level: nextLevel,
      persona: nextPersona,
      config,
      at: updatedAt
    };
    await this.recordEvent(event);
    this.broadcast(event);
    return config;
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

async function writeConfig(room, body, env, roomId) {
  const res = await room.fetch(`https://room.local/config?room=${encodeURIComponent(roomId)}`, {
    method: "POST",
    body: JSON.stringify({
      level: body?.level || env.DEFAULT_FALSE_LEVEL,
      persona: body?.persona || env.DEFAULT_PERSONA
    })
  });
  return await res.json();
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
    openaiModel: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
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
      fullEvaluationSet: "/api/evaluation-set/full",
      config: "/api/config",
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
    headers: {
      ...SECURITY_HEADERS,
      "content-type": "text/html; charset=utf-8"
    }
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
      ...SECURITY_HEADERS,
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}

function text(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "content-type": "text/plain; charset=utf-8"
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
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function validationError(code, message) {
  return json({ error: code, message }, 400);
}

function validatePurgeConfirmation(request, roomId) {
  const confirmedRoom = normalizeOptionalRoomId(request.headers.get("x-purge-room") || "");
  if (confirmedRoom !== roomId) {
    return json({
      error: "purge_room_confirmation_required",
      message: "삭제하려는 room을 x-purge-room 헤더로 정확히 확인해야 합니다.",
      roomId
    }, 409);
  }
  return null;
}

function normalizeOptionalRoomId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function selectWebSocketProtocol(request) {
  return String(request.headers.get("sec-websocket-protocol") || "")
    .split(",")
    .map((item) => item.trim())
    .find((item) => item.startsWith("teacher-token.")) || "";
}
