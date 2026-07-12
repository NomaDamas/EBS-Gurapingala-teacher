const DEFAULT_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export function resolveOpenAIResponsesUrl(env = {}) {
  const configured = String(env.OPENAI_RESPONSES_URL || "").trim();
  return configured || DEFAULT_OPENAI_RESPONSES_URL;
}

export function classifyProviderFailures(failures = []) {
  const providerFailures = failures.filter((failure) =>
    failure?.verdict === "PROVIDER_ERROR" || failure?.verdict === "OPENAI_REQUIRED"
  );
  return providerFailures.length === failures.length && failures.length > 0
    ? "provider_unavailable"
    : "verification_failed";
}

export function providerStudentMessage(failureType) {
  if (failureType === "provider_unavailable") {
    return "지금 연결이 잠시 불안정해. 잠시 후 다시 시도해 줘.";
  }
  return "지금 답변을 만들지 못했어. 잠시 후 다시 시도해 줘.";
}
