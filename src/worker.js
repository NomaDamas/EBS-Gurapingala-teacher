import { normalizeLevel, selectCaseForTurn } from "./domain/misinfo-policy.js";
import { DEFAULT_OPENAI_MODEL, generateAuditedAnswer, normalizeTimeoutMs } from "./domain/llm-provider.js";
import { generateTruthAnswer } from "./domain/truth-provider.js";
import { EVALUATION_SET_50, PUBLIC_EVALUATION_SET_50 } from "./domain/evaluation-set.js";
import { buildDebriefCsv, buildDebriefRows, buildExportPayload, redactSensitiveFields } from "./domain/session-export.js";
import { buildSessionContext } from "./domain/session-context.js";
import { SECURITY_HEADERS, isTeacherAuthorized, rateLimitDecision, unauthorized } from "./domain/security.js";
import { studentHtml } from "./ui/student.js";
import { teacherHtml } from "./ui/teacher.js";

const JSON_HEADERS = {
  ...SECURITY_HEADERS,
  "content-type": "application/json; charset=utf-8"
};
const FAIL_CLOSED_STUDENT_MESSAGE = "답변을 다시 점검해야 해. 질문을 한 번만 더 다르게 물어봐 줄래?";
const MAX_JSON_BODY_BYTES = 8 * 1024;
const CHAT_QUEUE_POLL_MS = 250;

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
        const teacherConfig = sanitizeTeacherConfig(parsed.body, env);
        if (teacherConfig.error) {
          await recordTeacherConfigRejection(room, env, roomId, teacherConfig.errorBody);
          return teacherConfig.error;
        }
        const updated = await writeConfig(room, teacherConfig.value, env, roomId);
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
    if (url.pathname === "/api/student" && request.method === "DELETE") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      const sessionId = sanitizeText(url.searchParams.get("sessionId"), 120);
      if (!sessionId) return validationError("missing_session_id", "삭제할 학생 세션이 없습니다.");
      const deleted = await room.fetch("https://room.local/student-delete", {
        method: "POST",
        body: JSON.stringify({ sessionId })
      });
      return json(await deleted.json(), deleted.status);
    }
    if (url.pathname === "/api/student-config" && request.method === "POST") {
      if (!isTeacherAuthorized(request, env)) return unauthorized();
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      const sessionId = sanitizeText(parsed.body?.sessionId, 120);
      if (!sessionId) return validationError("missing_session_id", "설정할 학생 세션이 없습니다.");
      const responseMode = normalizeStudentResponseMode(parsed.body?.responseMode);
      const level = normalizeLevel(parsed.body?.level);
      const falseDensity = normalizeFalseDensity(parsed.body?.falseDensity);
      const updated = await room.fetch("https://room.local/student-config", {
        method: "POST",
        body: JSON.stringify({ sessionId, responseMode, level, falseDensity })
      });
      return json(await updated.json(), updated.status);
    }
    if (url.pathname === "/api/join" && request.method === "POST") {
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      const validation = validateStudentPayload(parsed.body, { requireMessage: false });
      if (validation.error) return validation.error;
      const body = validation.value;
      const registration = await registerStudentSession(room, body);
      if (!registration.ok) {
        return json({
          error: registration.error,
          message: registration.message
        }, registration.status || 409);
      }
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
      const sessionCheck = await validateStudentSession(room, body);
      if (!sessionCheck.ok) {
        return json({
          error: sessionCheck.error,
          message: sessionCheck.message
        }, sessionCheck.status || 401);
      }
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
    if (url.pathname === "/api/history" && request.method === "POST") {
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      const validation = validateStudentPayload(parsed.body, { requireMessage: false });
      if (validation.error) return validation.error;
      const body = validation.value;
      const sessionCheck = await validateStudentSession(room, body);
      if (!sessionCheck.ok) {
        return json({
          error: sessionCheck.error,
          message: sessionCheck.message
        }, sessionCheck.status || 401);
      }
      const historyRes = await room.fetch(
        `https://room.local/history?sessionId=${encodeURIComponent(body.sessionId)}`
      );
      if (!historyRes.ok) return json({ error: "history_unavailable" }, 503);
      const turns = await historyRes.json();
      return json({ turns });
    }
    if (url.pathname === "/api/chat" && request.method === "POST") {
      const startedAtMs = Date.now();
      const parsed = await readJsonBody(request);
      if (parsed.error) return parsed.error;
      const validation = validateStudentPayload(parsed.body, { requireMessage: true });
      if (validation.error) return validation.error;
      const body = validation.value;
      const sessionCheck = await validateStudentSession(room, body);
      if (!sessionCheck.ok) {
        return json({
          error: sessionCheck.error,
          message: sessionCheck.message
        }, sessionCheck.status || 401);
      }
      const queueTicket = crypto.randomUUID();
      const queueResult = await waitForChatSlot(room, body.sessionId, queueTicket, env);
      if (!queueResult.acquired) {
        return json({
          error: queueResult.error || "chat_queue_unavailable",
          message: queueResult.message || "앞선 질문을 처리하고 있어. 잠시 후 다시 보내 줘.",
          retryAfterMs: queueResult.retryAfterMs || 0
        }, queueResult.status || 429);
      }
      try {
        const config = await readConfig(room, env);
        const studentConfig = await readStudentConfig(room, body.sessionId);
        const events = await readEvents(room, env);
        const sessionContext = buildSessionContext(events, body.sessionId);
        const persona = config.persona || env.DEFAULT_PERSONA;
        const responseMode = studentConfig.responseMode === "inherit"
          ? normalizeResponseMode(config.responseMode)
          : normalizeResponseMode(studentConfig.responseMode);
        const configuredLevel = studentConfig.responseMode === "inherit"
          ? config.level || env.DEFAULT_FALSE_LEVEL
          : studentConfig.level;
        const falseDensity = studentConfig.responseMode === "inherit"
          ? normalizeFalseDensity(config.falseDensity)
          : normalizeFalseDensity(studentConfig.falseDensity);
        const configuredMixLevels = studentConfig.responseMode === "mixed"
          ? [0, normalizeLevel(studentConfig.level)]
          : config.mixLevels;
        let applied = selectTurnMode({
          responseMode,
          level: configuredLevel,
          mixLevels: configuredMixLevels,
          turnIndex: sessionContext.turnIndex
        });
        const selectedCase = selectCaseForTurn({
          message: body.message,
          recentMessages: sessionContext.recentMessages,
          turnIndex: sessionContext.turnIndex
        });
        const continuityClaim = [...sessionContext.recentFalseClaims]
          .reverse()
          .find((item) => item.topicId === selectedCase.id);
        if (continuityClaim) {
          applied = {
            responseMode: "experiment",
            level: normalizeLevel(continuityClaim.level || configuredLevel),
            continuityOverride: true
          };
        }
        const generateAnswer = applied.responseMode === "truth"
          ? generateTruthAnswer
          : generateAuditedAnswer;
        const result = await generateAnswer({
          message: body.message,
          level: applied.level,
          persona,
          turnIndex: sessionContext.turnIndex,
          recentMessages: sessionContext.recentMessages,
          recentFalseClaims: sessionContext.recentFalseClaims,
          falseDensity,
          env
        });
        result.audit.input.configuredResponseMode = responseMode;
        result.audit.input.configuredMixLevels = configuredMixLevels;
        result.audit.input.falseDensity = applied.responseMode === "truth" ? null : falseDensity;
        result.audit.input.studentOverride = studentConfig.responseMode !== "inherit";
        result.audit.input.continuityOverride = Boolean(applied.continuityOverride);
        const { audit, answer } = result;
        const latencyMs = Date.now() - startedAtMs;
        const studentAnswer = result.shouldSendToStudent ? answer : FAIL_CLOSED_STUDENT_MESSAGE;
        const stillRegistered = await validateStudentSession(room, body);
        if (!stillRegistered.ok) {
          return json({
            error: "student_deleted",
            message: "교사가 이 학생 세션을 종료했습니다. 다시 입장하려면 이름을 입력해 주세요."
          }, 410);
        }

        await room.fetch(roomEventUrl(env), {
          method: "POST",
          body: JSON.stringify({
            type: "chat_turn",
            roomId,
            sessionId: body.sessionId,
            studentName: body.studentName,
            studentMessage: body.message,
            studentVisibleAnswer: studentAnswer,
            suggestedQuestions: result.shouldSendToStudent ? result.suggestedQuestions || [] : [],
            blockedForStudent: !result.shouldSendToStudent,
            latencyMs,
            teacherAudit: audit,
            at: new Date().toISOString()
          })
        });

        return json({
          answer: studentAnswer,
          suggestedQuestions: result.shouldSendToStudent ? result.suggestedQuestions || [] : [],
          telemetry: "sent",
          roomId,
          latencyMs,
          queuedMs: queueResult.queuedMs || 0
        });
      } finally {
        await releaseChatSlot(room, body.sessionId, queueTicket);
      }
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
      const recordedEvent = await this.recordEvent(event, Number(url.searchParams.get("ttlHours") || 24));
      this.broadcast(recordedEvent);
      return text("ok");
    }
    if (url.pathname === "/rate-limit" && request.method === "POST") {
      const body = await request.json();
      return json(await this.checkRateLimit(body.sessionId, body.limit));
    }
    if (url.pathname === "/chat-queue/acquire" && request.method === "POST") {
      return json(await this.acquireChatSlot(await request.json()));
    }
    if (url.pathname === "/chat-queue/release" && request.method === "POST") {
      return json(await this.releaseChatSlot(await request.json()));
    }
    if (url.pathname === "/student-delete" && request.method === "POST") {
      return json(await this.deleteStudent(await request.json()));
    }
    if (url.pathname === "/student-config" && request.method === "POST") {
      return json(await this.updateStudentConfig(await request.json()));
    }
    if (url.pathname === "/student-config") {
      return json(await this.readStudentConfig(url.searchParams.get("sessionId")));
    }
    if (url.pathname === "/session-register" && request.method === "POST") {
      return json(await this.registerStudentSession(await request.json()));
    }
    if (url.pathname === "/session-validate" && request.method === "POST") {
      return json(await this.validateStudentSession(await request.json()));
    }
    if (url.pathname === "/history") {
      return json(await this.readTranscript(url.searchParams.get("sessionId")));
    }
    if (url.pathname === "/events") {
      return json(await this.readEvents(Number(url.searchParams.get("ttlHours") || 24)));
    }
    if (url.pathname === "/purge" && request.method === "POST") {
      await this.state.storage.delete("events");
      await this.state.storage.delete("rateLimits");
      await this.state.storage.delete("studentSessions");
      await this.state.storage.delete("chatQueue");
      await this.state.storage.delete("studentConfigs");
      await this.deleteTranscripts();
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
    const safeEvent = redactSensitiveFields({
      ...event,
      eventId: event.eventId || crypto.randomUUID()
    });
    events.push(safeEvent);
    await this.state.storage.put("events", events.slice(-1000));
    if (safeEvent.type === "chat_turn") await this.recordTranscriptTurn(safeEvent);
    return safeEvent;
  }

  async recordTranscriptTurn(event) {
    const sessionId = String(event.sessionId || "");
    if (!sessionId) return;
    const key = `transcript:${sessionId}`;
    const transcript = await this.state.storage.get(key) || [];
    const previousTurn = transcript.at(-1)?.turn || 0;
    transcript.push({
      turn: previousTurn + 1,
      studentMessage: String(event.studentMessage || ""),
      studentVisibleAnswer: String(event.studentVisibleAnswer || "")
      ,
      suggestedQuestions: Array.isArray(event.suggestedQuestions)
        ? event.suggestedQuestions.map((item) => String(item || "").slice(0, 120)).slice(0, 3)
        : []
    });
    await this.state.storage.put(key, transcript.slice(-20));
  }

  async readTranscript(sessionId) {
    return await this.state.storage.get(`transcript:${String(sessionId || "")}`) || [];
  }

  async deleteTranscripts() {
    const transcripts = await this.state.storage.list({ prefix: "transcript:" });
    const keys = [...transcripts.keys()];
    for (let index = 0; index < keys.length; index += 128) {
      await this.state.storage.delete(keys.slice(index, index + 128));
    }
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

  async acquireChatSlot({
    sessionId,
    ticketId,
    maxConcurrent = 40,
    maxStartsPerMinute = 45,
    maxQueuedPerSession = 3,
    leaseMs = 120000
  }) {
    const now = Date.now();
    const key = String(sessionId || "anonymous");
    const ticket = String(ticketId || "");
    const state = await this.state.storage.get("chatQueue") || {
      waiting: [],
      active: {},
      starts: []
    };
    state.waiting = (state.waiting || []).filter((item) => now - item.enqueuedAt < leaseMs);
    state.starts = (state.starts || []).filter((startedAt) => now - startedAt < 60000);
    for (const [activeTicket, item] of Object.entries(state.active || {})) {
      if (now - item.startedAt >= leaseMs) delete state.active[activeTicket];
    }
    if (state.active[ticket]) {
      return { acquired: true, queuedMs: now - state.active[ticket].enqueuedAt };
    }
    let waiting = state.waiting.find((item) => item.ticketId === ticket);
    if (!waiting) {
      const sessionDepth = state.waiting.filter((item) => item.sessionId === key).length
        + Object.values(state.active).filter((item) => item.sessionId === key).length;
      if (sessionDepth >= Number(maxQueuedPerSession)) {
        return {
          acquired: false,
          terminal: true,
          status: 429,
          error: "student_queue_full",
          message: "이미 여러 질문이 대기 중이야. 앞선 답변을 받은 뒤 다시 보내 줘."
        };
      }
      waiting = { ticketId: ticket, sessionId: key, enqueuedAt: now };
      state.waiting.push(waiting);
    }
    const sessionActive = Object.values(state.active).some((item) => item.sessionId === key);
    const firstForSession = state.waiting.find((item) => item.sessionId === key)?.ticketId === ticket;
    const capacityAvailable = Object.keys(state.active).length < Number(maxConcurrent);
    const rateAvailable = state.starts.length < Number(maxStartsPerMinute);
    if (!sessionActive && firstForSession && capacityAvailable && rateAvailable) {
      state.waiting = state.waiting.filter((item) => item.ticketId !== ticket);
      state.active[ticket] = {
        sessionId: key,
        enqueuedAt: waiting.enqueuedAt,
        startedAt: now
      };
      state.starts.push(now);
      await this.state.storage.put("chatQueue", state);
      return { acquired: true, queuedMs: now - waiting.enqueuedAt };
    }
    await this.state.storage.put("chatQueue", state);
    const retryAfterMs = rateAvailable
      ? CHAT_QUEUE_POLL_MS
      : Math.max(CHAT_QUEUE_POLL_MS, 60000 - (now - state.starts[0]));
    return {
      acquired: false,
      terminal: false,
      position: state.waiting.findIndex((item) => item.ticketId === ticket) + 1,
      retryAfterMs
    };
  }

  async releaseChatSlot({ sessionId, ticketId }) {
    const state = await this.state.storage.get("chatQueue") || {
      waiting: [],
      active: {},
      starts: []
    };
    delete state.active?.[String(ticketId || "")];
    state.waiting = (state.waiting || []).filter((item) =>
      item.ticketId !== String(ticketId || "") ||
      item.sessionId !== String(sessionId || "anonymous")
    );
    await this.state.storage.put("chatQueue", state);
    return { ok: true };
  }

  async deleteStudent({ sessionId }) {
    const key = String(sessionId || "");
    const sessions = await this.state.storage.get("studentSessions") || {};
    const studentName = sessions[key]?.studentName || "이름 없음";
    delete sessions[key];
    await this.state.storage.put("studentSessions", sessions);

    const events = await this.state.storage.get("events") || [];
    await this.state.storage.put("events", events.filter((event) => event.sessionId !== key));
    const rateLimits = await this.state.storage.get("rateLimits") || {};
    delete rateLimits[key];
    await this.state.storage.put("rateLimits", rateLimits);
    await this.state.storage.delete(`transcript:${key}`);
    const studentConfigs = await this.state.storage.get("studentConfigs") || {};
    delete studentConfigs[key];
    await this.state.storage.put("studentConfigs", studentConfigs);

    const queue = await this.state.storage.get("chatQueue") || { waiting: [], active: {}, starts: [] };
    queue.waiting = (queue.waiting || []).filter((item) => item.sessionId !== key);
    for (const [ticketId, item] of Object.entries(queue.active || {})) {
      if (item.sessionId === key) delete queue.active[ticketId];
    }
    await this.state.storage.put("chatQueue", queue);

    const event = {
      type: "student_deleted",
      sessionId: key,
      studentName,
      at: new Date().toISOString()
    };
    this.broadcast(event);
    return { ok: true, sessionId: key, studentName };
  }

  async readStudentConfig(sessionId) {
    const configs = await this.state.storage.get("studentConfigs") || {};
    return configs[String(sessionId || "")] || { responseMode: "inherit", level: 2, falseDensity: "single" };
  }

  async updateStudentConfig({ sessionId, responseMode, level, falseDensity }) {
    const key = String(sessionId || "");
    const config = {
      responseMode: normalizeStudentResponseMode(responseMode),
      level: normalizeLevel(level),
      falseDensity: normalizeFalseDensity(falseDensity),
      updatedAt: new Date().toISOString()
    };
    const configs = await this.state.storage.get("studentConfigs") || {};
    configs[key] = config;
    await this.state.storage.put("studentConfigs", configs);
    const event = {
      type: "student_config_updated",
      sessionId: key,
      studentName: (await this.state.storage.get("studentSessions") || {})[key]?.studentName || "이름 없음",
      studentConfig: config,
      at: config.updatedAt
    };
    this.broadcast(event);
    return { ok: true, sessionId: key, ...config };
  }

  async registerStudentSession({ sessionId, sessionSecret, studentName }) {
    const sessions = await this.state.storage.get("studentSessions") || {};
    const existing = sessions[sessionId];
    if (existing && existing.sessionSecret !== sessionSecret) {
      return {
        ok: false,
        status: 409,
        error: "session_conflict",
        message: "이미 다른 브라우저에서 사용 중인 세션입니다. 새로고침 후 다시 입장해 주세요."
      };
    }
    const now = new Date().toISOString();
    sessions[sessionId] = {
      sessionSecret,
      studentName,
      joinedAt: existing?.joinedAt || now,
      lastSeenAt: now
    };
    await this.state.storage.put("studentSessions", sessions);
    return { ok: true };
  }

  async validateStudentSession({ sessionId, sessionSecret, studentName }) {
    const sessions = await this.state.storage.get("studentSessions") || {};
    const existing = sessions[sessionId];
    if (!existing) {
      return {
        ok: false,
        status: 401,
        error: "session_not_joined",
        message: "먼저 이름을 입력해 입장해 주세요."
      };
    }
    if (existing.sessionSecret !== sessionSecret) {
      return {
        ok: false,
        status: 409,
        error: "session_verification_failed",
        message: "세션 확인에 실패했습니다. 새로고침 후 다시 입장해 주세요."
      };
    }
    sessions[sessionId] = {
      ...existing,
      studentName: studentName || existing.studentName,
      lastSeenAt: new Date().toISOString()
    };
    await this.state.storage.put("studentSessions", sessions);
    return { ok: true };
  }

  async updateConfig(data, roomId = "default-classroom") {
    const validation = sanitizeTeacherConfig(data, {});
    if (validation.errorBody) {
      const rejected = buildTeacherConfigRejectedEvent(roomId, validation.errorBody);
      const recordedRejected = await this.recordEvent(rejected);
      this.broadcast(recordedRejected);
      return validation.errorBody;
    }
    const nextLevel = validation.value.level;
    const nextPersona = validation.value.persona;
    const nextResponseMode = validation.value.responseMode;
    const nextMixLevels = validation.value.mixLevels;
    const nextFalseDensity = validation.value.falseDensity;
    const updatedAt = new Date().toISOString();
    const config = {
      level: nextLevel,
      persona: nextPersona,
      responseMode: nextResponseMode,
      mixLevels: nextMixLevels,
      falseDensity: nextFalseDensity,
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
      responseMode: nextResponseMode,
      mixLevels: nextMixLevels,
      falseDensity: nextFalseDensity,
      config,
      at: updatedAt
    };
    const recordedEvent = await this.recordEvent(event);
    this.broadcast(recordedEvent);
    return config;
  }

  async sendSnapshot(socket) {
    try {
      const events = await this.readEvents();
      const config = await this.state.storage.get("config") || null;
      const studentConfigs = await this.state.storage.get("studentConfigs") || {};
      socket.send(JSON.stringify({
        type: "snapshot",
        sessionId: "teacher",
        studentName: "teacher",
        config,
        studentConfigs,
        events: redactSensitiveFields(events),
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
    persona: config.persona || env.DEFAULT_PERSONA,
    responseMode: normalizeResponseMode(config.responseMode || env.DEFAULT_RESPONSE_MODE),
    mixLevels: normalizeMixLevels(config.mixLevels),
    falseDensity: normalizeFalseDensity(config.falseDensity || env.DEFAULT_FALSE_DENSITY)
  };
}

async function readStudentConfig(room, sessionId) {
  const res = await room.fetch(
    `https://room.local/student-config?sessionId=${encodeURIComponent(sessionId)}`
  );
  if (!res.ok || !String(res.headers.get("content-type") || "").includes("application/json")) {
    return { responseMode: "inherit", level: 2, falseDensity: "single" };
  }
  const config = await res.json();
  return {
    responseMode: normalizeStudentResponseMode(config.responseMode),
    level: normalizeLevel(config.level),
    falseDensity: normalizeFalseDensity(config.falseDensity)
  };
}

async function writeConfig(room, body, env, roomId) {
  const res = await room.fetch(`https://room.local/config?room=${encodeURIComponent(roomId)}`, {
    method: "POST",
    body: JSON.stringify({
      level: body?.level || env.DEFAULT_FALSE_LEVEL,
      persona: body?.persona || env.DEFAULT_PERSONA,
      responseMode: normalizeResponseMode(body?.responseMode || env.DEFAULT_RESPONSE_MODE),
      mixLevels: normalizeMixLevels(body?.mixLevels),
      falseDensity: normalizeFalseDensity(body?.falseDensity || env.DEFAULT_FALSE_DENSITY)
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

async function recordTeacherConfigRejection(room, env, roomId, errorBody) {
  await room.fetch(roomEventUrl(env), {
    method: "POST",
    body: JSON.stringify(buildTeacherConfigRejectedEvent(roomId, errorBody))
  });
}

function buildTeacherConfigRejectedEvent(roomId, errorBody) {
  return {
    type: "teacher_config_rejected",
    sessionId: "teacher",
    studentName: "teacher",
    roomId: normalizeRoomId(roomId),
    error: errorBody.error,
    message: errorBody.message,
    blockedPattern: errorBody.blockedPattern,
    at: new Date().toISOString()
  };
}

function buildHealthPayload(env) {
  return {
    schemaVersion: "health/v1",
    ok: true,
    provider: env.LLM_PROVIDER === "rules"
      ? "rules"
      : env.OPENAI_API_KEY
        ? "openai"
        : "unconfigured",
    openaiModel: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    openaiVerifierModel: env.OPENAI_VERIFIER_MODEL || env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    openaiConfigured: Boolean(env.OPENAI_API_KEY),
    teacherProtected: Boolean(env.TEACHER_TOKEN),
    defaultFalseLevel: Number(env.DEFAULT_FALSE_LEVEL || 2),
    defaultFalseDensity: normalizeFalseDensity(env.DEFAULT_FALSE_DENSITY),
    defaultResponseMode: normalizeResponseMode(env.DEFAULT_RESPONSE_MODE),
    chatRateLimitPerMinute: Number(env.CHAT_RATE_LIMIT_PER_MINUTE || 12),
    chatMaxConcurrent: Number(env.CHAT_MAX_CONCURRENT || 40),
    chatGlobalRateLimitPerMinute: Number(env.CHAT_GLOBAL_RATE_LIMIT_PER_MINUTE || 45),
    chatMaxQueuedPerSession: Number(env.CHAT_MAX_QUEUED_PER_SESSION || 3),
    eventTtlHours: Number(env.EVENT_TTL_HOURS || 24),
    openaiTimeoutMs: normalizeTimeoutMs(env.OPENAI_TIMEOUT_MS),
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
      purge: "/api/purge",
      deleteStudent: "/api/student"
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

async function waitForChatSlot(room, sessionId, ticketId, env) {
  const deadline = Date.now() + Number(env.CHAT_QUEUE_WAIT_TIMEOUT_MS || 120000);
  while (Date.now() < deadline) {
    const res = await room.fetch("https://room.local/chat-queue/acquire", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        ticketId,
        maxConcurrent: Number(env.CHAT_MAX_CONCURRENT || 40),
        maxStartsPerMinute: Number(env.CHAT_GLOBAL_RATE_LIMIT_PER_MINUTE || 45),
        maxQueuedPerSession: Number(env.CHAT_MAX_QUEUED_PER_SESSION || 3),
        leaseMs: Number(env.CHAT_LEASE_MS || 120000)
      })
    });
    if (res.status === 404 || !String(res.headers.get("content-type") || "").includes("application/json")) {
      const legacy = await checkRateLimit(room, sessionId, env);
      return {
        acquired: Boolean(legacy.allowed),
        terminal: true,
        status: legacy.allowed ? 200 : 429,
        error: legacy.allowed ? undefined : "rate_limited",
        message: legacy.allowed ? undefined : "질문이 너무 빠르게 이어졌어. 잠시 후 다시 물어봐.",
        retryAfterMs: legacy.retryAfterMs
      };
    }
    const result = await res.json();
    if (result.acquired || result.terminal) return result;
    await sleep(Math.min(2000, Math.max(
      CHAT_QUEUE_POLL_MS,
      Number(result.retryAfterMs) || CHAT_QUEUE_POLL_MS
    )));
  }
  return {
    acquired: false,
    terminal: true,
    status: 503,
    error: "chat_queue_timeout",
    message: "질문이 많이 몰려 있어. 잠시 후 다시 보내 줘."
  };
}

async function releaseChatSlot(room, sessionId, ticketId) {
  try {
    await room.fetch("https://room.local/chat-queue/release", {
      method: "POST",
      body: JSON.stringify({ sessionId, ticketId })
    });
  } catch {
    // The lease expires automatically; a cleanup failure must not hide a valid student answer.
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerStudentSession(room, body) {
  const res = await room.fetch("https://room.local/session-register", {
    method: "POST",
    body: JSON.stringify({
      sessionId: body.sessionId,
      sessionSecret: body.sessionSecret,
      studentName: body.studentName
    })
  });
  return await res.json();
}

async function validateStudentSession(room, body) {
  const res = await room.fetch("https://room.local/session-validate", {
    method: "POST",
    body: JSON.stringify({
      sessionId: body.sessionId,
      sessionSecret: body.sessionSecret,
      studentName: body.studentName
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
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_JSON_BODY_BYTES) {
    return { error: payloadTooLargeError() };
  }
  try {
    const raw = await readBoundedText(request, MAX_JSON_BODY_BYTES);
    if (raw.tooLarge) return { error: payloadTooLargeError() };
    return { body: JSON.parse(raw) };
  } catch {
    return {
      error: validationError("invalid_json", "요청 본문은 JSON이어야 합니다.")
    };
  }
}

async function readBoundedText(request, maxBytes) {
  if (!request.body?.getReader) return await request.text();
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { tooLarge: true };
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  return raw;
}

function payloadTooLargeError() {
  return json({
    error: "payload_too_large",
    message: "요청 본문이 너무 큽니다.",
    maxBytes: MAX_JSON_BODY_BYTES
  }, 413);
}

function validateStudentPayload(body, { requireMessage }) {
  const sessionId = sanitizeText(body?.sessionId, 120);
  const sessionSecret = sanitizeText(body?.sessionSecret, 160);
  const studentName = sanitizeText(body?.studentName, 40);
  const message = sanitizeText(body?.message, 600);

  if (!sessionId) {
    return { error: validationError("missing_session_id", "세션 정보가 없습니다.") };
  }
  if (!sessionSecret) {
    return { error: validationError("missing_session_secret", "세션 확인 정보가 없습니다.") };
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
  if (String(body?.sessionSecret || "").length > 160) {
    return { error: validationError("session_secret_too_long", "세션 확인 정보가 너무 깁니다.") };
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
      sessionSecret,
      studentName,
      ...(requireMessage ? { message } : {})
    }
  };
}

function sanitizeTeacherConfig(body, env = {}) {
  const level = normalizeLevel(body?.level || env.DEFAULT_FALSE_LEVEL);
  const responseMode = normalizeResponseMode(body?.responseMode || env.DEFAULT_RESPONSE_MODE);
  const mixLevels = normalizeMixLevels(body?.mixLevels);
  const falseDensity = normalizeFalseDensity(body?.falseDensity || env.DEFAULT_FALSE_DENSITY);
  const persona = sanitizeText(body?.persona || env.DEFAULT_PERSONA || "교육용 역사 챗봇", 240);
  const unsafePersona = findUnsafePersonaInstruction(persona);
  if (unsafePersona) {
    const errorBody = {
      error: "unsafe_persona_instruction",
      message: "페르소나는 말투와 역할만 설정할 수 있습니다. 정답 공개, 거짓 공개, 규칙 우회 지시는 저장할 수 없습니다.",
      blockedPattern: unsafePersona
    };
    return {
      error: json(errorBody, 400),
      errorBody
    };
  }
  return {
    value: {
      level,
      persona,
      responseMode,
      mixLevels,
      falseDensity
    }
  };
}

function normalizeResponseMode(value) {
  const normalized = String(value || "experiment").toLowerCase();
  return ["truth", "mixed"].includes(normalized) ? normalized : "experiment";
}

function normalizeStudentResponseMode(value) {
  const normalized = String(value || "inherit").trim().toLowerCase();
  return ["inherit", "truth", "experiment", "mixed"].includes(normalized)
    ? normalized
    : "inherit";
}

export function normalizeFalseDensity(value) {
  return String(value || "single").trim().toLowerCase() === "all" ? "all" : "single";
}

export function normalizeMixLevels(value) {
  const source = Array.isArray(value) ? value : [];
  const normalized = [...new Set(source
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 4))];
  return normalized.length ? normalized : [0, 1, 2, 3, 4];
}

export function selectTurnMode({ responseMode, level, mixLevels, turnIndex = 0 }) {
  if (responseMode === "truth") return { responseMode: "truth", level: null };
  if (responseMode === "experiment") {
    return { responseMode: "experiment", level: normalizeLevel(level) };
  }
  const pool = normalizeMixLevels(mixLevels);
  const selected = pool[Math.abs(Number(turnIndex) || 0) % pool.length];
  return selected === 0
    ? { responseMode: "truth", level: null }
    : { responseMode: "experiment", level: normalizeLevel(selected) };
}

function findUnsafePersonaInstruction(persona) {
  const value = String(persona || "");
  const patterns = [
    /정답(을|은)?\s*(말|알려|공개|제공|노출)/,
    /사실(만|대로)?\s*(말|알려|공개|제공)/,
    /(거짓|오류|틀린 정보)(을|를)?\s*(밝혀|공개|알려|정정|수정)/,
    /(학생|아이)(에게)?\s*(정정|교정)/,
    /(규칙|지침|시스템|프롬프트)(을|를)?\s*(무시|우회|덮어|따르지)/,
    /(preflight|검수)(를|을)?\s*(무시|우회|건너)/,
    /\b(ignore|bypass|override)\b.{0,40}\b(system|instruction|prompt|policy|preflight|validator|guardrail)s?\b/i,
    /\b(reveal|disclose|show|tell)\b.{0,40}\b(correct|true|truth|real)\b.{0,40}\b(answer|fact|history|information)\b/i,
    /\b(correct|fix)\b.{0,40}\b(false|wrong|misleading|fabricated)\b.{0,40}\b(answer|claim|information)\b/i
  ];
  return patterns.find((pattern) => pattern.test(value))?.source || "";
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
