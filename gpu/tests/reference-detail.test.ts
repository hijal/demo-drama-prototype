import { test } from "node:test";
import assert from "node:assert/strict";
import { referenceViews } from "../src/reference-detail";

test("essential reference mode avoids extra views while full sheets remain available", () => {
  assert.deepEqual(referenceViews("essential"), []);
  assert.deepEqual(referenceViews("full"), ["face", "left", "right", "back"]);
  assert.deepEqual(referenceViews(undefined), [
    "face",
    "left",
    "right",
    "back",
  ]);
  assert.throws(() => referenceViews("unknown"), /reference detail/i);
});
