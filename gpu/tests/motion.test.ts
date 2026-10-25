import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMotionWorkflow, MOTION_NODES } from "../src/motion";
import {
  buildMiniMaxH3Workflow,
  type MiniMaxH3Params,
} from "../../src/lib/comfy/minimax-h3-template";
const params: MiniMaxH3Params = {
  prompt: "Synthetic scene",
  aspectRatio: "16:9",
  mode: "ref",
  refImages: ["ada.png"],
  refAudios: ["ada.wav"],
  duration: 6,
  seed: 7,
  targetDimensions: { width: 1920, height: 1080 },
  outputSubfolder: "synthetic",
};
test("disabled continuity leaves the existing H3 workflow unchanged", () => {
  assert.deepEqual(buildMotionWorkflow(params), buildMiniMaxH3Workflow(params));
});
test("first latent-chain clip saves separate low/high AV latents without trimming or time shift", () => {
  const graph = buildMotionWorkflow(params, { enabled: true }) as any;
  assert.equal(graph["17"].inputs.value, 6);
  assert.deepEqual(graph[MOTION_NODES.saveLow].inputs.latent, ["46:21", 1]);
  assert.deepEqual(graph[MOTION_NODES.saveHigh].inputs.latent, ["46:16", 0]);
  assert.equal(graph[MOTION_NODES.trim], undefined);
});
test("chained clip pins both passes at matching resolutions, preserves references and trims AV together", () => {
  const graph = buildMotionWorkflow(params, {
    enabled: true,
    low: "previous-low.safetensors",
    high: "previous-high.safetensors",
  }) as any;
  assert.equal(graph["17"].inputs.value, 6 + 22 / 24);
  assert.deepEqual(graph[MOTION_NODES.pinLow].inputs.latent, ["46:11", 1]);
  assert.deepEqual(graph[MOTION_NODES.pinHigh].inputs.latent, ["46:10", 0]);
  assert.deepEqual(graph["46:29"].inputs.conditioning, [
    MOTION_NODES.pinLow,
    0,
  ]);
  assert.deepEqual(graph["46:32"].inputs.conditioning, [
    MOTION_NODES.pinHigh,
    0,
  ]);
  assert.deepEqual(graph["45"].inputs.images, [MOTION_NODES.trim, 0]);
  assert.deepEqual(graph["45"].inputs.audio, [MOTION_NODES.trim, 1]);
  assert.deepEqual(graph[MOTION_NODES.trim].inputs.trim_frames, [
    MOTION_NODES.pinHigh,
    1,
  ]);
  assert.deepEqual(graph[MOTION_NODES.trim].inputs.images, ["46:48", 0]);
  assert.equal(graph[MOTION_NODES.loadLow].inputs.folder, "input");
  assert.deepEqual(
    graph["46:11"].inputs,
    (buildMiniMaxH3Workflow({ ...params, duration: 6 + 22 / 24 }) as any)[
      "46:11"
    ].inputs,
  );
  // All node links are resolvable and no cycle was introduced around the two samplers.
  const visited = new Set<string>(),
    visiting = new Set<string>();
  function walk(id: string) {
    if (visited.has(id)) return;
    assert.ok(!visiting.has(id), `cycle at ${id}`);
    visiting.add(id);
    for (const value of Object.values(graph[id].inputs)) {
      if (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "string" &&
        typeof value[1] === "number"
      ) {
        assert.ok(graph[value[0]], `missing ${value[0]}`);
        walk(value[0]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }
  Object.keys(graph).forEach(walk);
});
test("partial context and unsupported FLF mode fail instead of silently weakening continuity", () => {
  assert.throws(
    () =>
      buildMotionWorkflow(params, {
        enabled: true,
        low: "only-low.safetensors",
      }),
    /both/i,
  );
  assert.throws(
    () =>
      buildMotionWorkflow(
        { ...params, mode: "flf", firstFrame: "a.png" },
        { enabled: true },
      ),
    /FLF/i,
  );
});
test("a pinned head cannot push the render beyond H3's 719-frame limit", () => {
  assert.throws(
    () =>
      buildMotionWorkflow(
        { ...params, duration: 29.9 },
        { enabled: true, low: "low.safetensors", high: "high.safetensors" },
      ),
    /719/,
  );
});
