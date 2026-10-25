# Pipeline setup and verification

Deployed studio: https://drama-pipeline.golghor-stream-eb9.workers.dev

The Svelte studio runs on Cloudflare; model inference runs only inside Colab. Cloudflare D1 stores scripts, approvals and leased jobs; private R2 stores references, takes and final exports. A Durable Object streams project logs. No hosted inference API is called.

## Owner login in Dashboard

1. In Zero Trust → Access → Applications, add a self-hosted application for the deployed `drama-pipeline` Worker hostname, covering every path. Add an **Allow** policy whose **Emails** selector contains only your email. Enable an identity provider or one-time PIN.
2. Add a second, more-specific self-hosted application for the same hostname with path `/api/gpu/*`. Its policy is **Bypass → Everyone**. This route still requires the independent GPU key in the Worker; the bypass lets the Colab process reach that authentication check.
3. Copy the root application's **Application Audience (AUD)**. In Workers & Pages → drama-pipeline → Settings → Variables and Secrets, replace these **Secret** bindings and deploy the settings:

   | Secret | Value |
   | --- | --- |
   | `ACCESS_TEAM` | Zero Trust team subdomain only, without `.cloudflareaccess.com` |
   | `ACCESS_AUD` | Root application AUD, not the GPU bypass application's AUD |
   | `OWNER_EMAIL` | Your exact login email |

   Keep `AUTH_MODE=access`. Initial `setup-pending` values intentionally deny private API requests. Deploys inherit these secrets rather than replacing them with blank config defaults.
4. Verify a signed-out browser cannot access projects/media. Sign in with the allowed email and create a synthetic project. An unrelated email must be denied. Keep the R2 bucket private.

Cloudflare API authentication in this session cannot administer Access (403); the owner chose Dashboard setup. Workers/D1/R2 deployment permissions were available.

## Colab

