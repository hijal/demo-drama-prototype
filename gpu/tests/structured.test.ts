import { test } from "node:test";
import assert from "node:assert/strict";
import { structured, QA_CHECKS, qaMinimum } from "../src/handlers";

test("structured model output tolerates think blocks, fences and surrounding prose", () => {
  assert.deepEqual(structured('{"pass":true}'), { pass: true });
  assert.deepEqual(structured('<think>frames look fine</think>\n{"pass":true,"issues":[]}'), { pass: true, issues: [] });
  assert.deepEqual(structured('```json\n{"pass":false}\n```'), { pass: false });
  assert.deepEqual(structured('Here is the verdict: {"pass":true} Done.'), { pass: true });
  assert.throws(() => structured("no json here"), /valid structured JSON/);
});
test("QA check weights add up to one and the threshold defaults to 75", () => {
  const total = QA_CHECKS.reduce((sum, check) => sum + check.weight, 0);
  assert.equal(Math.round(total * 1000), 1000);
  const saved = process.env.QA_MIN_SCORE;
  delete process.env.QA_MIN_SCORE;
  assert.equal(qaMinimum(), 75);
  process.env.QA_MIN_SCORE = "80";
  assert.equal(qaMinimum(), 80);
  process.env.QA_MIN_SCORE = "abc";
  assert.equal(qaMinimum(), 75);
  if (saved === undefined) delete process.env.QA_MIN_SCORE;
  else process.env.QA_MIN_SCORE = saved;
});
