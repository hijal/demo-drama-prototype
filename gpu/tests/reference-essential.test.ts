import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execute, type Context } from "../src/handlers";

test("essential references keep front, sheet and prop variants without rendering unused views", async () => {
  const originalFetch = globalThis.fetch;
  const originalDetail = process.env.REFERENCE_DETAIL;
  const folder = await mkdtemp(join(tmpdir(), "essential-reference-"));
  const uploads: string[] = [];
  let images = 0,
    checks = 0;
  process.env.REFERENCE_DETAIL = "essential";
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/queue") return Response.json({});
    if (path === "/free") return new Response("");
    if (path === "/image") {
      images++;
      return Response.json({ image: "data:image/png;base64,c3ludGhldGlj" });
    }
    if (path === "/v1/chat/completions") {
      checks++;
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 95,
                issues: [],
                observed: "a blue box",
                prompt_changes: "",
              }),
            },
          },
        ],
      });
    }
    throw new Error("Unexpected call " + path);
  };
  const context: Context = {
    folder,
    root: folder,
    studio: "https://studio.test",
    key: "synthetic",
    signal: new AbortController().signal,
    progress: async () => {},
    upload: async (_path, name) => {
      uploads.push(name);
      return "projects/synthetic/" + name;
    },
    job: {
      id: "reference",
      project_id: "synthetic",
      attempt: 1,
      claim_token: "token",
      type: "asset",
      payload: {
        spec: {
          name: "Box",
          kind: "prop",
          fields: { LOOK: "blue box" },
          variants: [{ look: "lid open" }],
        },
      },
    },
  };
  try {
    const result = (await execute(context)) as {
      files: Record<string, string>;
    };
    assert.equal(images, 2);
    assert.equal(checks, 1);
    assert.deepEqual(uploads, ["front.png", "variant-0.png"]);
    assert.equal(result.files.sheet, result.files.front);
    assert.ok(result.files.variant_0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDetail === undefined) delete process.env.REFERENCE_DETAIL;
    else process.env.REFERENCE_DETAIL = originalDetail;
    await rm(folder, { recursive: true, force: true });
  }
});
