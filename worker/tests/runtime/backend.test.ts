import { beforeAll, afterAll, expect, test } from "vitest";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
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
  const schema = (
    await Promise.all(
      (await readdir("migrations"))
        .filter((name) => name.endsWith(".sql"))
        .sort()
        .map((name) => readFile(`migrations/${name}`, "utf8")),
    )
  ).join("\n");
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
  const contextLow = await put(
      clipJob,
      "context-low.safetensors",
      "application/octet-stream",
    ),
    contextHigh = await put(
      clipJob,
      "context-high.safetensors",
      "application/octet-stream",
    );
  await done(clipJob, {
    key: video,
    prompt: "Synthetic prompt",
    files: { contextLow, contextHigh },
  });
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
  expect(JSON.parse(detail.clips[0].params_json).contextLatents).toEqual({
    low: contextLow,
    high: contextHigh,
  });
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

test("multipart artifacts stream into private R2 and cancelled claims cannot upload another part", async () => {
  const p = await project();
  await request(`/api/projects/${p.id}/scripts`, { body: film, fix: true });
  const { job } = (await (
    await request("/api/gpu/claim", { workerId: "multipart" }, "POST", gpu)
  ).json()) as any;
  const base = `/api/gpu/jobs/${job.id}/multipart/context-high.safetensors`;
  const start = await request(
    base,
    { claim_token: job.claim_token, contentType: "application/octet-stream" },
    "POST",
    gpu,
  );
  expect(start.status).toBe(200);
  const { uploadId, key } = (await start.json()) as any;
  async function part(number: number, size: number) {
    const response = await mf.dispatchFetch(
      `http://studio.test${base}/${encodeURIComponent(uploadId)}/${number}`,
      {
        method: "PUT",
        headers: {
          "X-GPU-Key": "test-gpu-secret",
          "X-Claim-Token": job.claim_token,
          "Content-Length": String(size),
        },
        body: new Uint8Array(size).fill(number),
      },
    );
    expect(response.status).toBe(200);
    return response.json();
  }
  const parts = [await part(1, 5 * 1024 * 1024), await part(2, 32)];
  const complete = () =>
    request(
      `${base}/${encodeURIComponent(uploadId)}/complete`,
      { claim_token: job.claim_token, parts },
      "POST",
      gpu,
    );
  expect((await complete()).status).toBe(200);
  expect((await complete()).status).toBe(200);
  const object = await (await mf.getR2Bucket("MEDIA")).get(key);
  expect(object?.size).toBe(5 * 1024 * 1024 + 32);
  const next = await request(
    base,
    { claim_token: job.claim_token },
    "POST",
    gpu,
  );
  const nextUpload = (await next.json()) as any;
  await request(`/api/projects/${p.id}/jobs/${job.id}/cancel`, {});
  const denied = await mf.dispatchFetch(
    `http://studio.test${base}/${encodeURIComponent(nextUpload.uploadId)}/1`,
    {
      method: "PUT",
      headers: {
        "X-GPU-Key": "test-gpu-secret",
        "X-Claim-Token": job.claim_token,
        "Content-Length": "1",
      },
      body: new Uint8Array(1),
    },
  );
  expect(denied.status).toBe(409);
  expect(
    await (
      await mf.getD1Database("DB")
    )
      .prepare("SELECT upload_id FROM job_uploads WHERE job_id=?")
      .bind(job.id)
      .first(),
  ).toBeNull();
});

