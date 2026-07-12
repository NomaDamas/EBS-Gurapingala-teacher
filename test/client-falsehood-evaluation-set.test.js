import test from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_FALSEHOOD_EVALUATION_SET,
  CLIENT_FALSEHOOD_QUESTION_COUNT
} from "../src/domain/client-falsehood-evaluation-set.js";
import {
  resolveFalsehoodForTurn,
  selectCaseForTurn
} from "../src/domain/misinfo-policy.js";

test("client falsehood DB evaluation covers all 36 assertions with three neutral questions each", () => {
  assert.equal(CLIENT_FALSEHOOD_EVALUATION_SET.length, 36);
  assert.equal(CLIENT_FALSEHOOD_QUESTION_COUNT, 108);
  assert.equal(new Set(CLIENT_FALSEHOOD_EVALUATION_SET.map((item) => item.id)).size, 36);
  for (const item of CLIENT_FALSEHOOD_EVALUATION_SET) {
    assert.equal(item.questions.length, 3);
    assert.ok(item.falseClaim.length >= 20);
    assert.ok(item.questions.every((question) => question.endsWith("?")));
  }
});

test("all 108 client questions route to their intended Combination falsehood seed", () => {
  for (const item of CLIENT_FALSEHOOD_EVALUATION_SET) {
    for (const question of item.questions) {
      const selected = selectCaseForTurn({
        message: question,
        recentMessages: [],
        turnIndex: 0
      });
      const resolved = resolveFalsehoodForTurn({
        selected,
        level: 5,
        turnIndex: 0,
        message: question
      });
      assert.equal(
        resolved.falseClaim,
        item.falseClaim,
        `${item.id} routed through ${selected.id}: ${question}`
      );
    }
  }
});
