import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { assemble, type Context } from "../src/handlers";
import { command } from "../src/io";
let root: string, server: Server, studio: string;
before(async () => {
  root = await mkdtemp(join(tmpdir(), "drama-assembly-"));
  await command("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x180:r=24:d=1.5",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=32000:duration=1.5",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    join(root, "voice.mp4"),
  ]);
  await command("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=320x180:r=24:d=1.5",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    join(root, "silent.mp4"),
  ]);
  await command("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:sample_rate=44100:duration=0.4",
    join(root, "music.wav"),
  ]);
  await command("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=green:s=320x180:r=24:d=0.5",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    join(root, "tiny.mp4"),
  ]);
  server = createServer(async (req, res) => {
    const name = new URL(req.url!, "http://localhost").searchParams.get("key");
    if (
      !name ||
      !["voice.mp4", "silent.mp4", "tiny.mp4", "music.wav"].includes(name)
    ) {
      res.writeHead(404).end();
      return;
    }
    res.end(await readFile(join(root, name)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  studio = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (root) await rm(root, { recursive: true, force: true });
});
async function run(
  name: string,
  fade: boolean,
  music: boolean,
  burn: boolean,
  short = false,
) {
  const folder = join(root, name);
  await mkdir(folder);
  const context: Context = {
    folder,
    root,
    studio,
    key: "synthetic-key",
    signal: AbortSignal.timeout(120000),
    progress: async () => {},
    job: {
      id: name,
      project_id: "synthetic",
      attempt: 1,
      claim_token: "synthetic",
      type: "assemble",
      payload: {
        aspect: "16:9",
        music: music ? "music.wav" : null,
        burnSubtitles: burn,
        clips: [
          {
            key: "voice.mp4",
            scene: { fields: { TRANSITION: fade ? "fade 0.5s" : "cut" } },
            qa: {
              words: [{ word: "Hello", start: 0.2, end: 0.5 }],
              alignedLines: [{ text: "Hello.", start: 0.2, end: 0.5, at: 0 }],
            },
          },
          {
            key: short ? "tiny.mp4" : "silent.mp4",
            scene: { fields: { TRANSITION: "cut" } },
            qa: {
              words: [],
              alignedLines: [
                { text: "Silent fallback.", start: null, end: null, at: 0.2 },
              ],
            },
          },
        ],
      },
    },
    upload: async (path, filename) => {
      const target = join(folder, "uploaded-" + filename);
      await copyFile(path, target);
      return target;
    },
  };
  const result = await assemble(context);
  const metadata = JSON.parse(
    await command("ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      result.files.video,
    ]),
  );
  const video = metadata.streams.find((s: any) => s.codec_type === "video"),
    audio = metadata.streams.find((s: any) => s.codec_type === "audio");
  assert.equal(video.pix_fmt, "yuv420p");
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.r_frame_rate, "24/1");
  assert.equal(audio.sample_rate, "48000");
  assert.equal(audio.channels, 2);
  assert.ok(
    Math.abs(
      Number(metadata.format.duration) -
        ((short ? 2 : 3) - (fade ? (short ? 0.25 : 0.5) : 0)),
    ) < 0.15,
    metadata.format.duration,
  );
  const subtitles = await readFile(result.files.subtitles, "utf8");
  assert.match(subtitles, /00:00:00,200 --> 00:00:00,500/);
  assert.ok(
    subtitles.includes(
      fade ? (short ? "00:00:01,450" : "00:00:01,200") : "00:00:01,700",
    ),
  );
  await command("ffmpeg", [
    "-v",
    "error",
    "-i",
    result.files.video,
    "-f",
    "null",
    "-",
  ]);
}
test("real cut assembly normalizes 32kHz audio and a silent clip to a playable 1080p MP4", () =>
  run("cut", false, false, false));
test("real fade assembly loops/ducks music, burns subtitles and uses matching actual timeline offsets", () =>
  run("fade", true, true, true));

test("a fade into a shorter clip keeps a usable tail and the matching subtitle offset", () =>
  run("short-fade", true, false, false, true));
