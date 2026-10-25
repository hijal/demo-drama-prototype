import { open } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
export const PART_BYTES = 16 * 1024 * 1024;
interface Options {
  studio: string;
  key: string;
  jobId: string;
  claimToken: string;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}
function contentType(name: string) {
  return name.endsWith(".mp4")
    ? "video/mp4"
    : name.endsWith(".png")
      ? "image/png"
      : name.endsWith(".wav")
        ? "audio/wav"
        : name.endsWith(".srt")
          ? "application/x-subrip"
          : "application/octet-stream";
}
export async function uploadArtifact(
  options: Options,
  path: string,
  name: string,
): Promise<string> {
  options.signal.throwIfAborted();
  const send = async (
    route: string,
    method: string,
    body: Uint8Array | string,
    type: string,
    signal = options.signal,
  ) => {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      try {
        const response = await (options.fetchImpl || fetch)(
          `${options.studio}/api/gpu/jobs/${encodeURIComponent(options.jobId)}/${route}`,
          {
            method,
            headers: {
              "X-GPU-Key": options.key,
              "X-Claim-Token": options.claimToken,
              "Content-Type": type,
              "Content-Length": String(Buffer.byteLength(body)),
            },
            body: body as BodyInit,
            signal: AbortSignal.any([signal, AbortSignal.timeout(300000)]),
            redirect: "error",
          },
        );
        if (!response.ok) {
          await response.body?.cancel();
          throw Object.assign(
            new Error(`Artifact upload returned ${response.status}`),
            { status: response.status },
          );
        }
        return (await response.json()) as any;
      } catch (error) {
        signal.throwIfAborted();
        const status = (error as any).status;
        if (
          attempt >= 2 ||
          (status && ![408, 429, 500, 502, 503, 504].includes(status))
        )
          throw error;
        await pause(250 * 2 ** attempt, undefined, { signal });
      }
    }
  };
  const file = await open(path, "r");
  let route: string | undefined;
  try {
    const { size } = await file.stat();
    if (size === 0 && !name.endsWith(".srt"))
      throw new Error("Cannot upload an empty artifact");
    const read = async (start: number, length: number) => {
      const bytes = Buffer.allocUnsafe(length);
      let filled = 0;
      while (filled < length) {
        options.signal.throwIfAborted();
        const { bytesRead } = await file.read(
          bytes,
          filled,
          length - filled,
          start + filled,
        );
        if (!bytesRead) throw new Error("Artifact changed during upload");
        filled += bytesRead;
      }
      return bytes;
    };
    if (size <= PART_BYTES) {
      const result = await send(
        `files/${encodeURIComponent(name)}`,
        "PUT",
        await read(0, size),
        contentType(name),
      );
      return result.key;
    }
    const base = `multipart/${encodeURIComponent(name)}`;
    const upload = await send(
      base,
      "POST",
      JSON.stringify({ contentType: contentType(name) }),
      "application/json",
    );
    route = `${base}/${encodeURIComponent(upload.uploadId)}`;
    const parts: Array<{ partNumber: number; etag: string }> = [];
    for (let offset = 0; offset < size; offset += PART_BYTES) {
      const number = parts.length + 1;
      parts.push(
        await send(
          `${route}/${number}`,
          "PUT",
          await read(offset, Math.min(PART_BYTES, size - offset)),
          "application/octet-stream",
        ),
      );
    }
    const result = await send(
      `${route}/complete`,
      "POST",
      JSON.stringify({ parts }),
      "application/json",
    );
    route = undefined;
    return result.key;
  } catch (error) {
    if (route)
      await send(
        `${route}/abort`,
        "POST",
        "{}",
        "application/json",
        AbortSignal.timeout(5000),
      ).catch(() => {});
    throw error;
  } finally {
    await file.close();
  }
}
