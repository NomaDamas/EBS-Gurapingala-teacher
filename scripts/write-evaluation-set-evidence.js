import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { EVALUATION_SET_50, PUBLIC_EVALUATION_SET_50 } from "../src/domain/evaluation-set.js";

const outputFile = String(process.env.EVAL_SET_EVIDENCE_FILE || process.argv[2] || "").trim();
const prHeadSha = String(process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || "").trim();
const includeTeacherAudit = process.env.INCLUDE_TEACHER_AUDIT !== "false";

const evidence = buildEvidence();
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;

if (outputFile) {
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, serialized);
  console.log(`evaluation set evidence written: ${outputFile}`);
} else {
  process.stdout.write(serialized);
}

function buildEvidence() {
  const teacherItems = includeTeacherAudit
    ? EVALUATION_SET_50.map(toTeacherReviewItem)
    : undefined;
  const byLevel = summarizeByLevel(EVALUATION_SET_50);
  const pressureTurns = EVALUATION_SET_50.filter((item) => item.recentMessages?.length > 0);
  return {
    schemaVersion: "evaluation-set-evidence/v1",
    generatedAt: new Date().toISOString(),
    prHeadSha: prHeadSha || null,
    totalTurns: EVALUATION_SET_50.length,
    publicProjection: {
      items: PUBLIC_EVALUATION_SET_50,
      exposesTeacherAudit: JSON.stringify(PUBLIC_EVALUATION_SET_50).includes("correctAnswer") ||
        JSON.stringify(PUBLIC_EVALUATION_SET_50).includes("falseClaim") ||
        JSON.stringify(PUBLIC_EVALUATION_SET_50).includes("whyFalse")
    },
    teacherAuditIncluded: includeTeacherAudit,
    pressureTurnCount: pressureTurns.length,
    pressureTurns: pressureTurns.map((item) => ({
      turn: item.turn,
      expectedLevel: item.expectedLevel,
      studentQuestion: item.studentQuestion,
      recentMessages: item.recentMessages
    })),
    byLevel,
    teacherReviewItems: teacherItems
  };
}

function toTeacherReviewItem(item) {
  const audit = item.audit;
  return {
    turn: item.turn,
    expectedLevel: item.expectedLevel,
    studentQuestion: item.studentQuestion,
    recentMessages: item.recentMessages || [],
    selectedCase: audit.selectedCase,
    correctAnswer: audit.correctAnswer,
    studentVisibleFalseAnswer: audit.studentVisibleFalseAnswer,
    falseClaim: audit.falseClaim,
    whyFalse: audit.whyFalse,
    levelPolicy: audit.levelPolicy,
    preflight: audit.preflight
  };
}

function summarizeByLevel(items) {
  return Object.fromEntries([1, 2, 3, 4].map((level) => {
    const turns = items.filter((item) => item.expectedLevel === level);
    return [level, {
      total: turns.length,
      passedPreflight: turns.filter((item) => item.audit.preflight?.approvedForStudent === true).length,
      turns: turns.map((item) => item.turn)
    }];
  }));
}