test("editing an earlier scene invalidates unchanged takes that depend on its motion context", async () => {
  const p = await project(),
    db = await mf.getD1Database("DB");
  const scene = film.slice(film.indexOf("SCENE 1 |"));
  const two = film + "\n" + scene.replace("SCENE 1 |", "SCENE 2 |");
  await request(`/api/projects/${p.id}/scripts`, { body: two });
  let detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  expect(
    (
      await request(`/api/projects/${p.id}/approve-script`, {
        versionId: detail.scripts[0].id,
        revision: 0,
      })
    ).status,
  ).toBe(200);
  detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  expect(detail.scenes).toHaveLength(2);
  for (let i = 0; i < 2; i++) {
    const clip = `${p.id}:take${i}`;
    await db
      .prepare(
        "INSERT INTO clips (id,scene_id,take,asset_versions_json,context_clip_id,script_version_id,status,r2_key,created_at) VALUES (?,?,1,'{}',?,?,'ready','synthetic',0)",
      )
      .bind(
        clip,
        detail.scenes[i].id,
        i ? `${p.id}:take0` : null,
        detail.project.approved_script_id,
      )
      .run();
    await db
      .prepare("UPDATE scenes SET approved_clip_id=? WHERE id=?")
      .bind(clip, detail.scenes[i].id)
      .run();
  }
  await request(`/api/projects/${p.id}/scripts`, {
    body: two.replace(
      "SCENE 1 | 6s | Delivery",
      "SCENE 1 | 6s | Changed delivery",
    ),
  });
  detail = (await (await request(`/api/projects/${p.id}`)).json()) as any;
  expect(
    (
      await request(`/api/projects/${p.id}/approve-script`, {
        versionId: detail.scripts[0].id,
        revision: detail.project.revision,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      (await db
        .prepare("SELECT status FROM clips WHERE id=?")
        .bind(`${p.id}:take1`)
        .first()) as any
    ).status,
  ).toBe("stale");
});

test("idle heartbeat cannot indefinitely renew a claim whose response the GPU lost", async () => {
  const p = await project();
  await request(`/api/projects/${p.id}/scripts`, { body: film, fix: true });
  const { job } = (await (
    await request("/api/gpu/claim", { workerId: "lost-response" }, "POST", gpu)
  ).json()) as any;
  const db = await mf.getD1Database("DB"),
    lease = Date.now() + 5000;
  await db
    .prepare("UPDATE jobs SET lease_until=? WHERE id=?")
    .bind(lease, job.id)
    .run();
  await request(
    "/api/gpu/heartbeat",
    { workerId: "lost-response" },
    "POST",
    gpu,
  );
  expect(
    (
      (await db
        .prepare("SELECT lease_until FROM jobs WHERE id=?")
        .bind(job.id)
        .first()) as any
    ).lease_until,
  ).toBe(lease);
  await request(`/api/projects/${p.id}/jobs/${job.id}/cancel`, {});
});
test("hands-off flow: upload auto-repairs and approves, references and scenes approve themselves by QA score", async () => {
  const series = await readFile("../docs/templates/series_template.txt", "utf8");
  // Both episodes miss CAMERA, so both need the LLM.
  const broken = series.replace(/^ {2}CAMERA: .*\n/gm, "");
  const [shared, episode2] = series.split(/(?=== EPISODE 02)/);
  const head = shared.split(/(?=== EPISODE 01)/)[0];
  const p = await project();
  const worker = "flow-" + crypto.randomUUID();
  await request(
    "/api/gpu/heartbeat",
    { workerId: worker, info: {} },
    "POST",
    gpu,
  );
  const upload = (await (
    await request(`/api/projects/${p.id}/scripts`, {
      body: broken,
      fix: true,
      autoApprove: true,
    })
  ).json()) as any;
  expect(upload.approved).toBe(false);
  async function claim(id = worker) {
    return (
      (await (
        await request("/api/gpu/claim", { workerId: id }, "POST", gpu)
      ).json()) as any
    ).job;
  }
  async function put(job: any, name: string) {
    return (
      (await (
        await mf.dispatchFetch(
          `http://studio.test/api/gpu/jobs/${job.id}/files/${name}`,
          {
            method: "PUT",
            headers: {
              "X-GPU-Key": "test-gpu-secret",
              "X-Claim-Token": job.claim_token,
            },
            body: "synthetic-media-bytes",
          },
        )
      ).json()) as any
    ).key;
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
  const detailOf = async () =>
    (await (await request(`/api/projects/${p.id}`)).json()) as any;

  const first = await claim();
  expect(first.payload.episode).toBe(1);
  expect(first.payload.remaining).toEqual([2]);
  await done(first, { script: shared });
  const second = await claim();
  expect(second.payload.episode).toBe(2);
  expect(second.payload.rawVersion).toBe(`fixed:${first.id}`);
  await done(second, { script: head + episode2 });
  // No errors remain, so the script approved itself and every reference started.
  let detail = await detailOf();
  expect(detail.project.approved_script_id).toBe(`fixed:${second.id}`);
  expect(detail.assets.every((a: any) => a.status === "generating")).toBe(true);

  for (let i = 0; i < detail.assets.length; i++) {
    const job = await claim();
    expect(job.type).toBe("asset");
    expect(job.payload.autoApprove).toBe(true);
    const image = await put(job, "sheet.png");
    await done(job, {
      files: {
        sheet: image,
        front: image,
        voice: await put(job, "voice.wav"),
        ...Object.fromEntries(
          (job.payload.spec.variants || []).map((_: unknown, n: number) => [
            `variant_${n}`,
            image,
          ]),
        ),
      },
      qa: { score: 81, threshold: 75, issues: [], observed: "", prompt_changes: "" },
    });
  }
  // References approved themselves; rendering of episode 1 started on its own.
  detail = await detailOf();
  expect(detail.assets.every((a: any) => a.approved_version === 1)).toBe(true);
  expect(JSON.parse(detail.assetVersions[0].files_json).qa.score).toBe(81);
  expect(detail.project.auto_episode).toBe(1);

  // A power cut: the claiming runtime dies; a new runtime takes the job back at once.
  const lost = await claim("dead-runtime");
  expect(lost.type).toBe("clip");
  // Its last heartbeat and claim are older than a minute.
  await (await mf.getD1Database("DB"))
    .prepare("UPDATE jobs SET claimed_at=claimed_at-120000 WHERE id=?")
    .bind(lost.id)
    .run();
  const resumed = await claim();
  expect(resumed.id).toBe(lost.id);
  expect(resumed.attempt).toBe(lost.attempt);

  // Scene QA below 75% three times: retakes carry QA's prompt changes, then the best take is selected.
  let clipJob = resumed;
  const scores = [60, 72, 55, 64];
  for (let i = 0; i < scores.length; i++) {
    expect(clipJob.type).toBe("clip");
    expect(clipJob.payload.retake).toBe(i);
    if (i) expect(clipJob.payload.hint).toBe(`fix ${i - 1}`);
    await done(clipJob, { key: await put(clipJob, "clip.mp4"), prompt: "p" });
    const qa = await claim();
    expect(qa.type).toBe("qa");
    await done(qa, {
      score: scores[i],
      threshold: 75,
      pass: false,
      issues: ["face cut off"],
      fix_hint: `fix ${i}`,
      words: [],
      alignedLines: [],
    });
    clipJob = await claim();
  }
  detail = await detailOf();
  const ep1 = detail.scenes.find((s: any) => s.episode_number === 1);
  const chosen = detail.clips.find((c: any) => c.id === ep1.approved_clip_id);
  expect(JSON.parse(chosen.qa_json).score).toBe(72);
  expect(JSON.parse(chosen.params_json).appliedChanges).toBe("fix 0");
  // Episode 1 is done, so episode 2 continues without a click.
  expect(clipJob.type).toBe("clip");
  expect(clipJob.payload.sceneId).toContain(":ep2:s1");
  await done(clipJob, { key: await put(clipJob, "clip.mp4"), prompt: "p" });
  const passing = await claim();
  await done(passing, {
    score: 88,
    threshold: 75,
    pass: true,
    issues: [],
    fix_hint: "",
    words: [],
    alignedLines: [],
  });
  detail = await detailOf();
  expect(detail.scenes.every((s: any) => s.approved_clip_id)).toBe(true);
  expect(detail.project.auto_episode).toBeNull();
  expect(await claim()).toBeNull();

  // Live-test regression: a scene's follow-up step was lost, leaving the
  // automatic queue on with nothing queued. The next claim heals it.
  const db = await mf.getD1Database("DB");
  const ep2 = detail.scenes.find((s: any) => s.episode_number === 2);
  await db
    .prepare("UPDATE scenes SET approved_clip_id=NULL WHERE id=?")
    .bind(ep2.id)
    .run();
  await db
    .prepare("UPDATE projects SET auto_episode=2 WHERE id=?")
    .bind(p.id)
    .run();
  const healed = await claim();
  expect(healed.type).toBe("clip");
  expect(healed.payload.sceneId).toBe(ep2.id);
  expect(healed.error ?? null).toBeNull();
  const lines = (await (
    await request(`/api/projects/${p.id}/logs`)
  ).json()) as any[];
  expect(lines.some((l) => l.line.includes("automatic queue had stopped"))).toBe(
    true,
  );
});
