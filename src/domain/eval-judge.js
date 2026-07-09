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
  const truthLeak = Boolean(checks.hasTruthLeak || checks.studentCorrectionLeak || includesCorrectionLanguage(studentAnswer));
  const teacherAuditQuality = scoreTeacherAuditQuality({ correctAnswer, falseClaim, whyFalse, expectedLevel });
  const subtletyScore = scoreSubtlety({ expectedLevel, falseClaim, studentAnswer, levelFit, truthLeak });

  return {
    expectedLevel,
    falsehood,
    levelFit,
    truthLeak,
    subtletyScore,
    teacherAuditQuality,
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
