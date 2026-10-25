import { expect, type Page } from "@playwright/test";

export async function mockBackend(page: Page) {
  let config = {
    reserve_gb: 3,
    dynamic_vram: true,
    comfy_dir: "/tmp/studio",
    diffusion_model: "",
    sound_on: false,
  };
  const submissions: any[] = [],
    settings: any[] = [],
    deletions: any[] = [];
  let videos = [
    {
      filename: "scene.mp4",
      subfolder: "Episode 1",
      url: "/api/comfy/file?filename=scene.mp4",
      type: "video",
      mtime: 1,
      generationTime: 12,
    },
  ];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      pathname = url.pathname;
    const body = request.headers()["content-type"]?.includes("application/json")
      ? request.postDataJSON()
      : null;
    let data: any = {};
    if (pathname === "/api/comfy/health")
      data = { system: { os: "linux", comfyui_version: "test" }, devices: [] };
    else if (pathname === "/api/config") {
      if (body) {
        settings.push(body);
        config = { ...config, ...body };
      }
      data = config;
    } else if (pathname === "/api/comfy/model-options")
      data = {
        fps: 24,
        frames_minimum: 60,
        frames_maximum: 719,
        frames_steps: 17,
      };
    else if (pathname === "/api/comfy/files")
      data = { files: videos, folders: ["Episode 1"] };
    else if (pathname === "/api/models/status") data = { models: [] };
    else if (pathname === "/api/loras") data = { loras: [] };
    else if (pathname === "/api/comfy/diffusion-models")
      data = {
        models: [],
        default: "default.safetensors",
        current: "default.safetensors",
      };
    else if (pathname === "/api/comfy/meta") {
      expect(url.searchParams.get("path")).toBe("Episode 1/scene.mp4");
      data = {
        prompt: "Original frame scene",
        generation_mode: "flf",
        seed: 42,
        resolution: "1620x1080",
        flf_resolution: "1620x1080",
        first_frame: "frame.png",
        first_frame_width: 1500,
        first_frame_height: 1000,
      };
    } else if (pathname === "/api/comfy/upload") data = { name: "input.png" };
    else if (pathname === "/api/comfy/generate") {
      submissions.push(body);
      data = { prompt_id: `prompt-${submissions.length}` };
    } else if (pathname === "/api/comfy/status") data = { status: "queued" };
    else if (pathname === "/api/comfy/preview") data = { preview: null };
    else if (pathname === "/api/comfy/delete") {
      deletions.push(body);
      videos = videos.filter((f) => f.filename !== body.filename);
      data = { ok: true };
    } else if (pathname === "/api/comfy/file") {
      if (request.method() === "HEAD") {
        await route.fulfill({ status: 200 });
        return;
      }
      await route.fulfill({ status: 200, contentType: "video/mp4", body: "" });
      return;
    } else if (pathname === "/api/comfy/cancel") data = { ok: true };
    await route.fulfill({ json: data });
  });
  return { submissions, settings, deletions };
}
