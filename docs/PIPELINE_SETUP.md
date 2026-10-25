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

Run all with an appropriate GPU. The first six setup steps retain the H3 install; the last launches ComfyUI, a separate Python model environment, and the serial TypeScript worker. Models load on demand and are released between tasks. The runtime consumes Colab compute units while allocated, including loading and idle time. An idle timeout deletes the runtime; also use **Runtime → Disconnect and delete runtime** when finished.

Qwen3.6-27B and Qwen3.5-9B are candidates, not measured winners. The local server switches between candidates on demand, one model at a time. `npm --prefix worker run compare -- /content/private-script.txt --models Qwen/Qwen3.6-27B,Qwen/Qwen3.5-9B --episode 1 --out /content/private-review` runs the same episode sequentially. Keep private results outside the checkout. Actual quality, memory, latency and owner approval remain required.

## Workflow

Create a project → upload script → repair one episode if necessary → inspect original, draft, diff and errors → approve script → generate and approve each required reference/voice version → render individual scenes or queue an episode → inspect QA and approve takes → upload optional music → assemble episode or series → preview/download MP4 and SRT.

Formatting-only edits preserve valid approvals. Changed content/reference versions invalidate dependent takes and exports. Replacing an approved take also invalidates downstream context-dependent takes. Active jobs use ten-minute leases with heartbeat renewal, attempt-specific uploads and claim tokens; cancellation invalidates the token. Failed jobs retry up to three attempts. Visual/dialogue QA can request up to two retakes; uncalibrated voice or lip-sync checks pause for owner review.

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
- Current continuity uses approved predecessor video/audio as H3 references, bounded to four scenes. **Latent Motion Context/Director integration from the original plan is not implemented.** Compare continuity before adopting or claiming seamless chaining.
- Run real FFmpeg cut/fade, music ducking, subtitle and final MP4 checks in Colab. FFmpeg/ffprobe were unavailable in the local workspace; subtitle arithmetic has unit tests, but a synthetic storage test does not validate an actual assembled video.
- Test owner and non-owner Access logins after Dashboard configuration. Until then the private API stays locked.

These are acceptance gaps, so the full pipeline must not be marked complete solely from local tests or a successful deployment.

Local verification on 2026-10-25: 71 tests passed (11 FLF regressions, 33 script/client tests, 3 subtitle/ASR tests, 5 Python input-safety tests, 8 workerd integration tests, 11 browser tests). Root/Worker/GPU typechecks and production build passed. Deployment smoke checks verified anonymous projects/media and wrong GPU keys return 401; the correct GPU key reaches the empty queue. This is not a real GPU rendering acceptance test.
