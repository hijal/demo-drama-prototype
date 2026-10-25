import { cpus, freemem, totalmem } from "node:os";
import { execFile } from "node:child_process";

/** Same shape as /api/comfy/system-stats, so the studio sidebar can render it. */
export interface SystemStats {
  cpu: { percent: number };
  ram: { used_gb: number; total_gb: number; percent: number };
  gpu: { available: boolean; vram_used_gb: number; vram_total_gb: number; utilization_percent: number };
}

let lastCpu = cpuTimes();
function cpuTimes() {
  let idle = 0,
    total = 0;
  for (const c of cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle;
  }
  return { idle, total };
}

function nvidiaSmi(): Promise<string> {
  return new Promise((resolve) =>
    execFile(
      "nvidia-smi",
      ["--query-gpu=utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
      { timeout: 3000 },
      (error, stdout) => resolve(error ? "" : stdout),
    ),
  );
}

const round = (n: number) => Math.round(n * 10) / 10;

export async function systemStats(): Promise<SystemStats> {
  const now = cpuTimes();
  const total = now.total - lastCpu.total,
    idle = now.idle - lastCpu.idle;
  lastCpu = now;
  const ramTotal = totalmem() / 1024 ** 3,
    ramUsed = ramTotal - freemem() / 1024 ** 3;
  const [util, used, max] = (await nvidiaSmi()).split("\n")[0].split(",").map((v) => Number(v.trim()));
  const gpuOk = Number.isFinite(util) && Number.isFinite(max) && max > 0;
  return {
    cpu: { percent: total > 0 ? round(100 * (1 - idle / total)) : 0 },
    ram: { used_gb: round(ramUsed), total_gb: round(ramTotal), percent: round((100 * ramUsed) / ramTotal) },
    gpu: {
      available: gpuOk,
      vram_used_gb: gpuOk ? round(used / 1024) : 0,
      vram_total_gb: gpuOk ? round(max / 1024) : 0,
      utilization_percent: gpuOk ? util : 0,
    },
  };
}
