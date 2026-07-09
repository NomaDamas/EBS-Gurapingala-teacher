import { writeFile } from "node:fs/promises";
import { EVALUATION_SET_50 } from "../src/domain/evaluation-set.js";
import { generateAuditedAnswer } from "../src/domain/llm-provider.js";
import { judgeEvaluationTurnWithProvider, summarizeJudgments } from "../src/domain/eval-judge.js";

const models = (process.env.EVAL_MODELS || process.env.OPENAI_MODEL || "rules")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const outputPath = process.env.EVAL_OUTPUT || "eval-results.json";
const failureExampleLimit = Number(process.env.EVAL_FAILURE_EXAMPLE_LIMIT || 10);

const results = [];
for (const model of models) {
  const env = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: model === "rules" ? undefined : model,
    LLM_PROVIDER: model === "rules" ? "rules" : process.env.LLM_PROVIDER,
    EVAL_JUDGE: process.env.EVAL_JUDGE,
    EVAL_JUDGE_MODEL: process.env.EVAL_JUDGE_MODEL
  };
  const modelResult = {
    model,
    total: EVALUATION_SET_50.length,
    passed: 0,
    failed: 0,
    byLevel: {
      1: { total: 0, passed: 0 },
      2: { total: 0, passed: 0 },
      3: { total: 0, passed: 0 },
      4: { total: 0, passed: 0 }
    },
    failures: []
  };
  const judgments = [];

  for (const item of EVALUATION_SET_50) {
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
        judgment
      });
    }
  }

  modelResult.metrics = summarizeJudgments(judgments);
  modelResult.passRate = modelResult.metrics.passed / modelResult.metrics.total;
  modelResult.selectionScore = scoreModelForSelection(modelResult.metrics);
  modelResult.failureExamples = modelResult.failures
    .slice(0, failureExampleLimit)
    .map(toFailureExample);
  results.push(modelResult);
}

const recommendedModel = selectRecommendedModel(results);
await writeFile(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  selectionCriteria: {
    primary: "truthLeakRate must be 0, then maximize falsehoodRate, levelFitRate, averageSubtletyScore, and teacherAuditQuality.",
    minimums: {
      falsehoodRate: 1,
      levelFitRate: 1,
      truthLeakRate: 0,
      teacherAuditQuality: 0.75
    },
    failureExampleLimit
  },
  recommendedModel,
  models: results
}, null, 2));

for (const result of results) {
  console.log(`${result.model}: ${(result.passRate * 100).toFixed(1)}% pass (${result.passed}/${result.total})`);
  console.log(`  falsehood=${pct(result.metrics.falsehoodRate)} levelFit=${pct(result.metrics.levelFitRate)} truthLeak=${pct(result.metrics.truthLeakRate)} subtlety=${result.metrics.averageSubtletyScore.toFixed(2)}`);
}
if (recommendedModel) {
  console.log(`recommended=${recommendedModel.model} score=${recommendedModel.selectionScore.toFixed(3)}`);
}
console.log(`wrote ${outputPath}`);

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function selectRecommendedModel(items) {
  const eligible = items
    .filter((item) =>
      item.metrics.truthLeakRate === 0 &&
      item.metrics.falsehoodRate >= 1 &&
      item.metrics.levelFitRate >= 1 &&
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
    verdict: item.verdict,
    checks: item.checks,
    judgment: item.judgment,
    reasons: item.judgment?.reasons || []
  };
}
