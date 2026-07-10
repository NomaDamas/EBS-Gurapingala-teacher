export function buildSessionContext(events, sessionId, maxMessages = 6) {
  const turns = events.filter((event) => (
    event.type === "chat_turn" &&
    event.sessionId === sessionId
  ));
  const recentMessages = turns
    .slice(-maxMessages)
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

  return {
    turnIndex: turns.length,
    recentMessages
  };
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 360);
}
