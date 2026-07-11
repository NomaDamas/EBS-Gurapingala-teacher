import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { EVALUATION_SET_50 } from "../src/domain/evaluation-set.js";
import { generateAuditedAnswer } from "../src/domain/llm-provider.js";
import { judgeEvaluationTurnWithProvider, summarizeJudgments } from "../src/domain/eval-judge.js";

const models = (process.env.EVAL_MODELS || process.env.OPENAI_MODEL || "rules")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const outputPath = process.env.EVAL_OUTPUT || "eval-results.json";
const failureExampleLimit = Number(process.env.EVAL_FAILURE_EXAMPLE_LIMIT || 10);
const prHeadSha = String(process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || "").trim();
const requireOpenAIEvaluation = process.env.REQUIRE_OPENAI_EVAL === "true";
const expectedGeneratorModel = String(process.env.EXPECTED_OPENAI_MODEL || process.env.OPENAI_MODEL || "").trim();
const expectedVerifierModel = String(
  process.env.EXPECTED_OPENAI_VERIFIER_MODEL ||
  process.env.OPENAI_VERIFIER_MODEL ||
  expectedGeneratorModel
).trim();
const expectedJudgeModel = String(process.env.EVAL_JUDGE_MODEL || expectedVerifierModel || expectedGeneratorModel).trim();
const minimumAverageSubtletyScore = Number(process.env.EVAL_MINIMUM_SUBTLETY_SCORE || 0.6);
const fixedLevel = normalizeFixedLevel(process.env.EVAL_FIXED_LEVEL);
const evaluationItems = EVALUATION_SET_50.map((item) => fixedLevel
  ? { ...item, expectedLevel: fixedLevel }
  : item);
const setupFailures = validateSetup();
const startedAt = new Date().toISOString();

const results = [];
for (const model of setupFailures.length ? [] : models) {
  const env = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: model === "rules" ? undefined : model,
    OPENAI_VERIFIER_MODEL: model === "rules" ? undefined : expectedVerifierModel || model,
    OPENAI_TIMEOUT_MS: process.env.OPENAI_TIMEOUT_MS,
    LLM_PROVIDER: model === "rules" ? "rules" : process.env.LLM_PROVIDER,
    EVAL_JUDGE: process.env.EVAL_JUDGE,
    EVAL_JUDGE_MODEL: expectedJudgeModel
  };
  const modelResult = {
    model,
    total: evaluationItems.length,
    passed: 0,
    failed: 0,
    byLevel: {
      1: { total: 0, passed: 0 },
      2: { total: 0, passed: 0 },
      3: { total: 0, passed: 0 },
      4: { total: 0, passed: 0 }
    },
    failures: [],
    turns: []
  };
  const judgments = [];

  for (const item of evaluationItems) {
    const result = await generateAuditedAnswer({
      message: item.studentQuestion,
      level: item.expectedLevel,
      persona: "교육용 역사 챗봇",
      turnIndex: item.turn - 1,
      recentMessages: item.recentMessages || [],
      env
    });
    const judgment = await judgeEvaluationTurnWithProvider({
      audit: result.audit,
      expectedLevel: item.expectedLevel,
      env
    });
    judgments.push(judgment);
    modelResult.turns.push(toTurnEvidence({
      item,
      result,
      judgment
    }));
    const levelBucket = modelResult.byLevel[item.expectedLevel];
    levelBucket.total += 1;
    if (judgment.pass) {
      modelResult.passed += 1;
      levelBucket.passed += 1;
    } else {
      modelResult.failed += 1;
      modelResult.failures.push({
        turn: item.turn,
        expectedLevel: item.expectedLevel,
        question: item.studentQuestion,
        verdict: result.audit.preflight.verdict,
        checks: result.audit.preflight.checks,
        studentVisibleAnswer: result.audit.studentVisibleFalseAnswer,
        correctAnswer: result.audit.correctAnswer,
        falseClaim: result.audit.falseClaim,
        whyFalse: result.audit.whyFalse,
        levelFitReason: result.audit.levelFitReason,
        calibrationSeed: result.audit.calibrationSeed,
        calibrationBasis: result.audit.calibrationBasis,
        preflightFailures: result.audit.preflight.failures || [],
        judgment
      });
    }
  }

  modelResult.metrics = summarizeJudgments(judgments);
  modelResult.passRate = modelResult.metrics.passed / modelResult.metrics.total;
  modelResult.selectionScore = scoreModelForSelection(modelResult.metrics);
  modelResult.execution = summarizeExecution(modelResult.turns);
  modelResult.failureExamples = modelResult.failures
    .slice(0, failureExampleLimit)
    .map(toFailureExample);
  results.push(modelResult);
}

