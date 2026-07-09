import {
  buildTeacherAudit,
  judgeFalseAnswer,
  LEVELS,
  selectCase,
  normalizeLevel
} from "./misinfo-policy.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const MAX_ATTEMPTS = 3;
const RETRY_STUDENT_MESSAGE = "답변을 다시 점검해야 해. 질문을 한 번만 더 다르게 물어봐 줄래?";

export async function generateAuditedAnswer({
  message,
  level,
  persona,
  turnIndex = 0,
  env = {},
  fetchImpl = fetch
}) {
  const normalizedLevel = normalizeLevel(level);

  if (!env.OPENAI_API_KEY || env.LLM_PROVIDER === "rules") {
    const fallbackAudit = buildTeacherAudit({ message, level: normalizedLevel, persona, turnIndex });
    return {
      audit: withProviderMetadata(fallbackAudit, {
        provider: "rules",
        model: "local-policy",
        attempts: 1,
        mode: "fallback"
      }),
      answer: fallbackAudit.studentVisibleFalseAnswer,
      shouldSendToStudent: true
    };
  }

  const failures = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const draft = await callOpenAI({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || DEFAULT_MODEL,
        message,
        level: normalizedLevel,
        persona,
        turnIndex,
        previousFailures: failures,
        fetchImpl
      });
      const audit = normalizeLlmAudit({
        draft,
        message,
        level: normalizedLevel,
        persona,
        turnIndex,
        attempt,
        model: env.OPENAI_MODEL || DEFAULT_MODEL
      });
      if (audit.preflight.approvedForStudent) {
        return {
          audit,
          answer: audit.studentVisibleFalseAnswer,
          shouldSendToStudent: true
        };
      }
      failures.push({
        attempt,
        verdict: audit.preflight.verdict,
        checks: audit.preflight.checks,
        falseClaim: audit.falseClaim
      });
    } catch (error) {
      failures.push({
        attempt,
        verdict: "PROVIDER_ERROR",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return buildFailedAudit({
    message,
    level: normalizedLevel,
    persona,
    turnIndex,
    model: env.OPENAI_MODEL || DEFAULT_MODEL,
    failures
  });
}

export function normalizeLlmAudit({ draft, message, level, persona, turnIndex, attempt, model }) {
  const selected = selectCase(message, turnIndex);
  const correctAnswer = cleanString(draft.correct_answer);
  const falseClaim = cleanString(draft.false_answer);
  const falseBasis = cleanString(draft.false_basis || draft.level_fit_reason);
  const studentVisibleFalseAnswer = cleanString(draft.student_answer || falseClaim);
  const policy = LEVELS[level];
  const preflight = judgeFalseAnswer({
    truth: correctAnswer || selected.truth,
    falseAnswer: `${falseClaim}\n${studentVisibleFalseAnswer}`,
    level,
    falseBasis
  });
  const requiredShape = validateDraftShape(draft);
  const studentCorrectionLeak = hasStudentCorrectionLeak(studentVisibleFalseAnswer);
  const approvedForStudent = preflight.approvedForStudent && requiredShape.valid && !studentCorrectionLeak;

  return {
    schemaVersion: "misinfo-audit/v1",
    input: {
      studentQuestion: message,
      requestedLevel: level,
      appliedLevel: level,
      persona
    },
    selectedCase: {
      id: selected.id,
      topic: selected.topic,
      likelyStudentQuestion: selected.likelyStudentQuestion
    },
    correctAnswer: correctAnswer || selected.truth,
    studentVisibleFalseAnswer,
    falseClaim,
    whyFalse: falseBasis,
    levelFitReason: cleanString(draft.level_fit_reason),
    levelPolicy: policy,
    provider: {
      name: "openai",
      model,
      attempt,
      source: "responses-api-json-schema"
    },
    preflight: {
      ...preflight,
      approvedForStudent,
      verdict: approvedForStudent
        ? "PASS_LEVEL_CALIBRATED_FALSEHOOD"
        : "FAIL_REGENERATE_BEFORE_STUDENT",
      checks: {
        ...preflight.checks,
        requiredShape: requiredShape.valid,
        missingFields: requiredShape.missingFields,
        studentCorrectionLeak
      }
    }
  };
}

function buildFailedAudit({ message, level, persona, turnIndex, model, failures }) {
  const selected = selectCase(message, turnIndex);
  return {
    audit: {
      schemaVersion: "misinfo-audit/v1",
      input: {
        studentQuestion: message,
        requestedLevel: level,
        appliedLevel: level,
        persona
      },
      selectedCase: {
        id: selected.id,
        topic: selected.topic,
        likelyStudentQuestion: selected.likelyStudentQuestion
      },
      correctAnswer: selected.truth,
      studentVisibleFalseAnswer: RETRY_STUDENT_MESSAGE,
      falseClaim: "",
      whyFalse: "LLM 생성 또는 검수가 3회 실패해 학생에게 거짓 정보를 전송하지 않았다.",
      levelPolicy: LEVELS[level],
      provider: {
        name: "openai",
        model,
        attempts: MAX_ATTEMPTS,
        source: "responses-api-json-schema"
      },
      preflight: {
        approvedForStudent: false,
        verdict: "FAIL_CLOSED_AFTER_RETRIES",
        checks: {
          retryCount: MAX_ATTEMPTS
        },
        failures
      }
    },
    answer: RETRY_STUDENT_MESSAGE,
    shouldSendToStudent: true
  };
}

async function callOpenAI({ apiKey, model, message, level, persona, turnIndex, previousFailures, fetchImpl }) {
  const selected = selectCase(message, turnIndex);
  const response = await fetchImpl(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: buildSystemPrompt({ level, persona })
        },
        {
          role: "user",
          content: buildUserPrompt({ message, level, selected, previousFailures })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "misinfo_audit",
          strict: true,
          schema: auditSchema()
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  return parseStructuredOutput(await response.json());
}

function buildSystemPrompt({ level, persona }) {
  const policy = LEVELS[level];
  return [
    "You are generating controlled educational experiment material for a teacher-supervised classroom study.",
    "Return only JSON matching the schema.",
    "Generate both the historically correct answer and one calibrated false answer.",
    "The student-facing answer must include the calibrated falsehood and must not correct it.",
    "The teacher-facing fields must explain why the answer is false so the teacher can debrief students after the experiment.",
    `Persona: ${persona}`,
    `Falsehood level: ${level} ${policy.name}`,
    `Level rule: ${policy.rule}`,
    "Do not use hateful, graphic, medical, legal, or personal claims. Stay inside Korean history classroom content."
  ].join("\n");
}

function buildUserPrompt({ message, level, selected, previousFailures }) {
  return [
    `Student question: ${message}`,
    `Historical topic seed: ${selected.topic}`,
    `Known correct baseline: ${selected.truth}`,
    `Requested falsehood level: ${level}`,
    "Write Korean suitable for middle-school students.",
    "Blend true context with the false claim so it is subtle enough for observation.",
    "Keep the answer concise, conversational, and plausible.",
    previousFailures.length
      ? `Previous failed attempts to avoid: ${JSON.stringify(previousFailures)}`
      : "No previous failed attempts."
  ].join("\n");
}

function auditSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "correct_answer",
      "false_answer",
      "false_basis",
      "level_fit_reason",
      "student_answer"
    ],
    properties: {
      correct_answer: {
        type: "string",
        description: "Historically correct teacher-facing answer."
      },
      false_answer: {
        type: "string",
        description: "The specific calibrated false claim."
      },
      false_basis: {
        type: "string",
        description: "Why the false claim is false."
      },
      level_fit_reason: {
        type: "string",
        description: "Why the false claim fits the requested falsehood level."
      },
      student_answer: {
        type: "string",
        description: "Student-visible answer that includes the false claim and does not correct it."
      }
    }
  };
}

function parseStructuredOutput(payload) {
  if (payload.output_text) {
    return JSON.parse(payload.output_text);
  }
  const text = payload.output
    ?.flatMap((item) => item.content || [])
    ?.find((content) => content.type === "output_text" || content.type === "text")
    ?.text;
  if (!text) {
    throw new Error("No structured output text found");
  }
  return JSON.parse(text);
}

function validateDraftShape(draft) {
  const fields = [
    "correct_answer",
    "false_answer",
    "false_basis",
    "level_fit_reason",
    "student_answer"
  ];
  const missingFields = fields.filter((field) => !cleanString(draft?.[field]));
  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

function hasStudentCorrectionLeak(studentAnswer) {
  return /(정확히는|실제로는|사실은|정답은|바르게는|틀린|거짓|오류|잘못된 정보)/.test(studentAnswer);
}

function withProviderMetadata(audit, metadata) {
  return {
    ...audit,
    provider: metadata
  };
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}
