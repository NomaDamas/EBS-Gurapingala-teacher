export function buildDebriefRows(events) {
  return normalizeEvents(events)
    .filter((event) => event.type === "chat_turn" && event.teacherAudit)
    .map((event) => {
      const audit = event.teacherAudit;
      const responseMode = audit.input?.responseMode || "experiment";
      return {
        roomId: event.roomId || "",
        sessionId: event.sessionId,
        studentName: event.studentName,
        at: event.at,
        latencyMs: event.latencyMs ?? "",
        blockedForStudent: Boolean(event.blockedForStudent),
        debriefRequired: Boolean(audit.input?.appliedLevel) && !event.blockedForStudent,
        question: event.studentMessage,
        studentVisibleAnswer: event.studentVisibleAnswer,
        topic: audit.selectedCase?.topic || "",
        verificationPrompt: audit.selectedCase?.verificationPrompt || "",
        debriefNote: audit.selectedCase?.debriefNote || "",
        responseMode,
        level: audit.input?.appliedLevel,
        correctAnswer: audit.correctAnswer,
        falseClaim: audit.falseClaim,
        whyFalse: audit.whyFalse,
        preflightVerdict: audit.preflight?.verdict,
        provider: audit.provider?.name || audit.provider?.provider || "unknown"
      };
    });
}

export function buildDebriefCsv(events) {
  const rows = buildDebriefRows(events);
  const headers = [
    "roomId",
    "sessionId",
    "studentName",
    "at",
    "latencyMs",
    "blockedForStudent",
    "debriefRequired",
    "question",
    "studentVisibleAnswer",
    "topic",
    "verificationPrompt",
    "debriefNote",
    "responseMode",
    "level",
    "correctAnswer",
    "falseClaim",
    "whyFalse",
    "preflightVerdict",
    "provider"
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\n");
}

export function summarizeSessions(events, now = Date.now()) {
  const sessions = new Map();
  for (const event of normalizeEvents(events)) {
    if (!event.sessionId || event.sessionId === "teacher") continue;
    const existing = sessions.get(event.sessionId) || {
      sessionId: event.sessionId,
      studentName: event.studentName || "이름 없음",
      joinedAt: null,
      lastSeenAt: null,
      lastChatAt: null,
      chatTurns: 0,
      blockedTurns: 0,
      debriefRequiredTurns: 0,
      latencyTotalMs: 0,
      latencySamples: 0,
      lastLevel: null,
      lastResponseMode: null,
      levels: new Set()
    };
    existing.studentName = event.studentName || existing.studentName;
    if (event.type === "student_joined" && !existing.joinedAt) existing.joinedAt = event.at;
    if (event.type === "chat_turn") {
      existing.chatTurns += 1;
      if (event.blockedForStudent) existing.blockedTurns += 1;
      const responseMode = event.teacherAudit?.input?.responseMode || "experiment";
      if (event.teacherAudit?.input?.appliedLevel && !event.blockedForStudent) {
        existing.debriefRequiredTurns += 1;
      }
      existing.lastChatAt = event.at || existing.lastChatAt;
      const level = event.teacherAudit?.input?.appliedLevel;
      existing.lastResponseMode = responseMode;
      if (level) {
        existing.levels.add(level);
        existing.lastLevel = level;
      }
      if (Number.isFinite(event.latencyMs)) {
        existing.latencyTotalMs += event.latencyMs;
        existing.latencySamples += 1;
      }
    }
    existing.lastSeenAt = event.at || existing.lastSeenAt;
    sessions.set(event.sessionId, existing);
  }

  return [...sessions.values()].map((session) => {
    const lastSeenMs = session.lastSeenAt ? Date.parse(session.lastSeenAt) : 0;
    const {
      latencyTotalMs,
      latencySamples,
      ...publicSession
    } = session;
    return {
      ...publicSession,
      levels: [...session.levels].sort(),
      averageLatencyMs: latencySamples
        ? Math.round(latencyTotalMs / latencySamples)
        : null,
      online: Boolean(lastSeenMs && now - lastSeenMs < 35000)
    };
  });
}

export function buildExportPayload(events, now = new Date()) {
  const normalized = normalizeEvents(events);
  return {
    schemaVersion: "classroom-export/v1",
    exportedAt: now.toISOString(),
    sessionSummary: summarizeSessions(normalized, now.getTime()),
    debriefRows: buildDebriefRows(normalized),
    events: normalized
  };
}

export function pruneEventsByTtl(events, now = Date.now(), ttlHours = 24) {
  const ttlMs = Number(ttlHours) * 60 * 60 * 1000;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return normalizeEvents(events);
  return normalizeEvents(events).filter((event) => {
    const eventTime = event.at ? Date.parse(event.at) : now;
    return Number.isFinite(eventTime) && now - eventTime <= ttlMs;
  });
}

function normalizeEvents(events) {
  return Array.isArray(events) ? events.filter(Boolean).map(redactSensitiveFields) : [];
}

export function redactSensitiveFields(value) {
  if (Array.isArray(value)) return value.map(redactSensitiveFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveExportKey(key))
      .map(([key, nestedValue]) => [key, redactSensitiveFields(nestedValue)])
  );
}

function isSensitiveExportKey(key) {
  const normalized = String(key || "").toLowerCase().replace(/[-_]/g, "");
  return normalized.includes("secret") ||
    normalized.includes("authorization") ||
    normalized.includes("apikey") ||
    normalized.includes("openaikey") ||
    normalized.includes("teacherkey") ||
    normalized.includes("teachertoken") ||
    normalized === "token" ||
    normalized.startsWith("token") ||
    normalized.endsWith("token");
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  const formulaSafe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}
