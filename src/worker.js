import { normalizeLevel } from "./domain/misinfo-policy.js";
import { generateAuditedAnswer } from "./domain/llm-provider.js";
import { EVALUATION_SET_50 } from "./domain/evaluation-set.js";
import { buildDebriefRows, buildExportPayload } from "./domain/session-export.js";
import { studentHtml } from "./ui/student.js";
import { teacherHtml } from "./ui/teacher.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const room = getRoom(env);

    if (url.pathname === "/") {
      return html(studentHtml);
    }
    if (url.pathname === "/teacher") {
      return html(teacherHtml);
    }
    if (url.pathname === "/api/evaluation-set") {
      return json({ items: EVALUATION_SET_50 });
    }
    if (url.pathname === "/api/export") {
      const events = await readEvents(room);
      return json(buildExportPayload(events));
    }
    if (url.pathname === "/api/debrief") {
      const events = await readEvents(room);
      return json({
        schemaVersion: "debrief-table/v1",
        generatedAt: new Date().toISOString(),
        rows: buildDebriefRows(events)
      });
    }
    if (url.pathname === "/api/join" && request.method === "POST") {
      const body = await request.json();
      await room.fetch("https://room.local/event", {
        method: "POST",
        body: JSON.stringify({
          type: "student_joined",
          sessionId: body.sessionId,
          studentName: body.studentName,
          at: new Date().toISOString()
        })
      });
      return json({ ok: true });
    }
    if (url.pathname === "/api/heartbeat" && request.method === "POST") {
      const body = await request.json();
      await room.fetch("https://room.local/event", {
        method: "POST",
        body: JSON.stringify({
          type: "student_heartbeat",
          sessionId: body.sessionId,
          studentName: body.studentName,
          at: new Date().toISOString()
        })
      });
      return json({ ok: true });
    }
    if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = await request.json();
      const config = await readConfig(room, env);
      const level = normalizeLevel(config.level || env.DEFAULT_FALSE_LEVEL);
      const persona = config.persona || env.DEFAULT_PERSONA;
      const result = await generateAuditedAnswer({
        message: body.message,
        level,
        persona,
        turnIndex: Number(body.turnIndex || 0),
        env
      });
      const { audit, answer } = result;

      if (!result.shouldSendToStudent) {
        return json({ error: "Preflight failed", audit }, 422);
      }

      await room.fetch("https://room.local/event", {
        method: "POST",
        body: JSON.stringify({
          type: "chat_turn",
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
        telemetry: "sent"
      });
    }
    if (url.pathname === "/ws/teacher") {
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
          await this.state.storage.put("config", {
            level: data.level,
            persona: data.persona,
            updatedAt: new Date().toISOString()
          });
          this.broadcast({ type: "teacher_config_updated", sessionId: "teacher", studentName: "teacher", ...data });
        }
      });
      server.addEventListener("close", () => this.sessions.delete(server));
      server.addEventListener("error", () => this.sessions.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/event" && request.method === "POST") {
      const event = await request.json();
      await this.recordEvent(event);
      this.broadcast(event);
      return new Response("ok");
    }
    if (url.pathname === "/events") {
      return json(await this.state.storage.get("events") || []);
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

  async recordEvent(event) {
    const events = await this.state.storage.get("events") || [];
    events.push(event);
    await this.state.storage.put("events", events.slice(-1000));
  }

  async sendSnapshot(socket) {
    try {
      const events = await this.state.storage.get("events") || [];
      socket.send(JSON.stringify({
        type: "snapshot",
        sessionId: "teacher",
        studentName: "teacher",
        events,
        at: new Date().toISOString()
      }));
    } catch {
      this.sessions.delete(socket);
    }
  }
}

function getRoom(env) {
  const id = env.ROOM.idFromName("default-classroom");
  return env.ROOM.get(id);
}

async function readConfig(room, env) {
  const res = await room.fetch("https://room.local/config");
  const config = await res.json();
  return {
    level: config.level || env.DEFAULT_FALSE_LEVEL,
    persona: config.persona || env.DEFAULT_PERSONA
  };
}

async function readEvents(room) {
  const res = await room.fetch("https://room.local/events");
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

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
