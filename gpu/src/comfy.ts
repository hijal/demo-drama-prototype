import { type MiniMaxH3Params } from "../../src/lib/comfy/minimax-h3-template";
import { openAsBlob } from "node:fs";
import {
  buildMotionWorkflow,
  MOTION_NODES,
  type MotionContext,
} from "./motion";
import { download, probe } from "./io";
import { join } from "node:path";
const base = (process.env.COMFY_URL || "http://127.0.0.1:8188").replace(
  /\/$/,
  "",
);
export const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const done = () => {
        signal?.removeEventListener("abort", cancel);
        resolve();
      },
      timer = setTimeout(done, ms);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
export async function comfy(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal || AbortSignal.timeout(30000),
  });
  if (!r.ok)
    throw new Error(`ComfyUI ${path.split("?")[0]} failed (${r.status})`);
  // POST /free, /interrupt and /queue answer 200 with an empty body.
  const text = await r.text();
  return (text ? JSON.parse(text) : {}) as any;
}
export async function waitIdle(signal: AbortSignal) {
  for (let i = 0; i < 720; i++) {
    const queue = await comfy("/queue", undefined, signal);
    if (!queue.queue_running?.length && !queue.queue_pending?.length) return;
    await delay(5000, signal);
  }
  throw new Error("ComfyUI did not become idle");
}
export async function releaseComfy(signal: AbortSignal) {
  await waitIdle(signal);
  await comfy("/free", { unload_models: true, free_memory: true }, signal);
}
const uploadedInputs = new Set<string>();
export function takeUploadedInputs() {
  const names = [...uploadedInputs];
  uploadedInputs.clear();
  return names;
}
export async function upload(path: string, signal: AbortSignal) {
  const form = new FormData();
  form.append("image", await openAsBlob(path), path.split("/").pop()!);
  form.append("type", "input");
  const r = await fetch(base + "/upload/image", {
    method: "POST",
    body: form,
    signal,
  });
  if (!r.ok) throw new Error("ComfyUI reference upload failed");
  const uploaded = (await r.json()) as { name: string; subfolder?: string };
  const name = uploaded.subfolder
    ? `${uploaded.subfolder}/${uploaded.name}`
    : uploaded.name;
  uploadedInputs.add(name);
  return name;
}
export async function render(
  params: MiniMaxH3Params,
  folder: string,
  signal: AbortSignal,
  onProgress: (pct: number, stage: string) => Promise<void>,
  motion?: MotionContext,
) {
  const clientId = crypto.randomUUID(),
    data = await comfy(
      "/prompt",
      {
        prompt: buildMotionWorkflow(params, motion),
        client_id: clientId,
        extra_data: {
          extra_pnginfo: {
            workflow: {
              extra: { VHS_MetadataImage: false, VHS_KeepIntermediate: false },
            },
          },
        },
      },
      signal,
    );
  if (!data.prompt_id) throw new Error("ComfyUI did not return a prompt ID");
  const cancel = () => {
    void (async () => {
      const q = await comfy("/queue");
      if (q.queue_running?.some((entry: any[]) => entry[1] === data.prompt_id))
        await comfy("/interrupt", {});
      await comfy("/queue", { delete: [data.prompt_id] });
    })().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (let i = 0; i < 3600; i++) {
      signal.throwIfAborted();
      const history = await comfy(
          `/history/${encodeURIComponent(data.prompt_id)}`,
          undefined,
          signal,
        ),
        entry = history[data.prompt_id];
      if (entry?.status?.status_str === "error")
        throw new Error("ComfyUI workflow execution failed");
      if (entry?.status?.completed) {
        let contextFiles: { low: string; high: string } | undefined;
        if (motion?.enabled) {
          const paths: Record<string, string> = {};
          for (const [name, nodeId] of [
            ["low", MOTION_NODES.saveLow],
            ["high", MOTION_NODES.saveHigh],
          ]) {
            const file = entry.outputs?.[nodeId]?.latents?.[0];
            if (!file?.filename?.endsWith(".safetensors"))
              throw new Error("Motion Context did not save both AV latents");
            const path = join(folder, `context-${name}.safetensors`);
            await download(
              `${base}/view?${new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || "", type: "output" })}`,
              path,
              {},
              signal,
            );
            paths[name] = path;
          }
          contextFiles = { low: paths.low, high: paths.high };
        }
        const outputs = Object.values(entry.outputs || {})
          .flatMap((node: any) =>
            Object.values(node).filter(Array.isArray).flat(),
          )
          .filter(
            (f: any) =>
              f &&
              typeof f.filename === "string" &&
              /\.(mp4|webm|mov)$/i.test(f.filename),
          ) as Array<{ filename: string; subfolder?: string; type?: string }>;
        for (let n = 0; n < outputs.length; n++) {
          const file = outputs[n],
            path = join(folder, `render-${n}.mp4`);
          await download(
            `${base}/view?${new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || "", type: file.type || "output" })}`,
            path,
            {},
            signal,
          );
          const details = await probe(path, signal);
          if (details.audio) return { path, ...details, contextFiles };
        }
        throw new Error("ComfyUI returned no video with audio");
      }
      if (i % 15 === 0)
        await onProgress(Math.min(80, 10 + i / 10), "Rendering H3 video");
      await delay(1000, signal);
    }
    throw new Error("H3 rendering exceeded one hour");
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
