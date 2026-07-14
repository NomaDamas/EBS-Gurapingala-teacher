import { resolveOpenAIResponsesUrl } from "./openai-endpoint.js";
import { verifierSchema } from "./llm-provider.js";

export async function probeVerifierAvailability({
  apiKey,
  model,
  timeoutMs = 15000,
  responsesUrl,
  fetchImpl = fetch
}) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const evidence = {
    schemaVersion: "verifier-availability-probe/v1",
    startedAt,
    completedAt: null,
    status: "fail",
    requestedModel: String(model || "").trim(),
    observedModel: null,
    responseId: null,
    latencyMs: null,
    httpStatus: null,
    error: null
  };

  if (!apiKey || !evidence.requestedModel) {
    evidence.completedAt = new Date().toISOString();
    evidence.latencyMs = Date.now() - startedMs;
    evidence.error = {
      type: "invalid_setup",
      code: "missing_required_input",
      message: "OPENAI_API_KEY and VERIFIER_PROBE_MODEL are required."
    };
    return evidence;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(`Verifier availability probe timed out after ${timeoutMs}ms`),
    timeoutMs
  );

  try {
    const response = await fetchImpl(
      responsesUrl || resolveOpenAIResponsesUrl({}),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: evidence.requestedModel,
          reasoning: { effort: "low" },
          input: [
            {
              role: "system",
              content: [
                "You are an availability probe for an independent classroom-answer verifier.",
                "Return only JSON matching the supplied schema.",
                "Evaluate the supplied synthetic case exactly as written."
              ].join("\n")
            },
            {
              role: "user",
              content: JSON.stringify({
                syntheticProbe: true,
                correctAnswer: "임진왜란은 1592년 일본의 조선 침략으로 시작되었다.",
                falseClaim: "임진왜란은 1593년에 시작되었다.",
                studentVisibleAnswer: "임진왜란은 1593년에 일본이 조선을 침략하면서 시작됐어.",
                expectedResult: "The false claim is present and false, but approval is not required for this availability probe."
              })
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "misinfo_preflight_verifier",
              strict: true,
              schema: verifierSchema()
            }
          }
        })
      }
    );

    evidence.httpStatus = response.status;
    const payload = await readResponsePayload(response);
    evidence.observedModel = cleanString(payload?.model) || null;
    evidence.responseId = cleanString(payload?.id) || null;

    if (!response.ok) {
      evidence.error = sanitizeApiError(payload, response.status);
      return evidence;
    }

    parseStructuredOutput(payload);
    if (!evidence.observedModel || !evidence.responseId) {
      evidence.error = {
        type: "invalid_response",
        code: "missing_response_metadata",
        message: "OpenAI response did not include both model and response ID."
      };
      return evidence;
    }

    evidence.status = "pass";
    return evidence;
  } catch (error) {
    evidence.error = classifyProbeError(error);
    return evidence;
  } finally {
    clearTimeout(timeout);
    evidence.completedAt = new Date().toISOString();
    evidence.latencyMs = Date.now() - startedMs;
  }
}

async function readResponsePayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { rawResponse: text.slice(0, 500) };
  }
}

function parseStructuredOutput(payload) {
  const text = payload?.output_text ||
    payload?.output
      ?.flatMap((item) => item.content || [])
      ?.find((content) => content.type === "output_text" || content.type === "text")
      ?.text;
  if (!text) throw new Error("Verifier probe returned no structured output.");
  return JSON.parse(text);
}

function sanitizeApiError(payload, status) {
  const error = payload?.error || {};
  return {
    type: cleanString(error.type) || "openai_api_error",
    code: cleanString(error.code) || `http_${status}`,
    message: cleanString(error.message) || `OpenAI returned HTTP ${status}.`
  };
}

function classifyProbeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const timedOut = error?.name === "AbortError" || /timed out/i.test(message);
  return {
    type: timedOut ? "timeout" : "request_error",
    code: timedOut ? "probe_timeout" : "probe_request_failed",
    message
  };
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}
