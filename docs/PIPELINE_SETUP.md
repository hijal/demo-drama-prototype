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

The last cell defaults to **ASPECT_RATIO = 9:16** and **RENDER_QUALITY = 1080p** for Reels (1080×1920). Choose 16:9 for landscape (1920×1080), or 720p for test renders (720×1280 portrait / 1280×720 landscape). The Colab aspect overrides the script for new scenes and final assembly. Existing approved takes are not regenerated automatically: regenerate landscape scenes before making a portrait final, otherwise assembly fits them inside the portrait frame with padding. Latent continuity falls back to reference-video when the preceding take's orientation or resolution differs.

**REFERENCE_DETAIL** defaults to **essential**: generate and check the front reference, keep prop variants and character voice samples, and use the front image as the reference sheet. Select **full** to retain the original face/detail, left, right and back views and combined sheet. Existing approved reference versions are reused in either mode.

### Completion recovery and QA

GPU results are saved before their follow-up actions, with persistent `Applying result` / `Completing result` stages. A short lease serializes completion recovery; interrupted follow-ups resume on the next claim or cron without rerunning inference. Late heartbeats acknowledge their own completed claim without extending its lease. Duplicate delivery and concurrent queue requests reuse an existing job, while cancelled work can be queued again after an explicit Resume. Recovery respects changed scripts/references, newer owner-selected takes and Stop.

Older completed passing QA results with a lost selection are recovered before creating another take. QA frames now include the relevant shot and its cast, camera and keyframe; close-ups and voice-only narration do not require every scene participant in every frame. A declared dialogue scene must also have word error at or below 25% to pass. The existing best-take fallback after three retakes remains available even when no take passes.

Implausibly dense/repeated ASR output and invalid timestamps trigger one audio-only recheck. If recognition remains unreliable, the video is kept for owner review and automatic rendering pauses, rather than spending GPU time on a new video because ASR failed. Review the saved take in Scenes before selecting it. The script validator also warns when a scene requests a cartoon effect while the negative prompt forbids cartoon (`W07`); it does not delete either instruction.

Deploy the updated Worker before starting the updated Colab notebook. Local regression tests cannot establish real GPU speed or render quality; compare the same script on Colab after rollout.

Qwen3.6-27B and Qwen3.5-9B are candidates, not measured winners. The local server switches between candidates on demand, one model at a time. `npm --prefix worker run compare -- /content/private-script.txt --models Qwen/Qwen3.6-27B,Qwen/Qwen3.5-9B --episode 1 --out /content/private-review` runs the same episode sequentially. Keep private results outside the checkout. Actual quality, memory, latency and owner approval remain required.

## Workflow

Owner decision (2026-10-27): the owner uploads the script and watches the result; QA approves everything else. **Upload new script (.txt)** creates the project from the script TITLE.

1. **Upload** (`autoApprove`) saves the script. With problems, the Colab LLM repairs it; a series one episode per job, in order, each starting from the previous episode's fixed version so the shared cast carries forward (episodes without issues are skipped). When the newest version has no validation errors it is approved automatically. Errors the LLM could not fix are the one case that waits for the owner.
2. Approval queues a reference for every character, prop and location. Each reference is **scored by the local VLM against its description** (0–100). Below `QA_MIN_SCORE` (notebook setting, default 75) Klein retries with QA's corrections, up to three times, and the best image is kept. The version is approved automatically either way; a below-threshold score is shown on the card.
3. When every reference of the first episode with unrendered scenes is approved, rendering starts. Each take is scored: cast, framing (KEYFRAME/FRAME/CAMERA), action, setting and quality from frames (weights 30/20/20/15/15), blended 80/20 with the dialogue word-error score when the scene has speech. QA writes "script wants / video shows" per check and concrete prompt changes. At or above the threshold the take is selected; below, a new take is rendered with those changes, up to three retakes, then the best-scoring take is selected. Rendering then moves to the next scene and the next episode without a click. Voice similarity is recorded but only scored once `VOICE_MIN_SIMILARITY` is calibrated; lip-sync is not measured.
4. The owner watches, optionally types a note and **Regenerate**s a scene, or **Apply change** / **Recreate fully** on a reference (both re-approve themselves after QA; Apply change keeps the voice unless the instruction mentions it), uploads optional music and presses **Make final video**.

A bar at the top of each project says what Colab is doing, or the rare thing the owner must do (an unfixable script error, a reference or render that failed on Colab). **Stop after current jobs** pauses rendering; **Resume rendering** continues.

**Interrupted runtimes (power cut, closed tab).** All results live in D1/R2, so a new Colab run continues where the last one stopped: approved scripts, references and takes are never redone. A job held by a runtime that has sent no heartbeat for a minute (claimed over a minute ago) is handed to the next runtime that asks for work, without counting as a failed attempt. Only the interrupted job itself restarts from its beginning. Models are downloaded again on each new runtime (about 3 minutes), since Colab starts from a fresh machine.

Formatting-only edits preserve valid approvals. Changed content/reference versions invalidate dependent takes and exports. Replacing an approved take also invalidates downstream context-dependent takes. Large video/latent artifacts upload in 16 MiB parts; small files retain direct PUT. Multipart completion is idempotent and cancelled/expired attempts are aborted by cancellation handling, claim cleanup and the five-minute cron. Active jobs use ten-minute leases with heartbeat renewal, attempt-specific uploads and claim tokens. Only a known claim's token-bearing progress heartbeat extends its lease; an idle worker cannot keep a lost claim alive. Transient claim failures retry with bounded request timeouts until the idle cutoff; cancellation invalidates the token. Failed jobs retry up to three attempts; a GPU job that fails three times stops automatic rendering until the owner presses Resume rendering.

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
