# MiniMax H3 Studio

A web UI for generating cinematic videos with sound using the **MiniMax H3** model on top of ComfyUI. Built to run on Google Colab (see [MiniMax_Studio_Colab.ipynb](MiniMax_Studio_Colab.ipynb)); all you need is an NVIDIA GPU.

## Drama pipeline

The Svelte project studio, Cloudflare backend and Colab-local GPU worker are available on `drama-pipeline`. Follow [pipeline setup](docs/PIPELINE_SETUP.md) for owner Access, Colab Secrets and the workflow. Actual GPU/model and final video acceptance checks remain pending; see the explicit verification gaps there.

## Features

- **Video + audio generation** — two-pass (low-res → latent upscale → high-res)
- **Three modes** — Text (text-to-video), Frames (first/last frame), References (images up to 9, videos up to 3, audio up to 3)
- **Free resolution** — from 0.2 to 3.0 MP, any aspect ratio
- **Generation queue** — submit several jobs, they run one after another
- **Gallery** — folders, metadata, "repeat generation" with all parameters restored
- **Prompt editor** — `<d>…</d>` dialogue tags, `@` reference mentions, history and examples

## Running on Google Colab

1. Open the notebook: `https://colab.research.google.com/github/hijal/demo-drama-prototype/blob/main/MiniMax_Studio_Colab.ipynb`
2. **Runtime → Change runtime type** → a GPU runtime (G4 recommended; L4 / A100 work with High-RAM).
3. **Run all**. Allow Google Drive access in Step 2 so videos are saved to `MyDrive/MiniMax_Studio/outputs`.
4. Open the Cloudflare link printed by Step 7.

Step 7 deletes the runtime automatically after `IDLE_MINUTES` without a generation, so compute units stop burning.

## Project structure

```
├── MiniMax_Studio_Colab.ipynb   ← Colab launcher (ComfyUI + Web UI + tunnel)
├── web/                         ← Svelte 5 + SvelteKit frontend
├── server.js                    ← SvelteKit Node server launcher
├── .env                         ← COMFY_URL / COMFY_ROOT
├── config/
│   ├── config.ini               ← app settings (VRAM, diffusion model, sound)
│   └── components.json          ← shadcn/ui
├── data/
│   └── loras.json               ← LoRA list (Turbo LoRA)
├── docs/
│   └── Minimax_Studio_Workflow.json  ← workflow for plain ComfyUI
├── scripts/
│   └── build.mjs                ← production build with an 8 GB Node heap
└── src/                         ← framework-independent ComfyUI logic and shared stores
```

## Settings

Available in the Web UI (gear icon) and in `config/config.ini`:

| Parameter               | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `reserve_gb`            | VRAM reserved for the system (GB)               |
| `dynamic_vram`          | Dynamic ComfyUI VRAM management                 |
| `comfy.diffusion_model` | Alternative base model (empty = default)        |
| `comfy.comfy_dir`       | Backend root folder (default: `COMFY_ROOT`)     |
| `ui.sound_on`           | Sound when a generation finishes (1/0)          |

## Models

Expected files (in `ComfyUI/models/`), downloaded by notebook Step 6:

| Type            | File                                                                                         | Size     |
| --------------- | -------------------------------------------------------------------------------------------- | -------- |
| Diffusion       | `diffusion_models/minimax_h3_fastvideo_vsa_datafree_1300step_4step_int8_convrot.safetensors` | ~22.9 GB |
| Text Encoder    | `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`                                 | ~15.7 GB |
| VAE (video)     | `vae/minimax_h3_video_vae_int8_convrot.safetensors`                                          | ~2.6 GB  |
| VAE (audio)     | `vae/minimax_h3_audio_vae_fp32.safetensors`                                                  | ~0.6 GB  |
| Turbo LoRA      | `loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors`                           | ~1.9 GB  |
| Latent Upscaler | `latent_upscale_models/minimax_h3_latent_upscaler_3d_fp16.safetensors`                       | ~0.7 GB  |
| TAE Preview     | `vae_approx/taeh3.safetensors`                                                               | ~10 MB   |

## Architecture

```
Browser
  │
  ├─ Svelte 5 + SvelteKit frontend (web/)
  │
  ├─ /api/comfy/*  ── proxy ──►  ComfyUI (:8188)
  │                                └─ Workflow: MiniMax H3 Ref2VA, two-pass latent upscaler
  │
  └─ Files: ComfyUI/output/ (videos), ComfyUI/input/ (references)
```

