import { test } from "node:test";
import assert from "node:assert/strict";
import { structured } from "../src/handlers";

test("structured model output tolerates think blocks, fences and surrounding prose", () => {
  assert.deepEqual(structured('{"pass":true}'), { pass: true });
  assert.deepEqual(structured('<think>frames look fine</think>\n{"pass":true,"issues":[]}'), { pass: true, issues: [] });
  assert.deepEqual(structured('```json\n{"pass":false}\n```'), { pass: false });
  assert.deepEqual(structured('Here is the verdict: {"pass":true} Done.'), { pass: true });
  assert.throws(() => structured("no json here"), /valid structured JSON/);
});