Open [Drama Pipeline notebook](https://colab.research.google.com/github/hijal/demo-drama-prototype/blob/drama-pipeline/Drama_Pipeline_Colab.ipynb). Add these in **Colab Secrets**, enabling notebook access:

- `STUDIO_URL`: deployed HTTPS studio origin.
- `GPU_KEY`: the value in local ignored `worker/.dev.vars`. Do not paste it into chat, notebook cells or git.
- `HF_TOKEN`: your existing download token, with permission for the chosen gated weights. This is for downloading models only.

Run all with an appropriate GPU. The notebook checks the GPU key/bypass through `/api/gpu/health` before installing the second model environment. The first five setup steps retain the H3 install (without the studio's Google Drive cell, since media lives in R2); the last launches ComfyUI, a separate Python model environment, and the serial TypeScript worker. Models load on demand and are released between tasks. Pipeline ComfyUI input/output uses separate local `/content/drama-comfy-*` folders instead of slow Drive media paths. After ComfyUI becomes idle, only the completed attempt's output folder and its uploaded inputs are removed; approved artifacts/latents remain in private R2. The runtime consumes Colab compute units while allocated, including loading and idle time. An idle timeout deletes the runtime; also use **Runtime → Disconnect and delete runtime** when finished.

Qwen3.6-27B and Qwen3.5-9B are candidates, not measured winners. The local server switches between candidates on demand, one model at a time. `npm --prefix worker run compare -- /content/private-script.txt --models Qwen/Qwen3.6-27B,Qwen/Qwen3.5-9B --episode 1 --out /content/private-review` runs the same episode sequentially. Keep private results outside the checkout. Actual quality, memory, latency and owner approval remain required.

## Workflow

Create a project → upload script → repair one episode if necessary → inspect original, draft, diff and errors → approve script → generate and approve each required reference/voice version → render individual scenes or queue an episode → inspect QA and approve takes → upload optional music → assemble episode or series → preview/download MP4 and SRT.

Formatting-only edits preserve valid approvals. Changed content/reference versions invalidate dependent takes and exports. Replacing an approved take also invalidates downstream context-dependent takes. Large video/latent artifacts upload in 16 MiB parts; small files retain direct PUT. Multipart completion is idempotent and cancelled/expired attempts are aborted by cancellation handling, claim cleanup and the five-minute cron. Active jobs use ten-minute leases with heartbeat renewal, attempt-specific uploads and claim tokens. Only a known claim's token-bearing progress heartbeat extends its lease; an idle worker cannot keep a lost claim alive. Transient claim failures retry with bounded request timeouts until the idle cutoff; cancellation invalidates the token. Failed jobs retry up to three attempts. Visual/dialogue QA can request up to two retakes; uncalibrated voice or lip-sync checks pause for owner review.

## Local development

```sh
npm ci
npm --prefix worker ci
npm --prefix worker run migrate:local
npm run dev:pipeline
# Another terminal:
npm run dev
```

The local API proxy targets loopback port 8790 and rewrites only validated same-origin requests. The local Worker explicitly enables loopback-only local authentication. Project logs fall back to HTTP polling when the local proxy cannot upgrade a WebSocket. Never deploy with `AUTH_MODE=local`.

```sh
npm test
npm run test:pipeline
npm run test:gpu
# Requires ffmpeg and ffprobe on PATH (provided by the Colab install):
npm run test:assembly
python3 -m unittest discover -s gpu/tests -p 'test_*.py'
npm run typecheck
npm run typecheck:pipeline
npm run typecheck:gpu
npm run build
npm run test:backend
npm run test:ui
```

Build before browser tests: they intentionally exercise production assets. Backend tests use workerd with local D1/R2/SQLite Durable Objects and synthetic media, including claims, cancellation, script approval, version invalidation, QA, assembly completion and byte-range delivery. Synthetic MP4 bytes validate the storage protocol, not codec validity.

## Deployment

```sh
npm run build:web
npm --prefix worker run typecheck
cd worker
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy --secrets-file .dev.vars
```

`worker/.dev.vars` contains only the GPU secret. Existing Access secrets are inherited. Use the isolated `drama-pipeline` database and `drama-pipeline-media` bucket from `wrangler.jsonc`; no existing application's resources are reused. Initial deployment used temporary locked Access placeholders.

## Verification still requiring the owner's GPU/session

- Execute real local model text/image requests, compare both fixer candidates on Jungle Episode 01 and approve the repair.
- Verify Klein identity sheets/variants and H3 voice/render output, repeated GPU model switches, memory use and dependency compatibility on the actual Colab runtime.
- Calibrate `VOICE_MIN_SIMILARITY` using approved good/bad samples. Empty threshold requests owner review. Lip sync currently requires owner review; it is not automatically measured.
- Compare the available `reference-video` and `latent` continuity strategies in Colab, using the last-cell `CONTINUITY_STRATEGY` selector. Latent mode installs pinned Motion Context, saves low/high AV latents independently, pins both sampling passes, shifts dialogue past the 22-frame head and trims picture/audio together. Chains remain bounded to four scenes. Long scenes that cannot fit the head within 719 frames, and older takes without latent pairs, use reference-video continuity. No GPU quality winner is selected; Director comparison remains pending.
- Play the actual rendered episode/series on Colab and the owner's Mac. CPU integration tests now produce and decode real 1080p H.264 yuv420p/AAC stereo 48 kHz MP4s, including cut, fade into a shorter clip, mono music ducking and burned subtitles. Tested with temporary macOS arm64 FFmpeg 4.4 / ffprobe 5.0.1 tools; actual H3 source clips and the Colab codecs still need acceptance testing.
- Test owner and non-owner Access logins after Dashboard configuration. Until then the private API stays locked.

These are acceptance gaps, so the full pipeline must not be marked complete solely from local tests or a successful deployment.

Local verification on 2026-10-25: 71 tests passed (11 FLF regressions, 33 script/client tests, 3 subtitle/ASR tests, 5 Python input-safety tests, 8 workerd integration tests, 11 browser tests). Root/Worker/GPU typechecks and production build passed. Deployment smoke checks verified anonymous projects/media and wrong GPU keys return 401; the correct GPU key reaches the empty queue. This is not a real GPU rendering acceptance test.


## Continuity implementation reference

The optional node pack is fetched separately from [H3 Motion Context revision 518c083](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context/tree/518c083d11d80fa5920222ad89889924ee4401c9) (GPL-3.0). Upstream code is not copied into this repository. The graph builder is covered by tests for both sampling passes, preservation of image/voice references, AV trimming, cycle-free links, first-clip behavior and frame limits. These graph checks do not establish perceptual continuity quality.

Latest local verification: 88 tests (11 FLF, 33 script/client, 14 GPU helper, 5 Python safety, 11 workerd, 11 browser, 3 real FFmpeg integration), plus root/Worker/GPU typechecks. The earlier 71-test result above records the initial deployment. Access placeholders and GPU quality acceptance remain pending.

## SvelteKit migration

The studio now builds with Svelte 5 and SvelteKit 3. `npm run build` produces
`web/build` for local/Colab Node serving and `web/dist` for the existing Worker
assets binding. `npm run build:web` produces only the Cloudflare static UI.
The pipeline Worker API, D1/R2 schema and GPU protocol are unchanged. Local
ComfyUI endpoints have moved to `web/src/routes/api/**/+server.ts`.
Next.js and React are no longer runtime or build dependencies.
