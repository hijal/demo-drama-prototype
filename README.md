# MiniMax H3 Studio

A local web UI for generating cinematic videos with sound using the **MiniMax H3** model. Runs fully offline — all you need is an NVIDIA GPU.

## Features

- **Video + audio generation** — two-pass (low-res → latent upscale → high-res)
- **References** — images (up to 9), videos (up to 3), audio (up to 3)
- **LLM assistant** — Gemma 4 12B (GGUF, Q3/Q4/Q5) or the lighter Qwen3.5 9B (Q4) for weaker GPUs — helps with prompts and can see references
- **Custom LoRAs** — add, remove, trigger words
- **Free resolution** — from 0.2 to 3.0 MP, any aspect ratio
- **Generation queue** — parallel jobs, auto-cleanup
- **Video player** — built-in, with metadata
- **Sound notification** — plays when a generation finishes
- **Voice input** — dictation (whisper, CPU): prompt field, assistant chat, prompt editor (models in `stt/models`, settings in the "Voice" tab)
- **Upscale (DLSS 5)** — built-in DLSS 5 Visual Enhancer: Neural Rendering (noise/tone/structure), RTX VSR (1–4× upscale, optional HDR) — a native tab, no Gradio/iframe
- **Portable** — a single bat file, nothing to install

## Project structure

```
Minimax_Studio/
├── start.bat                    ← launcher (the only entry point)
├── README.md                    ← this file
├── server.js                    ← Next.js production server
├── package.json                 ← dependencies
├── next.config.ts               ← Next.js configuration
├── tsconfig.json                ← TypeScript
├── postcss.config.mjs           ← Tailwind CSS
├── .env                         ← environment variables (COMFY_URL)
│
├── config/
│   ├── config.ini               ← app settings (VRAM, LLM, sound)
│   └── components.json          ← shadcn/ui
├── data/
│   └── loras.json               ← list of custom LoRAs
├── docs/
│   └── Minimax_Studio_Workflow.json  ← workflow for plain ComfyUI
├── scripts/
│   └── start_comfy.bat          ← starts the ComfyUI backend
├── upscale/                     ← DLSS 5 Visual Enhancer ("Upscale" tab)
│   ├── bridge.py                ← headless JSON bridge (stdlib, embedded Python)
│   ├── src/                     ← pipelines: NR / VSR
│   └── bin/                     ← embedded Python 3.13 (amd64)
├── stt/                         ← built-in whisper STT ("Voice" tab) — runtime
│
├── src/                         ← source code (Next.js App Router)
├── public/                      ← static files
├── .next/                       ← production build
├── runtime/
│   └── node.exe                 ← bundled Node.js (if not on PATH)
├── node_modules/                ← npm dependencies
└── ComfyUI-Easy-Install/        ← portable ComfyUI + models
```

## Requirements

| Component | Version                                        |
| --------- | ---------------------------------------------- |
| OS        | Windows 10/11 x64                              |
| GPU       | NVIDIA, 12+ GB VRAM (recommended), min. 8 GB   |
| Driver    | CUDA 12.x                                      |
| Node.js   | 18+ LTS (or bundled `runtime\node.exe`)        |
| ComfyUI   | Portable, `ComfyUI-Easy-Install` folder        |

## Launch

```
start.bat
```

The script automatically:

1. Finds Node.js (PATH → `runtime\node.exe` → error)
2. Checks that `ComfyUI-Easy-Install/` exists
3. Installs `node_modules` if missing
4. Builds `.next` if missing
5. Starts ComfyUI (port 8188)
6. Waits until it is ready
7. Starts the Web UI (port 3000)
8. Opens the browser

**Stop:** close the console window.

## Settings

All settings live in the Web UI (gear icon) and in `config/config.ini`:

| Parameter               | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `reserve_gb`            | VRAM reserved for the system (GB)               |
| `dynamic_vram`          | Dynamic ComfyUI VRAM management                 |
| `llm.device`            | `auto` / `gpu` / `cpu` — where the LLM runs     |
| `llm.context_size`      | LLM context window (tokens)                     |
| `llm.max_output_tokens` | Max LLM response length                         |
| `llm.model`             | LLM quantization (empty = Q4_K_M)               |
| `comfy.diffusion_model` | Alternative base model (empty = default)        |
| `ui.sound_on`           | Sound when a generation finishes (1/0)          |
| `stt.enabled`           | Voice input on/off (1/0)                        |
| `stt.model`             | STT model (empty = auto, first one found)       |
| `stt.language`          | Recognition language: `en` / `ru` / `auto`      |
| `stt.threads`           | CPU threads (0 = auto)                          |
| `upscale.enabled`       | Upscale tab on/off (1/0)                        |
| `upscale.port`          | DLSS bridge port (default 7890)                 |

## Models

Expected files (in `ComfyUI-Easy-Install/ComfyUI/models/`):