const recommendedModel = selectRecommendedModel(results);
const executionFailures = requireOpenAIEvaluation
  ? validateProductionResults(results, recommendedModel)
  : [];
const failures = [...setupFailures, ...executionFailures];
const payload = {
  schemaVersion: "model-evaluation-evidence/v1",
  startedAt,
  completedAt: new Date().toISOString(),
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? "pass" : "fail",
  prHeadSha: prHeadSha || null,
  requireOpenAIEvaluation,
  expectedGeneratorModel: expectedGeneratorModel || null,
  expectedVerifierModel: expectedVerifierModel || null,
  expectedJudgeModel: expectedJudgeModel || null,
  evaluationProfile: fixedLevel ? `fixed-level-${fixedLevel}` : "rotating-levels",
  fixedLevel,
  totalTurnsPerModel: evaluationItems.length,
  pressureTurnCount: evaluationItems.filter((item) => item.recentMessages?.length > 0).length,
  evaluationSetSha256: createHash("sha256")
    .update(JSON.stringify(evaluationItems))
    .digest("hex"),
  selectionCriteria: {
    primary: "All 50 turns must pass with zero truth leak, then maximize falsehoodRate, levelFitRate, averageSubtletyScore, and teacherAuditQuality.",
    minimums: {
      falsehoodRate: 1,
      levelFitRate: 1,
      truthLeakRate: 0,
      averageSubtletyScore: minimumAverageSubtletyScore,
      teacherAuditQuality: 0.75
    },
    failureExampleLimit
  },
  recommendedModel,
  failures,
  models: results
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

for (const result of results) {
  console.log(`${result.model}: ${(result.passRate * 100).toFixed(1)}% pass (${result.passed}/${result.total})`);
  console.log(`  falsehood=${pct(result.metrics.falsehoodRate)} levelFit=${pct(result.metrics.levelFitRate)} truthLeak=${pct(result.metrics.truthLeakRate)} subtlety=${result.metrics.averageSubtletyScore.toFixed(2)}`);
}
if (recommendedModel) {
  console.log(`recommended=${recommendedModel.model} score=${recommendedModel.selectionScore.toFixed(3)}`);
}
console.log(`wrote ${outputPath}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function normalizeFixedLevel(value) {
  if (value === undefined || value === null || value === "") return null;
  const level = Number(value);
  if (![1, 2, 3, 4].includes(level)) {
    throw new Error("EVAL_FIXED_LEVEL must be one of 1, 2, 3, or 4.");
  }
  return level;
}

function selectRecommendedModel(items) {
  const eligible = items
    .filter((item) =>
      item.metrics.truthLeakRate === 0 &&
      item.metrics.falsehoodRate >= 1 &&
      item.metrics.levelFitRate >= 1 &&
      item.metrics.averageSubtletyScore >= minimumAverageSubtletyScore &&
      item.metrics.averageTeacherAuditQuality >= 0.75
    )
    .sort((a, b) => b.selectionScore - a.selectionScore);
  const selected = eligible[0] || [...items].sort((a, b) => b.selectionScore - a.selectionScore)[0];
  if (!selected) return null;
  return {
    model: selected.model,
    passRate: selected.passRate,
    selectionScore: selected.selectionScore,
    metrics: selected.metrics,
    eligible: eligible.includes(selected)
  };
}

function scoreModelForSelection(metrics) {
  const truthLeakPenalty = metrics.truthLeakRate * 2;
  const score =
    metrics.falsehoodRate * 0.3 +
    metrics.levelFitRate * 0.3 +
    metrics.averageSubtletyScore * 0.25 +
    metrics.averageTeacherAuditQuality * 0.15 -
    truthLeakPenalty;
  return Math.max(0, Number(score.toFixed(6)));
}

function toFailureExample(item) {
  return {
    turn: item.turn,
    expectedLevel: item.expectedLevel,
    question: item.question,
    studentVisibleAnswer: item.studentVisibleAnswer,
    correctAnswer: item.correctAnswer,
    falseClaim: item.falseClaim,
    whyFalse: item.whyFalse,
    levelFitReason: item.levelFitReason,
    calibrationSeed: item.calibrationSeed,
    calibrationBasis: item.calibrationBasis,
    preflightFailures: item.preflightFailures,
    verdict: item.verdict,
    checks: item.checks,
    judgment: item.judgment,
    reasons: item.judgment?.reasons || []
  };
}

function toTurnEvidence({ item, result, judgment }) {
  return {
    turn: item.turn,
    expectedLevel: item.expectedLevel,
    question: item.studentQuestion,
    shouldSendToStudent: result.shouldSendToStudent === true,
    provider: {
      name: result.audit?.provider?.name || "",
      model: result.audit?.provider?.model || "",
      responseId: result.audit?.provider?.responseId || "",
      responseModel: result.audit?.provider?.responseModel || "",
      verifier: {
        name: result.audit?.provider?.verifier?.name || "",
        model: result.audit?.provider?.verifier?.model || "",
        responseId: result.audit?.provider?.verifier?.responseId || "",
        responseModel: result.audit?.provider?.verifier?.responseModel || ""
      }
    },
    preflight: {
      approvedForStudent: result.audit?.preflight?.approvedForStudent === true,
      verifierApproved: result.audit?.preflight?.checks?.verifierApproved === true,
      verdict: result.audit?.preflight?.verdict || "",
      checks: result.audit?.preflight?.checks || {}
    },
    preflightFailures: result.audit?.preflight?.failures || [],
    judge: {
      provider: judgment?.judgeProvider || "",
      model: judgment?.judgeModel || "",
      responseId: judgment?.judgeResponseId || "",
      responseModel: judgment?.judgeResponseModel || "",
      pass: judgment?.pass === true,
      contract: judgment?.localJudgment || null,
      llm: judgment?.llmJudgment || null
    },
    studentVisibleAnswer: result.audit?.studentVisibleFalseAnswer || "",
    correctAnswer: result.audit?.correctAnswer || "",
    falseClaim: result.audit?.falseClaim || "",
    whyFalse: result.audit?.whyFalse || "",
    levelFitReason: result.audit?.levelFitReason || ""
  };
}

function summarizeExecution(turns) {
  return {
    totalTurns: turns.length,
    openaiGeneratedTurns: turns.filter((turn) => turn.provider.name === "openai").length,
    openaiVerifiedTurns: turns.filter((turn) =>
      turn.provider.verifier.name === "openai" &&
      turn.preflight.verifierApproved
    ).length,
    openaiJudgedTurns: turns.filter((turn) => turn.judge.provider === "openai").length,
    fallbackTurns: turns.filter((turn) =>
      turn.provider.name !== "openai" ||
      turn.provider.verifier.name !== "openai" ||
      turn.judge.provider !== "openai"
    ).length,
    blockedTurns: turns.filter((turn) =>
      !turn.shouldSendToStudent ||
      !turn.preflight.approvedForStudent
    ).length
  };
}

function validateSetup() {
  if (!requireOpenAIEvaluation) return [];
  const failures = [];
  if (!prHeadSha) failures.push("PR_HEAD_SHA or GITHUB_SHA is required when REQUIRE_OPENAI_EVAL=true");
  if (!process.env.OPENAI_API_KEY) failures.push("OPENAI_API_KEY is required when REQUIRE_OPENAI_EVAL=true");
  if (!expectedGeneratorModel) failures.push("EXPECTED_OPENAI_MODEL is required when REQUIRE_OPENAI_EVAL=true");
  if (!expectedVerifierModel) failures.push("EXPECTED_OPENAI_VERIFIER_MODEL or OPENAI_VERIFIER_MODEL is required when REQUIRE_OPENAI_EVAL=true");
  if (process.env.EVAL_JUDGE !== "openai") failures.push("EVAL_JUDGE=openai is required when REQUIRE_OPENAI_EVAL=true");
  if (!expectedJudgeModel) failures.push("EVAL_JUDGE_MODEL is required when REQUIRE_OPENAI_EVAL=true");
  if (models.length === 0) failures.push("EVAL_MODELS must include at least one OpenAI candidate model");
  if (models.length !== 1) failures.push("EVAL_MODELS must contain exactly one selected production model when REQUIRE_OPENAI_EVAL=true");
  if (models.includes("rules")) failures.push("EVAL_MODELS must not include rules when REQUIRE_OPENAI_EVAL=true");
  if (process.env.LLM_PROVIDER !== "openai") failures.push("LLM_PROVIDER=openai is required when REQUIRE_OPENAI_EVAL=true");
  if (expectedGeneratorModel && !models.includes(expectedGeneratorModel)) {
    failures.push("EVAL_MODELS must include EXPECTED_OPENAI_MODEL when REQUIRE_OPENAI_EVAL=true");
  }
  if (!Number.isFinite(minimumAverageSubtletyScore) ||
    minimumAverageSubtletyScore < 0 ||
    minimumAverageSubtletyScore > 1) {
    failures.push("EVAL_MINIMUM_SUBTLETY_SCORE must be between 0 and 1");
  }
  return failures;
}

function validateProductionResults(items, selected) {
  const failures = [];
  if (!selected?.eligible) {
    failures.push("recommended model must satisfy every production evaluation minimum");
  }
  if (selected?.model !== expectedGeneratorModel) {
    failures.push("recommended model must match EXPECTED_OPENAI_MODEL");
  }
  const expected = items.find((item) => item.model === expectedGeneratorModel);
  if (!expected) {
    failures.push("production evaluation result for EXPECTED_OPENAI_MODEL is missing");
    return failures;
  }
  if (expected.total !== EVALUATION_SET_50.length ||
    expected.passed !== EVALUATION_SET_50.length ||
    expected.failed !== 0) {
    failures.push("EXPECTED_OPENAI_MODEL must pass all 50 evaluation turns");
  }
  if (expected.execution?.openaiGeneratedTurns !== EVALUATION_SET_50.length) {
    failures.push("all 50 turns must be generated by OpenAI");
  }
  if (expected.execution?.openaiVerifiedTurns !== EVALUATION_SET_50.length) {
    failures.push("all 50 turns must be approved by the independent OpenAI verifier");
  }
  if (expected.execution?.openaiJudgedTurns !== EVALUATION_SET_50.length) {
    failures.push("all 50 turns must be judged by OpenAI without local fallback");
  }
  if (expected.execution?.fallbackTurns !== 0) {
    failures.push("production evaluation must record zero provider or judge fallback turns");
  }
  if (expected.execution?.blockedTurns !== 0) {
    failures.push("production evaluation must record zero blocked turns");
  }
  if (expected.turns.some((turn) =>
    turn.provider.model !== expectedGeneratorModel ||
    turn.provider.verifier.model !== expectedVerifierModel ||
    turn.judge.model !== expectedJudgeModel
  )) {
    failures.push("every production evaluation turn must use the expected generator, verifier, and judge models");
  }
  const responseIds = expected.turns.flatMap((turn) => [
    turn.provider.responseId,
    turn.provider.verifier.responseId,
    turn.judge.responseId
  ]);
  const responseModels = expected.turns.flatMap((turn) => [
    turn.provider.responseModel,
    turn.provider.verifier.responseModel,
    turn.judge.responseModel
  ]);
  if (responseIds.some((value) => !String(value || "").trim())) {
    failures.push("every production evaluation generator, verifier, and judge call must record an OpenAI response ID");
  }
  if (new Set(responseIds).size !== EVALUATION_SET_50.length * 3) {
    failures.push("production evaluation OpenAI response IDs must be unique across all 150 calls");
  }
  if (responseModels.some((value) => !String(value || "").trim())) {
    failures.push("every production evaluation generator, verifier, and judge call must record the API-observed model");
  }
  const expectedTurns = new Set(EVALUATION_SET_50.map((item) => item.turn));
  if (expected.turns.some((turn) =>
    !expectedTurns.has(turn.turn) ||
    EVALUATION_SET_50.find((item) => item.turn === turn.turn)?.expectedLevel !== turn.expectedLevel
  ) || new Set(expected.turns.map((turn) => turn.turn)).size !== EVALUATION_SET_50.length) {
    failures.push("production evaluation must preserve all 50 unique turn numbers and expected levels");
  }
  return failures;
}
