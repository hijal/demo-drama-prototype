import { mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { cleanOutputs, cleanInputs } from "./workspace";
import { uploadArtifact } from "./artifacts";
import { execute, local, type Job } from "./handlers";
import { delay, comfy, waitIdle, takeUploadedInputs } from "./comfy";
import { systemStats } from "./stats";
import { log, duration, jobLabel, tail } from "./log";
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
    beating = false,
    finalVideoDone = false,
    unreachable = false,
    waiting = 0;
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
          stats: await systemStats().catch(() => null),
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
  log.ok(`Connected to ${url.host} · model ${process.env.COLAB_LLM_MODEL || "Qwen/Qwen3.6-27B"}`);
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
          log.warn("Studio unreachable past the idle timeout; stopping");
          break;
        }
        if (!unreachable)
          log.warn("Studio unreachable; retrying every 5 seconds");
        unreachable = true;
        await delay(5000, stop.signal);
        continue;
      }
      if (unreachable) log.ok("Studio reachable again");
      unreachable = false;
      if (!job) {
        // Owner request: release the paid runtime as soon as the final video is done.
        if (finalVideoDone) {
          log.ok("Final video assembled and the queue is empty; stopping");
          break;
        }
        const idle = Date.now() - lastWork;
        if (idle > idleMinutes * 60000) {
          log.info(`No jobs for ${idleMinutes} minutes; stopping`);
          break;
        }
        // Say once that we are waiting, then remind every 5 minutes with the time left.
        const left = Math.ceil(idleMinutes - idle / 60000);
        if (!waiting || Date.now() - waiting > 300000) {
          log.info(
            `Waiting for jobs from the studio · shuts down after ${left} more idle minute${left === 1 ? "" : "s"}`,
          );
          waiting = Date.now();
        }
        await delay(3000, stop.signal);
        continue;
      }
      waiting = 0;
      lastWork = Date.now();
      const tag = job.type === "fix_script" ? "script" : job.type,
        started = Date.now();
      let lastStage = "",
        lastPrinted = 0;
      log.step(jobLabel(job), tag);
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
        // Render polling repeats the same stage every 15 s; print it at most once a minute.
        if (stage !== lastStage || Date.now() - lastPrinted > 60000) {
          log.detail(`${stage} · ${Math.round(pct)}% · ${duration(Date.now() - started)}`);
          lastStage = stage;
          lastPrinted = Date.now();
        }
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
        log.ok(`${jobLabel(job)} done in ${duration(Date.now() - started)}`, tag);
        if (job.type === "assemble") finalVideoDone = true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "GPU task failed";
        if (!signal.aborted)
          await request(`/api/gpu/jobs/${job.id}/fail`, {
            claim_token: job.claim_token,
            error: reason,
          }).catch(() => {});
        if (signal.aborted && !stop.signal.aborted)
          log.warn(`${jobLabel(job)} cancelled or claim expired`, tag);
        else {
          log.error(`${jobLabel(job)} failed after ${duration(Date.now() - started)}`, tag);
          log.detail(reason);
          await serviceLogs();
        }
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
/** On a failure, show why ComfyUI or the model server broke without opening /tmp files. */
async function serviceLogs() {
  for (const [name, path] of [
    ["ComfyUI", process.env.COMFY_LOG_FILE],
    ["Model server", process.env.MODEL_LOG_FILE],
  ] as const) {
    const lines = (await tail(path, 400)).filter((line) =>
      /error|exception|traceback|out of memory|killed|failed/i.test(line),
    );
    if (!lines.length) continue;
    log.detail(`${name} log (${path}), last errors:`);
    for (const line of lines.slice(-12)) log.detail(`  ${line.slice(0, 200)}`);
  }
}
main().catch((error) => {
  log.error(
    [401, 403].includes((error as any)?.status)
      ? "The studio rejected GPU_KEY; check the Colab secret and the /api/gpu/* Access bypass"
      : error instanceof Error
        ? error.message
        : "GPU worker stopped",
  );
  process.exitCode = 1;
});
