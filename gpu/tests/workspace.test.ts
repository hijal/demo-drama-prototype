import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  access,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { outputSubfolder, cleanOutputs } from "../src/workspace";
test("job cleanup removes only its attempt output, preserving unrelated ComfyUI files", async () => {
  const root = await mkdtemp(join(tmpdir(), "drama-output-"));
  const job = { id: "../../example", attempt: 2 };
  try {
    const own = join(root, outputSubfolder(job));
    await mkdir(own);
    await writeFile(join(own, "context.safetensors"), "synthetic");
    await writeFile(join(root, "keep.mp4"), "unrelated");
    await cleanOutputs(job, root);
    await assert.rejects(access(own));
    assert.equal(await readFile(join(root, "keep.mp4"), "utf8"), "unrelated");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("input cleanup refuses paths outside its dedicated input directory", async () => {
  const { cleanInputs } = await import("../src/workspace");
  const root = await mkdtemp(join(tmpdir(), "drama-input-"));
  try {
    await writeFile(join(root, "keep.png"), "keep");
    await assert.rejects(cleanInputs(["../keep.png"], root), /outside/);
    assert.equal(await readFile(join(root, "keep.png"), "utf8"), "keep");
    await cleanInputs(["keep.png"], root);
    await assert.rejects(access(join(root, "keep.png")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
