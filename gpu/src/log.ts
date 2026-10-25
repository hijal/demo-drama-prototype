import { readFile } from "node:fs/promises";
import type { Job } from "./handlers";

// Colab's cell output renders ANSI colours; NO_COLOR keeps plain text elsewhere.
const plain = !!process.env.NO_COLOR;
const paint = (code: string, text: string) =>
  plain ? text : `\x1b[${code}m${text}\x1b[0m`;
const dim = (text: string) => paint("2", text);
const time = () => new Date().toTimeString().slice(0, 8);
const icons = {
  info: paint("36", "•"),
  step: paint("36", "›"),
  ok: paint("32", "✓"),
  warn: paint("33", "!"),
  error: paint("31", "✗"),
};
function write(kind: keyof typeof icons, tag: string, text: string) {
  const line = `${dim(time())} ${icons[kind]} ${tag ? paint("1", tag.padEnd(9)) + " " : ""}${kind === "error" ? paint("31", text) : text}`;
  (kind === "error" ? console.error : console.log)(line);
}
export const log = {
  info: (text: string, tag = "") => write("info", tag, text),
  step: (text: string, tag = "") => write("step", tag, text),
  ok: (text: string, tag = "") => write("ok", tag, text),
  warn: (text: string, tag = "") => write("warn", tag, text),
  error: (text: string, tag = "") => write("error", tag, text),
  detail: (text: string) => console.log(dim(`           │ ${text}`)),
};

export function duration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Short human label for a job, e.g. "Episode 1 · Scene 3". */
export function jobLabel(job: Job) {
  const p = job.payload || {};
  const where = (scene: any, sceneId?: string) => {
    const episode = /:ep(\d+):/.exec(sceneId || "")?.[1];
    return [
      episode && episode !== "0" ? `Episode ${episode}` : "",
      scene?.number ? `Scene ${scene.number}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const label =
    job.type === "fix_script"
      ? p.episode
        ? `Episode ${p.episode}`
        : "whole script"
      : job.type === "asset"
        ? `${p.spec?.name || "reference"} v${p.version ?? "?"}${p.instruction ? " (change)" : ""}`
        : job.type === "clip"
          ? `${where(p.scene, p.sceneId)}${p.retake ? ` · auto retake ${p.retake}` : ""}`
          : job.type === "qa"
            ? where(p.scene, p.sceneId)
            : job.type === "assemble"
              ? `${p.clips?.length ?? 0} clips`
              : "";
  return `${label || job.id.slice(0, 8)}${job.attempt > 1 ? ` · attempt ${job.attempt}` : ""}`;
}

/** Last lines of a local service log, for showing why ComfyUI or the model server failed. */
export async function tail(path: string | undefined, lines = 25) {
  if (!path) return [];
  try {
    const text = await readFile(path, "utf8");
    return text.trimEnd().split("\n").slice(-lines);
  } catch {
    return [];
  }
}
