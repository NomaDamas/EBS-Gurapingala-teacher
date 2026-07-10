import { buildEvaluationSet } from "./misinfo-policy.js";

export const EVALUATION_SET_50 = buildEvaluationSet(50);
export const PUBLIC_EVALUATION_SET_50 = EVALUATION_SET_50.map(toPublicEvaluationTurn);

export function toPublicEvaluationTurn(item) {
  return {
    turn: item.turn,
    studentQuestion: item.studentQuestion,
    expectedLevel: item.expectedLevel
  };
}
