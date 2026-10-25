import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
export async function command(
  executable: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });
    let out = "",
      error = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
      if (out.length > 4_000_000) child.kill();
    });
    child.stderr.on("data", (chunk) => {
      error = (error + String(chunk)).slice(-4000);
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(out)
        : reject(
            new Error(
              `${executable} failed (${code}): ${error.replace(/https?:\/\/\S+/g, "[url]")}`,
            ),
          ),
    );
  });
}
export async function download(
  url: string,
  path: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
) {
  const response = await fetch(url, { headers, signal, redirect: "error" });
  if (!response.ok || !response.body)
    throw new Error(`Download failed (${response.status})`);
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    createWriteStream(path),
  );
}
export async function probe(path: string, signal?: AbortSignal) {
  const data = JSON.parse(
    await command(
      "ffprobe",
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", path],
      signal,
    ),
  );
  return {
    duration: Number(data.format.duration),
    audio: data.streams.some((s: any) => s.codec_type === "audio"),
  };
}
export async function inlineImage(path: string) {
  const bytes = await readFile(path);
  const mime =
    bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "image/png";
  return `data:${mime};base64,` + bytes.toString("base64");
}
