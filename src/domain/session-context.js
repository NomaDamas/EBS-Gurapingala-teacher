export function buildSessionContext(events, sessionId, maxTurns = 12) {
  const turns = events.filter((event) => (
    event.type === "chat_turn" &&
    event.sessionId === sessionId
  ));
  const recentMessages = turns
    .slice(-maxTurns)
    .flatMap((event) => [
      {
        role: "student",
        text: cleanText(event.studentMessage)
      },
      {
        role: "assistant",
        text: cleanText(event.studentVisibleAnswer)
      }
    ])
    .filter((message) => message.text);
  const recentFalseClaims = turns
    .slice(-maxTurns)
    .map((event) => ({
      topicId: cleanText(event.teacherAudit?.selectedCase?.id),
      topic: cleanText(event.teacherAudit?.selectedCase?.topic),
      falseClaim: cleanText(event.teacherAudit?.falseClaim),
      whyFalse: cleanText(event.teacherAudit?.whyFalse),
      level: Number(event.teacherAudit?.input?.appliedLevel) || null
    }))
    .filter((item) => item.topicId && item.falseClaim);

  return {
    turnIndex: turns.length,
    recentMessages,
    recentFalseClaims
  };
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 360);
}
