import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uploadArtifact, PART_BYTES } from "../src/artifacts";
async function artifact(size: number, run: (path: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "drama-upload-"));
  try {
    const path = join(root, "synthetic");
    const file = await open(path, "w");
    await file.truncate(size);
    await file.close();
    await run(path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const options = {
  studio: "https://studio.test",
  key: "synthetic",
  jobId: "job",
  claimToken: "claim",
  signal: AbortSignal.timeout(30000),
};
test("small artifacts keep the direct upload protocol and correct media type", () =>
  artifact(4, async (path) => {
    const fetchImpl = (async (url: any, init: any) => {
      assert.ok(String(url).endsWith("/files/clip.mp4"));
      assert.equal(init.headers["Content-Type"], "video/mp4");
      assert.equal(init.body.length, 4);
      return Response.json({ key: "private/video" });
    }) as typeof fetch;
    assert.equal(
      await uploadArtifact({ ...options, fetchImpl }, path, "clip.mp4"),
      "private/video",
    );
  }));
test("large artifacts use bounded parts and retry a transient part failure", () =>
  artifact(PART_BYTES + 3, async (path) => {
    let failed = false;
    const lengths: number[] = [];
    const fetchImpl = (async (url: any, init: any) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/context.safetensors"))
        return Response.json({ uploadId: "upload" });
      if (path.endsWith("/complete")) {
        assert.equal(JSON.parse(init.body).parts.length, 2);
        return Response.json({ key: "private/latent" });
      }
      if (!failed) {
        failed = true;
        return new Response("", { status: 503 });
      }
      lengths.push(init.body.length);
      return Response.json({
        partNumber: lengths.length,
        etag: `etag-${lengths.length}`,
      });
    }) as typeof fetch;
    assert.equal(
      await uploadArtifact(
        { ...options, fetchImpl },
        path,
        "context.safetensors",
      ),
      "private/latent",
    );
    assert.deepEqual(lengths, [PART_BYTES, 3]);
  }));
test("permanent part failure aborts the multipart upload without exposing credentials", () =>
  artifact(PART_BYTES + 1, async (path) => {
    let aborted = false;
    const fetchImpl = (async (url: any) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/final.mp4"))
        return Response.json({ uploadId: "upload" });
      if (path.endsWith("/abort")) {
        aborted = true;
        return Response.json({ ok: true });
      }
      return new Response("", { status: 409 });
    }) as typeof fetch;
    await assert.rejects(
      uploadArtifact({ ...options, fetchImpl }, path, "final.mp4"),
      /409/,
    );
    assert.ok(aborted);
  }));
test("empty SRT remains a valid export for a scene without dialogue", () =>
  artifact(0, async (path) => {
    const fetchImpl = (async (_url: any, init: any) => {
      assert.equal(init.body.length, 0);
      return Response.json({ key: "private/empty.srt" });
    }) as typeof fetch;
    assert.equal(
      await uploadArtifact({ ...options, fetchImpl }, path, "final.srt"),
      "private/empty.srt",
    );
  }));
