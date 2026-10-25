import { test } from "node:test";
import assert from "node:assert/strict";
import { comfy } from "../src/comfy";

test("ComfyUI routes with an empty 200 body resolve instead of failing JSON parsing", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  assert.deepEqual(await comfy("/free", { unload_models: true, free_memory: true }), {});
});

test("ComfyUI JSON responses are still parsed", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ queue_running: [], queue_pending: [] }),
  );
  assert.deepEqual(await comfy("/queue"), { queue_running: [], queue_pending: [] });
});