| Type            | File                                                                                         | Size     |
| --------------- | -------------------------------------------------------------------------------------------- | -------- |
| Diffusion       | `diffusion_models/minimax_h3_fastvideo_vsa_datafree_1300step_4step_int8_convrot.safetensors` | ~21 GB   |
| Text Encoder    | `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`                                 | ~15.7 GB |
| VAE (video)     | `vae/minimax_h3_video_vae_fp16.safetensors`                                                  | ~4.9 GB  |
| VAE (audio)     | `vae/minimax_h3_audio_vae_fp32.safetensors`                                                  | ~0.6 GB  |
| Turbo LoRA      | `loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors`                           | ~1.5 GB  |
| Latent Upscaler | `latent_upscale_models/minimax_h3_latent_upscaler_3d_fp16.safetensors`                       | ~2 GB    |
| TAE Preview     | `vae_approx/taeh3.safetensors`                                                               | ~10 MB   |
| LLM (Q4)        | `llm/gemma-4-12b-it-Q4_K_M.gguf`                                                             | ~7.1 GB  |
| LLM mmproj      | `llm/mmproj-BF16.gguf`                                                                       | ~175 MB  |
| LLM (Qwen3.5, alternative) | `llm/qwen3.5-9b/Qwen3.5-9B-Q4_K_M.gguf`                                           | ~5.7 GB  |
| LLM (Qwen3.5 mmproj) | `llm/qwen3.5-9b/mmproj-F16.gguf`                                                        | ~920 MB  |

Download models from the Web UI → Settings → General → Models.

## Upscale tab (DLSS 5)

A built-in **DLSS 5 Visual Enhancer** (the `upscale/` folder, a fully portable runtime: embedded Python + DLL runtimes). It is a native tab of the app — **not Gradio, not an iframe**: the form, progress bar and result all live inside the UI.

The layout mirrors the "Generate" tab: on the left, the parameter panel (service, GPU, mode parameters, encoding) and a pinned job status block; on the right, mode selection + video upload + the start button; at the bottom, the **shared video gallery** (the same one as in "Generate" and "Gallery"). Upscale results are written to the shared ComfyUI output folder, so they show up everywhere and are cleared by the "Delete content" button.

**Video only** (image sub-modes are not exposed in the UI).

### Features

| Feature | What it does |
| ------- | ------------ |
| **Neural Rendering** | Noise and artifact suppression: presets, style (Natural/Cinematic), intensity, local tone/structure, DLSS model (J/K/L/M), 1×–3× factor, optional "preserve HDR" |
| **RTX VSR** | Neural upscale 1×–4× (Low→Ultra), custom size, **optional HDR mode** (contrast/saturation/peak brightness) |

For each mode: GPU selection (AI pipeline and video pipeline separately), codec (H.264/H.265/AV1/ProRes, CPU or NVENC), encoding quality, container (MP4/MKV/MOV).

### How to use

1. Open the **Upscale** tab — the service starts automatically (first start takes up to 2–3 minutes: DLL preparation, GPU detection).
2. Choose a mode: **Neural Rendering** or **RTX VSR**.
3. Drag in a video or pick one — the app uploads it to `data/upscale-input/` and shows its metadata (resolution, FPS, duration, codec, HDR).
   You can also take a video straight from the gallery: drag its thumbnail onto the upload area (works from any tab with a gallery) or click the **✨** button on a video card — the app switches to Upscale and picks up the file.
4. Adjust the parameters in the left panel → **Start**. Progress is shown in real time; cancel with the **Cancel** button.
5. The finished file appears in the shared gallery below (and in the "Gallery" tab). Download it with the ⬇ button on the video card (shown on hover).

### Requirements

- Windows 10/11 x64
- NVIDIA RTX (20/30/40/50) with an up-to-date driver — without RTX the tab reports that the runtime is not ready
- Live mode (real-time/HLS) from the original project is **not integrated** — it is a separate tool, not file processing

## Architecture

```
Browser (:3000)
  │
  ├─ Next.js App Router (React 19, Tailwind, shadcn/ui)
  │
  ├─ /api/comfy/*  ── proxy ──►  ComfyUI (:8188)
  │                                │
  │                                └─ Workflow: MiniMax H3 Ref2VA
  │                                   Two-Pass Latent Upscaler
  │
  ├─ /api/llm/chat  ──►  llama.cpp (Gemma 4 12B / Qwen3.5 9B GGUF)
  │
  ├─ /api/upscale/* ─►  bridge.py (DLSS 5, embedded Python, port 7890)
  │                     └─ pipelines: Neural Rendering / RTX VSR
  │
  └─ Files: ComfyUI/output/ (videos), ComfyUI/input/ (references)
```

**Workflow (Two-Pass):**

1. **Pass 1** — low-res (default 0.2 MP, max 2 MP; 2–30 steps, default 4; selectable sampler and scheduler, default `euler` / `simple`)
2. **Latent Upscale** — `MinimaxH3LatentUpscaler3D` → target resolution (`enable_chunking: true`)
3. **Pass 2** — high-res refinement (3–7 steps, selectable sampler (default `euler`), ManualSigmas)
4. **Decode** — VAEDecode (video) + VAEDecodeAudio (audio)
5. **Output** — H.264 MP4, 24 fps

All pass parameters (samplers, scheduler, pass 1 resolution) and the turbo LoRA strength (default 1.0) can be set under "Advanced parameters".

**VRAM optimization:**

- `MiniMaxLowVRAMAttention` — head-chunked attention
- `MiniMaxChunkFeedForward` — chunked FFN for long sequences

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
npm install          # dependencies
npm run dev          # dev server (:3000)
npm run build        # production build (automatically raises the Node heap to 8 GB)
npm run build:default  # production build with the default heap (no wrapper)
npm run typecheck    # TypeScript check
```

> **Build and memory.** `npm run build` runs `next build --webpack` through the
> [scripts/build.mjs](scripts/build.mjs) wrapper, which sets the Node heap to 8 GB
> (`--max-old-space-size=8192`) — otherwise the build fails with
> `JavaScript heap out of memory`. You can override the heap size:
> `NEXT_BUILD_HEAP_MB=12288 npm run build`. There is no lint script: eslint is not
> used in this project (type checking is `npm run typecheck`, and type errors now fail the build).
