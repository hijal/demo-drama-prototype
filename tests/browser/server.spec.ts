import { expect, test } from "@playwright/test";

test("production serves SvelteKit assets and migrated API endpoints", async ({
  request,
}) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  const html = await home.text();
  expect(html).toContain("__sveltekit_");
  expect(html).not.toContain("__next");
  const asset = html.match(/href="([^"]+\.js)"/);
  expect(asset).toBeTruthy();
  const js = await request.get(asset![1]);
  expect(js.status()).toBe(200);
  expect(js.headers()["content-type"]).toContain("javascript");
  expect((await request.get("/missing.js")).status()).toBe(404);
  expect((await request.get("/.dev.vars")).status()).toBe(404);
  expect((await request.post("/", { data: {} })).status()).toBe(405);
  const invalid = await request.post("/api/comfy/generate", { data: {} });
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toEqual({ error: "Prompt is required." });
});

test("migrated endpoints stream reference uploads and byte-range playback", async ({
  request,
}) => {
  const bytes = Buffer.from("reference-upload-streaming-check");
  const upload = await request.post("/api/comfy/upload", {
    headers: { Origin: "http://127.0.0.1:3107" },
    multipart: {
      image: { name: "reference.png", mimeType: "image/png", buffer: bytes },
    },
  });
  expect(upload.status()).toBe(200);
  const saved = await upload.json();
  expect(saved.staged).toBe(true);
  const url = `/api/comfy/file?type=input&filename=${encodeURIComponent(saved.name)}`;
  const full = await request.get(url);
  expect(full.status()).toBe(200);
  expect(await full.body()).toEqual(bytes);
  const partial = await request.get(url, { headers: { Range: "bytes=2-8" } });
  expect(partial.status()).toBe(206);
  expect(partial.headers()["content-range"]).toBe(`bytes 2-8/${bytes.length}`);
  expect(await partial.body()).toEqual(bytes.subarray(2, 9));
  const invalid = await request.get(url, { headers: { Range: "bytes=9999-" } });
  expect(invalid.status()).toBe(416);
});

test("migrated model endpoint accepts streamed multipart bodies above adapter defaults", async ({
  request,
}) => {
  const bytes = Buffer.alloc(1024 * 1024, 42);
  const upload = await request.post("/api/comfy/diffusion-models", {
    headers: { Origin: "http://127.0.0.1:3107" },
    multipart: {
      file: {
        name: `migration-${Date.now()}.safetensors`,
        mimeType: "application/octet-stream",
        buffer: bytes,
      },
    },
  });
  expect(upload.status()).toBe(200);
  const result = await upload.json();
  expect(result.ok).toBe(true);
  expect(result.size).toBe(bytes.length);
});
