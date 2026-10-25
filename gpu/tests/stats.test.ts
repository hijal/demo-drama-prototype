import { test } from "node:test";
import assert from "node:assert/strict";
import { systemStats } from "../src/stats";

test("system stats use the studio sidebar shape and degrade without nvidia-smi", async () => {
  const s = await systemStats();
  assert.equal(typeof s.cpu.percent, "number");
  assert.ok(s.ram.total_gb > 0 && s.ram.used_gb >= 0);
  assert.equal(typeof s.gpu.available, "boolean");
  if (!s.gpu.available) assert.equal(s.gpu.vram_total_gb, 0);
});
