import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMixLevels, selectTurnMode } from "../src/worker.js";

test("mixed mode normalizes selected truth and falsehood levels", () => {
  assert.deepEqual(normalizeMixLevels([0, "5", "2", 2, 7, -1, "x"]), [0, 5, 2]);
  assert.deepEqual(normalizeMixLevels([]), [0, 5, 1, 2, 3, 4]);
});

test("mixed mode deterministically rotates truth and selected Levels", () => {
  const config = { responseMode: "mixed", level: 4, mixLevels: [0, 2, 3] };
  assert.deepEqual(selectTurnMode({ ...config, turnIndex: 0 }), { responseMode: "truth", level: null });
  assert.deepEqual(selectTurnMode({ ...config, turnIndex: 1 }), { responseMode: "experiment", level: 2 });
  assert.deepEqual(selectTurnMode({ ...config, turnIndex: 2 }), { responseMode: "experiment", level: 3 });
  assert.deepEqual(selectTurnMode({ ...config, turnIndex: 3 }), { responseMode: "truth", level: null });
});

test("single truth and experiment modes remain backward compatible", () => {
  assert.deepEqual(selectTurnMode({ responseMode: "truth", level: 4 }), { responseMode: "truth", level: null });
  assert.deepEqual(selectTurnMode({ responseMode: "experiment", level: 4 }), { responseMode: "experiment", level: 4 });
  assert.deepEqual(selectTurnMode({ responseMode: "experiment", level: 5 }), { responseMode: "experiment", level: 5 });
});
