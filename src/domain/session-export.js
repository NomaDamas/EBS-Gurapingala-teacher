export function buildDebriefRows(events) {
  return normalizeEvents(events)
    .filter((event) => event.type === "chat_turn" && event.teacherAudit)
    .map((event) => {
      const audit = event.teacherAudit;
      return {
        sessionId: event.sessionId,
        studentName: event.studentName,
        at: event.at,
        question: event.studentMessage,
        studentVisibleAnswer: event.studentVisibleAnswer,
        topic: audit.selectedCase?.topic || "",
        level: audit.input?.appliedLevel,
        correctAnswer: audit.correctAnswer,
        falseClaim: audit.falseClaim,
        whyFalse: audit.whyFalse,
        preflightVerdict: audit.preflight?.verdict,
        provider: audit.provider?.name || audit.provider?.provider || "unknown"
      };
    });
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
      chatTurns: 0,
      levels: new Set()
    };
    existing.studentName = event.studentName || existing.studentName;
    if (event.type === "student_joined" && !existing.joinedAt) existing.joinedAt = event.at;
    if (event.type === "chat_turn") {
      existing.chatTurns += 1;
      if (event.teacherAudit?.input?.appliedLevel) existing.levels.add(event.teacherAudit.input.appliedLevel);
    }
    existing.lastSeenAt = event.at || existing.lastSeenAt;
    sessions.set(event.sessionId, existing);
  }

  return [...sessions.values()].map((session) => {
    const lastSeenMs = session.lastSeenAt ? Date.parse(session.lastSeenAt) : 0;
    return {
      ...session,
      levels: [...session.levels].sort(),
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

function normalizeEvents(events) {
  return Array.isArray(events) ? events.filter(Boolean) : [];
}