**Workflow (two-pass):**

1. **Pass 1** — low-res (default 0.2 MP, max 2 MP; 2–30 steps, default 4; selectable sampler and scheduler, default `euler` / `simple`)
2. **Latent Upscale** — `MinimaxH3LatentUpscaler3D` → target resolution
3. **Pass 2** — high-res refinement (3–7 steps, selectable sampler, ManualSigmas)
4. **Decode** — VAEDecode (video) + VAEDecodeAudio (audio)
5. **Output** — H.264 MP4, 24 fps

**VRAM optimization:** `MiniMaxLowVRAMAttention` (head-chunked attention) and `MiniMaxChunkFeedForward` (chunked FFN), toggled in Settings → Optimization.

## Custom ComfyUI nodes

| Node                                          | Purpose                        |
| --------------------------------------------- | ------------------------------ |
| `MiniMaxH3ReferenceToVideo`                   | Main H3 node                   |
| `MiniMaxH3SigmaShift`                         | Sigma distribution shift       |
| `MiniMaxLowVRAMAttention`                     | VRAM savings (attention)       |
| `MiniMaxChunkFeedForward`                     | VRAM savings (FFN)             |
| `MinimaxH3LatentUpscaler3D`                   | Latent upscale                 |
| `LTXVSeparateAVLatent` / `LTXVConcatAVLatent` | Splitting AV latents           |
| `ModelPreviewOverrideKJ`                      | Live step preview              |
| `ComfyMathExpression`                         | Math expressions               |
| `VHS_VideoCombine`                            | Video output (VideoHelperSuite)|

## Commands (development)

```bash
npm ci               # root + Svelte workspace dependencies (Node 22.12+, prefer 24)
npm run dev          # SvelteKit HMR + local API on :3000
npm run build        # SvelteKit Node server + Cloudflare static UI
npm start            # production server (:3000)
npm run typecheck    # API/shared TypeScript + Svelte diagnostics
npm test             # resolution metadata and repeat-generation regression tests
npm run test:ui      # Chromium browser tests (npx playwright install chromium once)
npm run test:pipeline # script parser/validator/fixer tests (install worker dependencies first)
npm run typecheck:pipeline
```

The Web UI expects ComfyUI at `COMFY_URL` (default `http://127.0.0.1:8188`) and its folder at `COMFY_ROOT`.

The frontend and local API now use **Svelte 5 + SvelteKit 3**. The studio
keeps its existing browser UI, queue/history localStorage keys and ComfyUI workflows.
`web/src/routes/api/**/+server.ts` contains all 30 local API route files; there is
no Next.js or React runtime. `src/lib/` remains shared with the GPU worker.

- `npm run dev`: SvelteKit development server on port 3000.
- `npm run build`: Node server in `web/build/` and Cloudflare static UI in `web/dist/`.
- `npm start`: production SvelteKit Node server via the small `server.js` launcher.
- `npm run build:web`: static UI only, served by the existing Cloudflare Worker.

The Node launcher reads the root `.env` and supports `COMFY_URL`, `COMFY_ROOT`,
`PORT` and `BIND_HOST`. `STUDIO_ROOT` keeps configuration, staged uploads and model
paths anchored to the repository. Large model uploads stream to disk; the Node
server has no fixed request body size limit. Set `BODY_SIZE_LIMIT` to override.
Behind the Colab tunnel, forwarded protocol and Host determine the request origin;
the launcher supplies HTTP for direct local connections.

The studio is intentionally browser-rendered (`ssr = false`) because its persisted
queue, uploads, audio and GPU polling live in the browser. SvelteKit owns routing,
builds and local endpoints. Cloudflare continues to own pipeline auth, D1, R2,
Durable Object logs and GPU job APIs; Node-only filesystem endpoints are excluded
from the static deployment. `PIPELINE_URL` enables the loopback-only local proxy.

The script-to-video pipeline lives in `worker/`. See
[script format](docs/SCRIPT_FORMAT.md), [Colab models](docs/COLAB_LLM.md) and
[pipeline setup and acceptance gaps](docs/PIPELINE_SETUP.md).

Browser tests mock ComfyUI and do not run GPU jobs. An actual Colab render still
needs GPU verification. The notebooks check `web/build/index.js` and the cloud
UI output before startup.
