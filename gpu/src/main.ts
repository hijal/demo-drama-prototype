import { mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { cleanOutputs, cleanInputs } from "./workspace";
import { uploadArtifact } from "./artifacts";
import { execute, local, type Job } from "./handlers";
import { delay, comfy, waitIdle, takeUploadedInputs } from "./comfy";
const root = resolve(process.env.PIPELINE_WORK_DIR || "/content/drama-runtime");
const studio = (process.env.STUDIO_URL || "").replace(/\/+$/, "");
const key = process.env.GPU_KEY || "";
const workerId = crypto.randomUUID(),
  idleMinutes = Number(process.env.IDLE_MINUTES || 20);
async function main() {
  if (!studio || !key)
    throw new Error(
      "Set STUDIO_URL and GPU_KEY through Colab Secrets, never in notebook source",
    );
  const url = new URL(studio);
  if (
    url.protocol !== "https:" &&
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("STUDIO_URL must use HTTPS");
  if (!Number.isFinite(idleMinutes) || idleMinutes < 1)
    throw new Error("IDLE_MINUTES must be positive");
  await mkdir(root, { recursive: true });
  await fetch("http://127.0.0.1:8000/health").then((r) => {
    if (!r.ok) throw new Error("Local model server unavailable");
  });
  const stop = new AbortController();
  process.on("SIGINT", () => stop.abort());
  process.on("SIGTERM", () => stop.abort());
  let lastWork = Date.now(),
    active: { job: Job; abort: AbortController } | null = null,
    beating = false;
  async function request(path: string, payload: unknown, signal?: AbortSignal) {
    const r = await fetch(studio + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-GPU-Key": key },
      body: JSON.stringify(payload),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!r.ok)
      throw Object.assign(new Error(`Pipeline API returned ${r.status}`), {
        status: r.status,
      });
    return r.json() as Promise<any>;
  }
  async function heartbeat() {
    if (beating) return;
    beating = true;
    try {
      await request("/api/gpu/heartbeat", {
        workerId,
        info: {
          model: process.env.COLAB_LLM_MODEL || "Qwen/Qwen3.6-27B",
          platform: "colab",
        },
      });
      if (active)
        await request(`/api/gpu/jobs/${active.job.id}/progress`, {
          claim_token: active.job.claim_token,
        });
    } catch (error) {
      if (active && (error as any).status === 409)
        active.abort.abort(new Error("Claim cancelled or expired"));
    } finally {
      beating = false;
    }
  }
  await heartbeat();
  const timer = setInterval(() => void heartbeat(), 15000);
  try {
    while (!stop.signal.aborted) {
      let job: Job | null;
      try {
        ({ job } = await request("/api/gpu/claim", { workerId }, stop.signal));
      } catch (error) {
        if (stop.signal.aborted) break;
        if ([401, 403].includes((error as any).status)) throw error;
        if (Date.now() - lastWork > idleMinutes * 60000) {
          console.log(
            "Studio unreachable past idle timeout; stopping GPU worker",
          );
          break;
        }
        console.log("Studio temporarily unreachable; retrying claim");
        await delay(5000, stop.signal);
        continue;
      }
      if (!job) {
        if (Date.now() - lastWork > idleMinutes * 60000) {
          console.log("GPU worker idle timeout reached");
          break;
        }
        await delay(3000, stop.signal);
        continue;
      }
      lastWork = Date.now();
      const abort = new AbortController();
      const signal = AbortSignal.any([
        stop.signal,
        abort.signal,
        AbortSignal.timeout(7_200_000),
      ]);
      active = { job, abort };
      const folder = join(
        root,
        `${job.id.replace(/[^a-zA-Z0-9_-]/g, "_")}-a${job.attempt}`,
      );
      await mkdir(folder, { recursive: true });
      const progress = async (pct: number, stage: string) => {
        signal.throwIfAborted();
        await request(
          `/api/gpu/jobs/${job.id}/progress`,
          { claim_token: job.claim_token, pct, stage },
          signal,
        );
        await request(
          `/api/gpu/jobs/${job.id}/log`,
          { claim_token: job.claim_token, lines: [stage] },
          signal,
        );
      };
      try {
        await progress(0, `Starting ${job.type}`);
        const result = await execute({
          job,
          folder,
          root,
          signal,
          studio,
          key,
          progress,
          upload: (path, name) =>
            uploadArtifact(
              {
                studio,
                key,
                jobId: job.id,
                claimToken: job.claim_token,
                signal,
              },
              path,
              name,
            ),
        });
        signal.throwIfAborted();
        await request(
          `/api/gpu/jobs/${job.id}/done`,
          { claim_token: job.claim_token, result },
          signal,
        );
        console.log(`Completed ${job.type}`);
      } catch (error) {
        if (!signal.aborted)
          await request(`/api/gpu/jobs/${job.id}/fail`, {
            claim_token: job.claim_token,
            error: error instanceof Error ? error.message : "GPU task failed",
          }).catch(() => {});
        console.error(`GPU task ${job.type} failed; review project logs`);
      } finally {
        active = null;
        await local("/release", {}).catch(() => {});
        await comfy("/free", { unload_models: true, free_memory: true }).catch(
          () => {},
        );
        if (process.env.COMFY_OUTPUT_DIR || process.env.COMFY_INPUT_DIR)
          await waitIdle(AbortSignal.timeout(60000))
            .then(async () => {
              await cleanOutputs(job);
              await cleanInputs(takeUploadedInputs());
            })
            .catch(() => {});
        await rm(folder, { recursive: true, force: true });
        lastWork = Date.now();
      }
    }
  } finally {
    clearInterval(timer);
    stop.abort();
    await local("/release", {}).catch(() => {});
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "GPU worker stopped");
  process.exitCode = 1;
});
