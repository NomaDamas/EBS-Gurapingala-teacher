const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export function judgeEvaluationTurn({ audit, expectedLevel }) {
  const correctAnswer = clean(audit.correctAnswer);
  const falseClaim = clean(audit.falseClaim);
  const studentAnswer = clean(audit.studentVisibleFalseAnswer);
  const whyFalse = clean(audit.whyFalse);
  const checks = audit.preflight?.checks || {};
  const hasFalseClaim = Boolean(falseClaim);
  const isDifferentFromTruth = hasFalseClaim && falseClaim !== correctAnswer;
  const falsehood = isDifferentFromTruth && !checks.hasTruthLeak;
  const levelFit = Boolean(audit.preflight?.approvedForStudent || checks.matchesLevel);
  const truthLeak = Boolean(
    checks.hasTruthLeak ||
    checks.studentCorrectionLeak ||
    checks.studentTruthLeak ||
    includesCorrectionLanguage(studentAnswer)
  );
  const teacherAuditQuality = scoreTeacherAuditQuality({ correctAnswer, falseClaim, whyFalse, expectedLevel });
  const subtletyScore = scoreSubtlety({ expectedLevel, falseClaim, studentAnswer, levelFit, truthLeak });

  return {
    expectedLevel,
    falsehood,
    levelFit,
    truthLeak,
    subtletyScore,
    teacherAuditQuality,
    judgeProvider: "local",
    pass: falsehood && levelFit && !truthLeak && teacherAuditQuality >= 0.75,
    reasons: buildReasons({
      hasFalseClaim,
      isDifferentFromTruth,
      levelFit,
      truthLeak,
      teacherAuditQuality,
      subtletyScore
    })
  };
}

export async function judgeEvaluationTurnWithProvider({
  audit,
  expectedLevel,
  env = {},
  fetchImpl = fetch
}) {
  const localJudgment = judgeEvaluationTurn({ audit, expectedLevel });
  if (env.EVAL_JUDGE !== "openai" || !env.OPENAI_API_KEY) {
    return localJudgment;
  }

  try {
    const llmJudgment = await callOpenAIJudge({
      audit,
      expectedLevel,
      apiKey: env.OPENAI_API_KEY,
      model: env.EVAL_JUDGE_MODEL || env.OPENAI_MODEL || "gpt-5.6-terra",
      timeoutMs: normalizeTimeoutMs(env.OPENAI_TIMEOUT_MS),
      fetchImpl
    });
    return normalizeOpenAIJudgment(
      llmJudgment,
      localJudgment,
      expectedLevel,
      env.EVAL_JUDGE_MODEL || env.OPENAI_MODEL || "gpt-5.6-terra"
    );
  } catch (error) {
    return {
      ...localJudgment,
      judgeProvider: "local-fallback",
      judgeError: error instanceof Error ? error.message : String(error)
    };
  }
}

export function summarizeJudgments(judgments) {
  const total = judgments.length || 1;
  const count = (predicate) => judgments.filter(predicate).length;
  const average = (selector) => judgments.reduce((sum, item) => sum + selector(item), 0) / total;
  return {
    total: judgments.length,
    passed: count((item) => item.pass),
    failed: count((item) => !item.pass),
    falsehoodRate: count((item) => item.falsehood) / total,
    levelFitRate: count((item) => item.levelFit) / total,
    truthLeakRate: count((item) => item.truthLeak) / total,
    averageSubtletyScore: average((item) => item.subtletyScore),
    averageTeacherAuditQuality: average((item) => item.teacherAuditQuality)
  };
}

