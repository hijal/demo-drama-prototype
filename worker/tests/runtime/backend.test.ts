import { beforeAll, afterAll, expect, test } from "vitest";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { film, loose } from "../fixtures";
let mf: Miniflare;
const headers = {
  "Content-Type": "application/json",
  Origin: "http://studio.test",
};
const gpu = { ...headers, "X-GPU-Key": "test-gpu-secret" };
const request = (path: string, data?: unknown, method = "POST", extra = {}) =>
  mf.dispatchFetch("http://studio.test" + path, {
    method: data === undefined ? "GET" : method,
    headers: { ...headers, ...extra },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
beforeAll(async () => {
  mf = new Miniflare({
    workers: [
      {
        config: {
          name: "pipeline",
          compatibilityDate: "2026-10-25",
          compatibilityFlags: ["nodejs_compat"],
          manifest: {
            mainModule: "index.js",
            modules: {
              "index.js": {
                type: "esm",
                contents: await readFile(".test-build/index.js", "utf8"),
              },
            },
          },
          env: {
            DB: { type: "d1", name: "test" },
            MEDIA: { type: "r2", name: "test-media" },
            LOGHUB: {
              type: "durable-object",
              worker: "pipeline",
              exportName: "LogHub",
            },
            AUTH_MODE: { type: "text", value: "local" },
            ACCESS_TEAM: { type: "text", value: "" },
            ACCESS_AUD: { type: "text", value: "" },
            OWNER_EMAIL: { type: "text", value: "" },
            GPU_KEY: { type: "text", value: "test-gpu-secret" },
          },
          exports: { LogHub: { type: "durable-object", storage: "sqlite" } },
        },
      },
    ],
  });
  const db = await mf.getD1Database("DB");
  const schema = await readFile("migrations/0001_pipeline.sql", "utf8");
  for (const sql of schema.split(";").filter((s) => s.trim()))
    await db.prepare(sql).run();
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
async function project() {
  return (await (
    await request("/api/projects", { title: "Synthetic delivery" })
  ).json()) as any;
}
test("rejects cross-origin writes and wrong GPU credentials", async () => {
  expect(
    (
      await request("/api/projects", { title: "X" }, "POST", {
        Origin: "https://evil.test",
      })
    ).status,
  ).toBe(403);
  expect((await request("/api/gpu/claim", { workerId: "w" })).status).toBe(401);
});
test("approval validates scripts and publishes assets/scenes atomically", async () => {
  const p = await project();
  expect(
    (await request(`/api/projects/${p.id}/scripts`, { body: loose })).status,
  ).toBe(201);
  let detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  expect(
    (
      await request(`/api/projects/${p.id}/approve-script`, {
        versionId: detail.scripts[0].id,
        revision: detail.project.revision,
      })
    ).status,
  ).toBe(422);
  await request(`/api/projects/${p.id}/scripts`, { body: film });
  detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  expect(
    (
      await request(`/api/projects/${p.id}/approve-script`, {
        versionId: detail.scripts[0].id,
        revision: detail.project.revision,
      })
    ).status,
  ).toBe(200);
  detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  expect(detail.scenes).toHaveLength(1);
  expect(detail.assets).toHaveLength(4);
  expect(
    (
      await request(
        `/api/projects/${p.id}/scenes/${detail.scenes[0].id}/render`,
        {},
      )
    ).status,
  ).toBe(409);
});
test("atomic claim grants a job once; expired or cancelled claim cannot finish", async () => {
  const p = await project();
  await request(`/api/projects/${p.id}/scripts`, { body: film, fix: true });
  const claims = await Promise.all([
    request("/api/gpu/claim", { workerId: "a" }, "POST", gpu),
    request("/api/gpu/claim", { workerId: "b" }, "POST", gpu),
  ]);
  const jobs = (await Promise.all(claims.map((r) => r.json()))) as any[];
  const found = jobs.filter((x) => x.job);
  expect(found).toHaveLength(1);
  const job = found[0].job;
  expect(
    (
      await request(
        `/api/gpu/jobs/${job.id}/done`,
        { claim_token: "wrong", result: {} },
        "POST",
        gpu,
      )
    ).status,
  ).toBe(409);
  await request(`/api/projects/${p.id}/jobs/${job.id}/cancel`, {});
  expect(
    (
      await request(
        `/api/gpu/jobs/${job.id}/done`,
        { claim_token: job.claim_token, result: {} },
        "POST",
        gpu,
      )
    ).status,
  ).toBe(409);
});
test("GPU completion is idempotent and owner approval remains required", async () => {
  const p = await project();
  await request(`/api/projects/${p.id}/scripts`, { body: film, fix: true });
  const { job } = (await (
    await request("/api/gpu/claim", { workerId: "w" }, "POST", gpu)
  ).json()) as any;
  const payload = { claim_token: job.claim_token, result: { script: film } };
  expect(
    (await request(`/api/gpu/jobs/${job.id}/done`, payload, "POST", gpu))
      .status,
  ).toBe(200);
  expect(
    (await request(`/api/gpu/jobs/${job.id}/done`, payload, "POST", gpu))
      .status,
  ).toBe(200);
  const detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  expect(detail.scripts.filter((s: any) => s.kind === "fixed")).toHaveLength(1);
  expect(detail.project.approved_script_id).toBeNull();
});

test("uploaded assets, clip QA, final assembly and stale propagation work end-to-end", async () => {
  const p = await project();
  await request(`/api/projects/${p.id}/scripts`, { body: film });
  let detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  await request(`/api/projects/${p.id}/approve-script`, {
    versionId: detail.scripts[0].id,
    revision: 0,
  });
  detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  async function claim() {
    return (
      (await (
        await request("/api/gpu/claim", { workerId: "pipeline" }, "POST", gpu)
      ).json()) as any
    ).job;
  }
  async function put(job: any, name: string, type = "image/png") {
    const response = await mf.dispatchFetch(
      `http://studio.test/api/gpu/jobs/${job.id}/files/${name}`,
      {
        method: "PUT",
        headers: {
          "X-GPU-Key": "test-gpu-secret",
          "X-Claim-Token": job.claim_token,
          "Content-Type": type,
        },
        body: "synthetic-media-bytes",
      },
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as any).key;
  }
  async function done(job: any, result: unknown) {
    const response = await request(
      `/api/gpu/jobs/${job.id}/done`,
      { claim_token: job.claim_token, result },
      "POST",
      gpu,
    );
    expect(response.status, await response.text()).toBe(200);
  }
  for (const asset of detail.assets) {
    await request(
      `/api/projects/${p.id}/assets/${encodeURIComponent(asset.id)}/generate`,
      {},
    );
    const job = await claim();
    const image = await put(job, "sheet.png"),
      voice = await put(job, "voice.wav", "audio/wav");
    await done(job, {
      files: {
        sheet: image,
        front: image,
        voice,
        ...Object.fromEntries(
          (job.payload.spec.variants || []).map((_: unknown, i: number) => [
            `variant_${i}`,
            image,
          ]),
        ),
      },
    });
    expect(
      (
        await request(
          `/api/projects/${p.id}/assets/${encodeURIComponent(asset.id)}/approve`,
          { version: 1 },
        )
      ).status,
    ).toBe(200);
  }
  await request(
    `/api/projects/${p.id}/scenes/${encodeURIComponent(detail.scenes[0].id)}/render`,
    {},
  );
  const clipJob = await claim();
  const video = await put(clipJob, "clip.mp4", "video/mp4");
  await done(clipJob, { key: video, prompt: "Synthetic prompt" });
  const qaJob = await claim();
  expect(qaJob.type).toBe("qa");
  await done(qaJob, { pass: true, issues: [], words: [], alignedLines: [] });
  const assembled = await request(`/api/projects/${p.id}/assemble`, {
    episode: 0,
  });
  expect(assembled.status).toBe(200);
  const assembleJob = await claim();
  await done(assembleJob, {
    files: {
      video: await put(assembleJob, "final.mp4", "video/mp4"),
      subtitles: await put(assembleJob, "final.srt", "text/plain"),
    },
  });
  detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  expect(detail.renders[0].status).toBe("ready");
  expect(detail.scenes[0].approved_clip_id).toBe(clipJob.payload.clipId);
  await request(`/api/projects/${p.id}/scripts`, { body: "\n" + film });
  let edited = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  await request(`/api/projects/${p.id}/approve-script`, {
    versionId: edited.scripts[0].id,
    revision: edited.project.revision,
  });
  edited = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  expect(edited.assets.every((a: any) => a.approved_version === 1)).toBe(true);
  expect(edited.clips[0].status).toBe("ready");
  expect(edited.renders[0].status).toBe("ready");
  const partial = await mf.dispatchFetch(
    `http://studio.test/api/media?key=${encodeURIComponent(video)}`,
    { headers: { Range: "bytes=0-3" } },
  );
  expect(partial.status).toBe(206);
  expect(await partial.text()).toBe("synt");
  const asset = detail.assets[0];
  await request(
    `/api/projects/${p.id}/assets/${encodeURIComponent(asset.id)}/generate`,
    { instruction: "Change outfit" },
  );
  const replacement = await claim();
  const sheet = await put(replacement, "sheet.png");
  await done(replacement, {
    files: {
      sheet,
      front: sheet,
      voice: await put(replacement, "voice.wav", "audio/wav"),
    },
  });
  await request(
    `/api/projects/${p.id}/assets/${encodeURIComponent(asset.id)}/approve`,
    { version: 2 },
  );
  detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  expect(detail.clips[0].status).toBe("stale");
  expect(detail.renders[0].status).toBe("stale");
});

test("cancelled and exhausted render jobs release the scene for another take", async () => {
  const db = await mf.getD1Database("DB");
  const p = await project();
  await db
    .prepare(
      "INSERT INTO episodes (id,project_id,number,title) VALUES ('failure-episode',?,0,'Failure')",
    )
    .bind(p.id)
    .run();
  await db
    .prepare(
      "INSERT INTO scenes (id,episode_id,number,duration,spec_json,content_hash,script_version_id) VALUES ('failure-scene','failure-episode',1,5,'{}','hash','v')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO clips (id,scene_id,take,asset_versions_json,script_version_id,created_at) VALUES ('failure-clip','failure-scene',1,'{}','v',0)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO jobs (id,project_id,type,payload_json,created_at,updated_at) VALUES ('failure-job',?,'clip','{\"clipId\":\"failure-clip\"}',0,0)",
    )
    .bind(p.id)
    .run();
  expect(
    (await request(`/api/projects/${p.id}/jobs/failure-job/cancel`, {})).status,
  ).toBe(200);
  expect(
    (
      (await db
        .prepare("SELECT status FROM clips WHERE id='failure-clip'")
        .first()) as any
    ).status,
  ).toBe("failed");
});

test("GET requests cannot mutate projects through action URLs", async () => {
  const p = await project();
  expect((await request(`/api/projects/${p.id}/stop`)).status).toBe(405);
  expect(
    (await request(`/api/projects/${p.id}/jobs/unknown/cancel`)).status,
  ).toBe(405);
});

test("character reference completion requires both portrait and voice", async () => {
  const p = await project();
  await request(`/api/projects/${p.id}/scripts`, { body: film });
  let detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  await request(`/api/projects/${p.id}/approve-script`, {
    versionId: detail.scripts[0].id,
    revision: 0,
  });
  detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  const asset = detail.assets.find((a: any) => a.kind === "character");
  await request(
    `/api/projects/${p.id}/assets/${encodeURIComponent(asset.id)}/generate`,
    {},
  );
  const { job } = (await (
    await request(
      "/api/gpu/claim",
      { workerId: "incomplete-reference" },
      "POST",
      gpu,
    )
  ).json()) as any;
  const upload = await mf.dispatchFetch(
    `http://studio.test/api/gpu/jobs/${job.id}/files/sheet.png`,
    {
      method: "PUT",
      headers: {
        "X-GPU-Key": "test-gpu-secret",
        "X-Claim-Token": job.claim_token,
      },
      body: "synthetic-sheet",
    },
  );
  const { key } = (await upload.json()) as any;
  expect(
    (
      await request(
        `/api/gpu/jobs/${job.id}/done`,
        {
          claim_token: job.claim_token,
          result: { files: { sheet: key, front: key } },
        },
        "POST",
        gpu,
      )
    ).status,
  ).toBe(422);
  await request(`/api/projects/${p.id}/jobs/${job.id}/cancel`, {});
});
