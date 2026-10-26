import { test } from "node:test";
import assert from "node:assert/strict";
import { assessTranscript, evaluateQa, framePlan } from "../src/qa";
import { parseScript } from "../../worker/src/script/parse";

const words = (text: string) =>
  text
    .split(" ")
    .map((word, i) => ({ word, start: i * 0.2, end: i * 0.2 + 0.15 }));
test("ASR repetition and invalid timestamps cannot masquerade as trustworthy speech", () => {
  assert.equal(assessTranscript(words("Hello little world"), 8).reliable, true);
  assert.equal(
    assessTranscript(words(Array(444).fill("Ha").join(" ")), 8).reliable,
    false,
  );
  assert.equal(
    assessTranscript([{ word: "hello", start: NaN, end: 1 }], 8).reliable,
    false,
  );
  assert.equal(
    assessTranscript([{ word: "hello", start: 2, end: 1 }], 8).reliable,
    false,
  );
  assert.equal(
    assessTranscript([{ word: "hello", start: 0, end: 100 }], 8).reliable,
    false,
  );
  assert.equal(assessTranscript([], 8).reliable, true);
  assert.equal(assessTranscript(words("ha ha ha"), 8).reliable, true);
});
test("perfect pictures cannot pass missing dialogue, while silent scenes remain valid", () => {
  assert.equal(evaluateQa(100, 1, true, true, 0, 75).pass, false);
  assert.equal(evaluateQa(100, 0, true, false, 0, 75).needsOwnerReview, true);
  assert.equal(evaluateQa(100, 0, false, true, 0, 75).pass, true);
  assert.equal(evaluateQa(90, 0.1, true, true, 0, 75).pass, true);
});
test("QA frames carry shot-relative cast and camera, scaled to actual clip duration", () => {
  const scene = parseScript(`DRAMA SCRIPT
TITLE: Closeups
ASPECT: 9:16
== SCENES ==
SCENE 1 | 8s | Conversation
  CAST: @cat, @dog, @narrator (voice)
  CAMERA: wide
  SHOT 1 | 4s | Cat
    CAST: @cat
    CAMERA: close-up on cat
  SHOT 2 | 4s | Dog
    CAST: @dog
    CAMERA: close-up on dog
`).episodes[0].scenes[0];
  const frames = framePlan(scene, 10);
  assert.equal(frames.length, 6);
  assert.ok(
    frames
      .slice(0, 3)
      .every(
        (f) =>
          f.at < 5 &&
          f.shot === 1 &&
          f.cast === "@cat" &&
          f.camera === "close-up on cat",
      ),
  );
  assert.ok(
    frames
      .slice(3)
      .every((f) => f.at >= 5 && f.shot === 2 && f.cast === "@dog"),
  );
  assert.ok(frames.every((f) => f.at >= 0 && f.at < 10));
  assert.equal(framePlan({ ...scene, shots: [] }, 0.1).length, 3);
});
test("malformed ASR and impossible scene durations cannot silently pass", () => {
  assert.equal(assessTranscript(null, 8).reliable, false);
  assert.equal(
    assessTranscript([{ word: "hello", start: 0, end: null }], 8).reliable,
    false,
  );
  assert.equal(assessTranscript(words("hello"), 0).reliable, false);
  const scene = parseScript(
    "DRAMA SCRIPT\nTITLE: Tiny\nASPECT: 9:16\nSCENE 1 | 8s | A scene",
  ).episodes[0].scenes[0];
  assert.throws(() => framePlan(scene, 0), /duration/i);
});