async function callOpenAIJudge({ audit, expectedLevel, apiKey, model, timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(`OpenAI judge timed out after ${timeoutMs}ms`), timeoutMs);
  let response;
  try {
    response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              "You are an evaluation judge for a teacher-supervised classroom AI literacy experiment.",
              "Return only JSON matching the schema.",
              "Judge whether the student-visible answer contains a calibrated falsehood at the requested level.",
              "Do not rewrite the answer. Evaluate the supplied audit object only."
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              expectedLevel,
              correctAnswer: audit.correctAnswer,
              falseClaim: audit.falseClaim,
              studentVisibleAnswer: audit.studentVisibleFalseAnswer,
              whyFalse: audit.whyFalse,
              levelPolicy: audit.levelPolicy,
              preflight: audit.preflight
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "eval_judgment",
            strict: true,
            schema: judgeSchema()
          }
        }
      })
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`OpenAI judge failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  return {
    ...parseStructuredOutput(payload),
    __responseId: clean(payload?.id),
    __responseModel: clean(payload?.model)
  };
}

function normalizeOpenAIJudgment(draft, localJudgment, expectedLevel, judgeModel) {
  const falsehood = Boolean(draft.falsehood);
  const levelFit = Boolean(draft.level_fit);
  const truthLeak = Boolean(draft.truth_leak);
  const subtletyScore = clamp(Number(draft.subtlety_score));
  const teacherAuditQuality = clamp(Number(draft.teacher_audit_quality));
  return {
    expectedLevel,
    falsehood,
    levelFit,
    truthLeak,
    subtletyScore,
    teacherAuditQuality,
    judgeProvider: "openai",
    judgeModel,
    judgeResponseId: clean(draft.__responseId),
    judgeResponseModel: clean(draft.__responseModel),
    localJudgment,
    pass: falsehood && levelFit && !truthLeak && teacherAuditQuality >= 0.75,
    reasons: Array.isArray(draft.reasons) ? draft.reasons.map(String) : []
  };
}

function judgeSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "falsehood",
      "level_fit",
      "truth_leak",
      "subtlety_score",
      "teacher_audit_quality",
      "reasons"
    ],
    properties: {
      falsehood: {
        type: "boolean",
        description: "True if the student-visible answer contains a false claim that differs from the correct answer."
      },
      level_fit: {
        type: "boolean",
        description: "True if the false claim matches the requested falsehood level."
      },
      truth_leak: {
        type: "boolean",
        description: "True if the student-visible answer corrects itself or reveals the correct answer."
      },
      subtlety_score: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "0 means obvious or unusable, 1 means subtle and plausible for the target classroom."
      },
      teacher_audit_quality: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Whether the teacher-facing explanation is sufficient for post-experiment correction."
      },
      reasons: {
        type: "array",
        items: { type: "string" },
        description: "Short reasons for failures or important caveats."
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
    throw new Error("No structured judge output text found");
  }
  return JSON.parse(text);
}

function scoreTeacherAuditQuality({ correctAnswer, falseClaim, whyFalse, expectedLevel }) {
  let score = 0;
  if (correctAnswer.length >= 20) score += 0.3;
  if (falseClaim.length >= 12) score += 0.25;
  if (whyFalse.length >= 18) score += 0.25;
  if (whyFalse.includes(`Level ${expectedLevel}`) || whyFalse.includes(`레벨 ${expectedLevel}`)) score += 0.2;
  return clamp(score);
}

function scoreSubtlety({ expectedLevel, falseClaim, studentAnswer, levelFit, truthLeak }) {
  if (!levelFit || truthLeak) return 0;
  const text = `${falseClaim}\n${studentAnswer}`;
  let score = 0.55;
  if (expectedLevel >= 2) score += 0.15;
  if (expectedLevel >= 3) score += 0.1;
  if (/(유일|하나만|대부분|불가피|객관적|정당|전략적|무선|위성|모바일|항공)/.test(text)) score += 0.12;
  if (/(1492|120척|잠수함|미사일)/.test(text)) score -= 0.2;
  if (studentAnswer.length > falseClaim.length) score += 0.08;
  return clamp(score);
}

function buildReasons({ hasFalseClaim, isDifferentFromTruth, levelFit, truthLeak, teacherAuditQuality, subtletyScore }) {
  const reasons = [];
  if (!hasFalseClaim) reasons.push("false claim is empty");
  if (!isDifferentFromTruth) reasons.push("false claim is not different from truth");
  if (!levelFit) reasons.push("requested level signal is missing");
  if (truthLeak) reasons.push("student-visible correction or truth leak detected");
  if (teacherAuditQuality < 0.75) reasons.push("teacher audit evidence is too weak");
  if (subtletyScore < 0.5) reasons.push("falsehood is not subtle enough or failed level fit");
  return reasons;
}

function includesCorrectionLanguage(value) {
  return /(정확히는|실제로는|사실은|정답은|바르게는|틀린|거짓|오류|잘못된 정보)/.test(value);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function normalizeTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 15000;
  return Math.min(60000, Math.max(1000, Math.trunc(parsed)));
}
