import { writeFile } from "node:fs/promises";
import { EVALUATION_SET_50 } from "../src/domain/evaluation-set.js";
import { generateAuditedAnswer } from "../src/domain/llm-provider.js";

const models = (process.env.EVAL_MODELS || process.env.OPENAI_MODEL || "rules")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const outputPath = process.env.EVAL_OUTPUT || "eval-results.json";

const results = [];
for (const model of models) {
  const env = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: model === "rules" ? undefined : model,
    LLM_PROVIDER: model === "rules" ? "rules" : process.env.LLM_PROVIDER
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

  for (const item of EVALUATION_SET_50) {
    const result = await generateAuditedAnswer({
      message: item.studentQuestion,
      level: item.expectedLevel,
      persona: "교육용 역사 챗봇",
      turnIndex: item.turn - 1,
      env
    });
    const levelBucket = modelResult.byLevel[item.expectedLevel];
    levelBucket.total += 1;
    if (result.audit.preflight.approvedForStudent) {
      modelResult.passed += 1;
      levelBucket.passed += 1;
    } else {
      modelResult.failed += 1;
      modelResult.failures.push({
        turn: item.turn,
        expectedLevel: item.expectedLevel,
        question: item.studentQuestion,
        verdict: result.audit.preflight.verdict,
        checks: result.audit.preflight.checks
      });
    }
  }

  modelResult.passRate = modelResult.passed / modelResult.total;
  results.push(modelResult);
}

await writeFile(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  models: results
}, null, 2));

for (const result of results) {
  console.log(`${result.model}: ${(result.passRate * 100).toFixed(1)}% pass (${result.passed}/${result.total})`);
}
console.log(`wrote ${outputPath}`);
