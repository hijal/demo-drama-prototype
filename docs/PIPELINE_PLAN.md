# Drama Studio — Script-to-Video Pipeline: Full Build Plan & Handoff

> **For the owner (Bangla):** Ei file ta onno je kono AI (Claude, GPT, Gemini, Cursor ityadi) ke dile se ekhan theke kaj chaliye nite parbe. AI ke bolo:
> *"Read `docs/PIPELINE_PLAN.md` fully, then continue from the first phase whose status is not DONE. Follow every rule in section 2."*
> Protita phase sheshe AI ke bolo section 12 er "Status" table update korte, tahole porer AI jante parbe kothay theme chilo.

**Written:** 2026-10-25 by Claude (Opus 5.5), after a long working session with the owner.
**Repo:** `github.com/hijal/demo-drama-prototype` (public), local path `/Users/fe_dev_003/Downloads/test-drama`.

---

## 0. TL;DR for the next AI

You are continuing a project that turns a **written drama script** into a **finished video** using **MiniMax H3** (open video+audio model) running in **ComfyUI on Google Colab (G4 GPU)**. The owner is **non-technical**, writes to you in **Banglish** (Bengali in Latin letters), and wants the least possible manual work:

1. upload a script → 2. approve the auto-fixed script → 3. approve auto-generated character/location reference sheets (edit only what they ask) → 4. clips render automatically, auto-QA'd, bad ones regenerated → 5. owner re-rolls any clip they dislike → 6. one click assembles the final 1080p video.

Target architecture: **Cloudflare Worker** (UI + API, behind **Cloudflare Access**) + **D1** (state) + **R2** (media) + **Durable Object** (real-time logs) + **Colab GPU worker** (ComfyUI: MiniMax H3 + FLUX.2 Klein 9B) + **Hugging Face router LLMs** (script fixing, prompt writing, vision QA).

Nothing of the new architecture is built yet. Phase 1 has not started (only `.dev.vars` was added to `.gitignore`). Start at **Phase 1**.

---

## 1. Owner profile & communication

- Non-technical. Explain in simple Banglish, short sentences, tables are welcome. Avoid jargon or explain it.
- The owner tests things in the browser and reports back. Give them exact clicks/steps when they must act (e.g. "Colab tab e Run all chapo").
- Owner has: Colab Pro (compute units, ~74 CU left on 2026-10-25), Google AI Pro (5 TB Drive), Cloudflare account with R2 enabled, Hugging Face token (+ FLUX license; use is **personal research only**, no commercial use).
- Owner's Mac shows 720p video badly → **render at 1080p** (16:9 → 1920×1080, 9:16 → 1080×1920).

## 2. Hard rules (do not break)

1. **Git commits:** plain one-line message, **no `Co-Authored-By` or any attribution trailer**. Push only when the owner asks or when Colab must pull new code (the Colab notebook clones `main` from GitHub).
2. **Secrets:** never ask the owner to paste tokens in chat. Local: `/Users/fe_dev_003/Downloads/test-drama/.dev.vars` (gitignored) with `HF_TOKEN=...`. Production: `wrangler secret put HF_TOKEN`. Never commit secrets. The repo is **public**.
3. **Do not commit the owner's scripts** (they live in `~/Downloads`, see §11) unless the owner says so — the repo is public.
4. **Colab runtime costs money.** Always tell the owner when a step starts burning compute units, and offer to "Disconnect and delete runtime" when done. The notebook auto-deletes the runtime after `IDLE_MINUTES` (default 20) without generation.
5. **Verify before claiming.** Run typecheck/build, test in a browser or with curl, and say plainly what was and was not tested.
6. Next.js in this repo is **v16** with breaking changes — read `node_modules/next/dist/docs/` before touching Next APIs (see `AGENTS.md`). The new Worker UI (Phase 2) does not need Next.js.

---

## 3. Current state of the repo (what exists today)

A Next.js 16 web UI ("MiniMax H3 Studio") stripped down to **video generation only** (commit `3630f09`). It is the *current* manual tool; the new pipeline will replace its UI but **reuse its ComfyUI workflow code**.

```
MiniMax_Studio_Colab.ipynb   7 cells: GPU check → Drive mount → apt/Node/cloudflared → ComfyUI+nodes
                             → Web UI clone+npm install+production build → model download (aria2c)
                             → launch ComfyUI + `node server.js` + Cloudflare quick tunnel + idle auto-shutdown
server.js                    Next.js production server (PORT, BIND_HOST env)
scripts/build.mjs            `next build --webpack` with 8 GB Node heap
src/app/page.tsx             2 tabs: Generate, Gallery
src/app/api/comfy/*          generate, upload, files, file, meta, progress, health, clean, free, …
src/app/api/models/*         model status/download (7 H3 model files)
src/lib/comfy/minimax-h3-template.ts   ★ buildMiniMaxH3Workflow(params) → ComfyUI API graph (2-pass)
src/lib/comfy/minimax-h3-client.ts     ★ uploadImage(), submitVideo(params), getStatus(), cancelPrompt()
src/lib/comfy/progress-tracker.ts      ComfyUI websocket progress
src/lib/models-config.ts               7 model files + HF URLs
src/lib/prompt-examples.ts             example H3 prompts
config/config.ini                      reserve_gb, dynamic_vram, diffusion_model, sound_on
docs/Minimax_Studio_Workflow.json      workflow for plain ComfyUI (may still use the OLD upscaler input names, see §10)
```

**Key type** `MiniMaxH3Params` (in `minimax-h3-template.ts`): `prompt`, `mode: 'ref'|'t2v'|'flf'`, `refImages[]` (ComfyUI input filenames, max 9), `refVideos[]` (max 3), `refAudios[]` (max 3), `firstFrame`/`lastFrame` (flf), `aspectRatio` ("16:9"/"9:16"), `duration` (s), `seed` (-1 random), `targetDimensions {width,height}` (use 1920×1080 or 1080×1920), `lowResMP`, `firstSamplerSteps`, `sigmaVariant`, samplers, `turboLora*`, `lowVramAttention`, `chunkFeedForward`, `outputSubfolder`, `refImageSize: 'match'|'max'`.
**Reuse plan:** the Colab GPU worker (Phase 3) is written in **Node/TypeScript** and imports `buildMiniMaxH3Workflow` + `submitVideo` directly (Node 20 is already installed on Colab by notebook Step 3).

### Models on Colab (notebook Step 6, all ready-verified 2026-10-24)
| File | Folder | Size |
|---|---|---|
| minimax_h3_fastvideo_vsa_datafree_1300step_4step_int8_convrot.safetensors | diffusion_models | 21.3 GB |
| qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors | text_encoders | 14.6 GB |
| minimax_h3_video_vae_int8_convrot.safetensors | vae | 2.6 GB |
| minimax_h3_audio_vae_fp32.safetensors | vae | 0.56 GB |
| minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors | loras | 1.8 GB |
| minimax_h3_latent_upscaler_3d_fp16.safetensors | latent_upscale_models | 0.64 GB |
| taeh3.safetensors | vae_approx | 10 MB |

Custom nodes installed by Step 4: ComfyUI-MiniMax-H3-SPEED, ComfyUI-PT_H3ConcatAVLatent, Comfyui_Minimax_h3_latent_Upscaler, ComfyUI-VideoHelperSuite, ComfyUI-KJNodes, rgthree-comfy, ComfyUI-GGUF, comfyui-minimax-h3-audio-T8.

### Proven performance (G4 = RTX PRO 6000 Blackwell, 96 GB VRAM, 177 GB RAM)
- Full notebook "Run all" → working link: **~6 min** (model download ~3 min at ~250 MB/s).
- One 720p clip of 4–10 s: **25–80 s** generation. Expect ~2× at 1080p.
- Colab G4 rate ≈ **8.9–10.4 CU/hour**. A 44 s, 7-scene film with 4 retakes cost ≈ **5 CU** end to end.
- Models stay in VRAM between jobs (`--highvram`; the old "unload after queue drain" code was removed).

### Time & cost estimates for the new pipeline (estimates — 1080p not yet measured)
- 10 s clip: ~80 s at 720p (measured) → **~3 min at 1080p** (≈2.25× pixels). Auto-QA runs on HF (not GPU) in parallel → ~0 GPU time. Auto-retakes add ~20–30 % (4 of 11 takes needed a redo in the session). Chaining adds ~10 % per chained clip. Character sheets ~1–2 min each, once per project.
- 40 s / 7-scene film at 1080p: **~25–30 min** machine time, owner hands-on ~5 min.
- One jungle episode (9 × 10 s): **~30–35 min**. Whole 20-episode series: **~10–11 GPU hours ≈ 90–100 CU** — more than the ~74 CU the owner has. Told the owner (2026-10-25); options: render episode by episode over time, render series at 720p, or approve at 720p then upscale finals. Measure real 1080p timing in Phase 3 and update these numbers.

---

## 4. Decisions already made (with reasons)

| Topic | Decision | Why |
|---|---|---|
| Video model | **MiniMax H3 stays the only video model** (Ref2VA mode mainly) | Proven in session; extensions are added *around* it |
| Hosting | **Cloudflare Worker** (UI + API) + **Cloudflare Access** login | Permanent URL (quick tunnel URL changes every Colab session); owner can review while GPU is off |
| State | **D1** | A long series spans several Colab sessions; state must live outside Colab |
| Media | **R2** (not Drive) | Worker can't read Drive; ~1 GB per 180-clip series. Drive mount stays only as optional backup |
| Real-time logs | **Durable Object** + WebSocket | GPU worker posts lines; browser shows them live |
| GPU | Colab G4, owner presses "Run all" | Colab has no start API. Serverless GPUs (Modal/RunPod) = later option, separate billing |
| Character images | **FLUX.2 Klein 9B** (owner has HF access) | Edit only what the owner asks; full re-create on request |
| LLM | Hugging Face router (`https://router.huggingface.co/v1`, OpenAI-compatible) with owner's HF token | Owner chose HF. Candidates below — **pick by test in Phase 1** |
| Resolution | 1080p | Owner request |
| Build vs adopt | **Own lean pipeline**; borrow only needed parts from GitHub | No existing platform fits Worker + H3 Ref2VA + our format (see §9) |
| Episodes | **Optional.** No EPISODE block ⇒ whole script = one film | Owner has both short films and 20-episode series |

**LLM candidates (available on HF router 2026-10-25, verify again):**
- Script fixing / prompt writing: `deepseek-ai/DeepSeek-V4-Pro` (1M ctx) — alt `zai-org/GLM-5.3` (1M ctx, 5 providers).
- Vision QA: `Qwen/Qwen3-VL-235B-A22B-Instruct` — alt `deepseek-ai/DeepSeek-V4-Flash-Vision-Exp`.
- List models: `curl -s https://router.huggingface.co/v1/models` (public). Call with `Authorization: Bearer $HF_TOKEN`, OpenAI chat-completions body.

### The 5 owner-approved extras (must be built)
1. **Auto QA** — vision LLM checks frames of every clip (cast present, faces in frame, matches KEYFRAME); auto-regenerate up to 2×; only surface failures.
2. **Consistent voices** — per-character voice sample (from OrbitSheets render or first good dialogue clip) passed as `<Audio N>` voice-timbre reference in every clip.
3. **One continuous music track** — render clips with `non_diegetic_music: N/A`; add music at assembly.
4. **Subtitles** — `.srt` from script dialogue timings (+ optional burn-in).
5. **Continuity chaining** — consecutive scenes in the same location chained with H3 Motion-Context (or H3 Director inter-segment guidance); pick whichever tests better.

Later/optional: idea → full script generator; email/Telegram notifications; serverless GPU.

---

## 5. Target architecture

```
                 Owner (browser, Cloudflare Access login)
                                │
                ┌───────────────▼────────────────┐
                │ Cloudflare Worker  (studio)     │  static SPA (React+Vite) + JSON API
                │  • /api/projects …              │──── HF router (LLM: fix script, write prompts, QA)
                │  • /api/gpu/* (worker protocol) │
                │  • LogHub Durable Object (WS)   │
                └──────┬───────────────┬──────────┘
                    D1 │               │ R2 (media, presigned URLs)
                       │               │
                ┌──────▼───────────────▼──────────┐
                │ Colab GPU worker (Node/TS)       │  polls /api/gpu/jobs, runs ComfyUI,
                │  ComfyUI: H3 + Klein 9B + nodes  │  uploads results to R2, streams logs,
                │  ffmpeg (QA frames, assembly)    │  heartbeats, exits when idle
                └──────────────────────────────────┘
```

### 5.1 Repo layout to create
```
worker/                 Cloudflare Worker (wrangler) — API + Durable Object + D1 migrations
  src/index.ts          router (Hono recommended)
  src/do/loghub.ts      Durable Object: WS fan-out + ring buffer of last ~500 lines/project
  src/llm/              HF router client, prompts (fixer, prompt-writer, QA)
  src/script/           parser, validator, serializer  (pure TS, unit-tested)
  migrations/0001_init.sql
  wrangler.jsonc
web/                    React + Vite SPA served by Worker static assets (reuse shadcn components from src/components/ui)
gpu/                    Colab GPU worker (Node/TS) — imports ../src/lib/comfy/* builders
  src/main.ts           job loop
  workflows/            ComfyUI API JSON for Klein, OrbitSheets, chaining
docs/SCRIPT_FORMAT.md   owner-facing format spec (extract from §6)
docs/templates/         short_film_template.txt, series_template.txt
MiniMax_Studio_Colab.ipynb  → becomes "Start GPU worker" (same Steps 1–6 + Klein/nodes, Step 7 runs gpu worker)
```
The old Next.js app (`src/`) stays until Phase 6 is done; its ComfyUI builders are imported by `gpu/`.

### 5.2 D1 schema (initial)
```sql
CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT, aspect TEXT, created_at INTEGER, status TEXT);
CREATE TABLE script_versions (id TEXT PRIMARY KEY, project_id TEXT, kind TEXT /*raw|fixed|approved*/,
  body TEXT, report_json TEXT, created_at INTEGER);
CREATE TABLE assets (id TEXT PRIMARY KEY, project_id TEXT, kind TEXT /*character|prop|location*/,
  ref TEXT /*@gajju*/, name TEXT, spec_json TEXT, status TEXT /*draft|generating|review|approved*/,
  approved_version INTEGER);
CREATE TABLE asset_versions (id TEXT PRIMARY KEY, asset_id TEXT, version INTEGER, r2_key TEXT /*sheet png*/,
  views_json TEXT /*{front,face,left,right,back: r2_key}*/, voice_r2_key TEXT, instruction TEXT, created_at INTEGER);
CREATE TABLE episodes (id TEXT PRIMARY KEY, project_id TEXT, number INTEGER, title TEXT);
CREATE TABLE scenes (id TEXT PRIMARY KEY, episode_id TEXT, number INTEGER, duration REAL, spec_json TEXT,
  chain_group TEXT /*scenes sharing location+continuity*/, approved_clip_id TEXT);
CREATE TABLE clips (id TEXT PRIMARY KEY, scene_id TEXT, take INTEGER, prompt TEXT, params_json TEXT,
  r2_key TEXT, qa_json TEXT, qa_pass INTEGER, owner_note TEXT,
  status TEXT /*queued|rendering|qa|ready|failed|stale*/,
  asset_versions_json TEXT /*{assetId: version} used to build this take*/,
  context_clip_id TEXT /*previous clip whose tail was pinned (chaining), NULL if none*/,
  script_version_id TEXT, created_at INTEGER);
CREATE TABLE jobs (id TEXT PRIMARY KEY, project_id TEXT, type TEXT /*asset_image|asset_edit|asset_sheet|clip|qa|assemble*/,
  payload_json TEXT, status TEXT /*queued|claimed|running|done|failed|cancelled*/, priority INTEGER,
  claimed_by TEXT, claimed_at INTEGER, claim_token TEXT, lease_until INTEGER, attempt INTEGER,
  error TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE renders (id TEXT PRIMARY KEY, project_id TEXT, scope TEXT /*episode:<id>|film|series*/,
  r2_key TEXT, srt_r2_key TEXT, clip_ids_json TEXT /*ordered clips used*/, status TEXT /*ready|stale*/,
  created_at INTEGER);
CREATE TABLE gpu_workers (id TEXT PRIMARY KEY, last_seen INTEGER, info_json TEXT);
```
### 5.2a Dependency & invalidation rules
Every derived thing records exactly what it was built from (`clips.asset_versions_json`, `clips.context_clip_id`, `clips.script_version_id`, `renders.clip_ids_json`). When an input changes, dependents become **stale** — never silently kept, never auto-deleted:
1. **Asset re-approved** (new character/location/prop version): every clip whose `asset_versions_json` has an older version of it → `stale`. UI: "8 scenes use Gajju's old look — Regenerate all / Keep". Default suggestion: regenerate.
2. **Approved take of a scene replaced** (owner picks another take or a regenerate wins): downstream clips in the same `chain_group` whose `context_clip_id` chain leads to the old take → `stale` (their pinned head no longer matches). Non-chained scenes are unaffected.
3. **Script re-approved:** diff scenes by content hash; changed scenes' clips → `stale`; unchanged scenes keep their takes.
4. **Any render** whose `clip_ids_json` contains a clip that is no longer the approved take or is stale → `stale`. "Make final video" warns when stale clips exist and lists them.
5. Regenerating stale clips is a normal queued job; QA and owner review apply as usual. Old takes stay in history.

### 5.3 R2 key layout
`projects/<pid>/assets/<assetId>/v<n>/{portrait.png,sheet.png,front.png,…,voice.wav}` ·
`projects/<pid>/clips/<sceneId>/take<k>.mp4` · `projects/<pid>/qa/<clipId>/f<i>.jpg` ·
`projects/<pid>/renders/<renderId>.mp4|.srt` · `projects/<pid>/music/<id>.mp3`

### 5.4 GPU worker protocol (Worker API, auth = shared secret header `X-GPU-Key`, secret `GPU_KEY`)
- `POST /api/gpu/heartbeat` `{workerId, gpu, vramFree}` every 15 s → UI shows "GPU online".
- `POST /api/gpu/claim` → atomically picks highest-priority `queued` job (UPDATE … WHERE status='queued' … RETURNING), returns job + presigned R2 GET URLs for inputs and PUT URLs for outputs.
- `POST /api/gpu/jobs/:id/progress` `{pct, stage}` · `POST /api/gpu/jobs/:id/log` `{lines[]}` (→ LogHub DO) · `POST /api/gpu/jobs/:id/done` `{outputs}` · `POST /api/gpu/jobs/:id/fail` `{error}` (retry ≤2 then failed).
- **Leases & claim tokens (exactly-once results):** every claim generates a fresh random `claim_token` and `lease_until = now + 10 min`; `jobs` gets columns `claim_token TEXT, lease_until INTEGER, attempt INTEGER`. Every progress/log/done/fail call must send `{claim_token}`; the Worker updates only `WHERE id=? AND claim_token=? AND status IN ('claimed','running')` and each accepted progress/heartbeat extends `lease_until`.
- A cron (or the next claim call) re-queues jobs whose `lease_until` passed: status `queued`, `attempt+1`, `claim_token = NULL` (old token is now invalid).
- A late `done`/`fail` from an old worker → **409, ignored**. Outputs are written to per-attempt R2 keys (`…/take<k>-a<attempt>.mp4`), so a late upload can never overwrite the accepted one; a cleanup cron deletes R2 objects not referenced by any `clips` row after 24 h.
- `done` is idempotent: the same token twice → 200 no-op.
- Worker exits (and notebook deletes runtime) after `IDLE_MINUTES` with no claimable jobs.

### 5.5 Owner-facing UI (web/)
1. **Projects** list → New project → upload `.txt`.
2. **Script review:** left = original, right = fixed; changed lines highlighted; list of fixes in plain language; buttons *Approve* / *Edit* (textarea) / *Re-fix*.
3. **Cast & locations:** a card per asset: sheet image, voice play button, *Approve*, *Change…* (free text → Klein edit of only that), *Recreate*. Version history.
4. **Episodes/Film board:** scenes in script order (NOT one big gallery grid). Each scene: script excerpt, approved/latest take player, QA badge, *Regenerate* (optional note), take history with *Use this take*. Progress bar per episode.
5. **Logs drawer:** live log stream (DO WebSocket) filterable by job.
6. **Final:** *Make final video* (per episode / whole film / whole series) → player + download (mp4, srt).
7. Banner when GPU offline: "Colab chalu koro" + notebook link.

---

## 6. Canonical script format (extract to `docs/SCRIPT_FORMAT.md` in Phase 1)

Based on the owner's richer scripts ("The Missing Crunch", "The Stir"), plus optional EPISODE blocks.

```
DRAMA SCRIPT
TITLE: <text>
LOGLINE: <one line>
GENRE: <text>
LANGUAGE: English
ASPECT: 16:9 | 9:16
RESOLUTION: 1920x1080 | 1080x1920        (default from ASPECT)
FPS: 24
STYLE PROMPT: <style words; continuation lines indented 4 spaces>
NEGATIVE PROMPT: <things to avoid>

== CHARACTERS ==
CHARACTER @id | Display Name | human|animal|creature|voice_only
  ROLE: …  AGE: …  GENDER: …
  FACE: …  SKIN/FUR: …  EYES: …  HAIR: …  BUILD: …
  OUTFIT: …  ACCESSORIES: …
  PERSONALITY: …  VOICE: …  ACCENT: …
  (animals/creatures: SPECIES: …  LOOK: … instead of FACE/SKIN/HAIR)

== PROPS ==            (PROP blocks may also appear under CHARACTERS, as in the owner's files)
PROP @id | Name
  LOOK: …
  RULE: …
  VARIANT <name> | <scene range e.g. 6-7 or E02S03-E02S09> | <look>

== LOCATIONS ==
LOCATION @id | Name
  LOOK: …
  LIGHT: …

== RULES ==
RULE: <continuity rule>
NOTE: <production note>

== EPISODE 01 | <title> ==     ← OPTIONAL. If absent: all SCENEs belong to one film.

SCENE <n> | <seconds>s | <title>
  AT: @location, <time of day>
  CAST: @a, @b, @narrator (voice)
  CLIP: still|hero          LIPSYNC: none|required
  MOOD: …
  VISUAL: …                 (what happens)
  KEYFRAME: …               (the frame that must be right)
  CAMERA: …                 FRAME: … (who is where)
  MUSIC: <cue> | sound: … | fade_in: 0.5s | fade_out: 1s
  TRANSITION: cut | fade 1s
  SFX: <desc> | sound: … | length: 1s | at: 0.5s
  ACTION: @a stirs @bowl. | at: 0.5s
  @a (tone): "Line." | at: 1s
  @narrator [VO]: "Line." | at: 0.5s

  SHOT <n> | <seconds>s | wide|medium|close-up      (optional sub-shots; same fields as SCENE)
```

### 6.1 Validation rules (errors E…, warnings W…)
- E01 header missing TITLE/ASPECT; E02 ASPECT not 16:9/9:16.
- E03 any `@ref` used but not defined; E04 duplicate `@id`.
- E05 character without visual description (needs FACE/HAIR/OUTFIT, or SPECIES+LOOK); voice_only exempt.
- E06 scene duration missing or outside **2.5–29.9 s** (rendered length is longer, see §7.2; prefer ≤12 s).
- E07 SHOT durations don't sum to SCENE duration (±0.5 s).
- E08 dialogue/SFX `at:` beyond scene/shot duration.
- E09 speaker of a line not in CAST.
- E10 scene numbering not sequential within its episode/film.
- W01 dialogue too long for its window (> ~2.7 words/s) → suggest split or longer scene.
- W02 more than 3 speaking characters in one clip; W03 more than 9 reference images needed.
- W04 no KEYFRAME/CAMERA (LLM will add); W05 VARIANT ranges overlap/out of range.
- W06 missing LOCATION definition for `AT:`.
The validator returns structured issues `{code, severity, line, message_en, message_bn}`.

### 6.2 LLM fixer contract
Input: raw text + validator report + this spec + 1 full example. Output: **only** the canonical script. Loop: fix → validate → (≤2 more fix rounds with remaining issues) → present diff + plain-language change list (Banglish) to owner. **Must not invent episodes** for scripts without them. For loose scripts like `jungle_mayhem` (no character sheets, `SCENE 01 | 00:00–00:10 (10 seconds)`, `ACTION/DIALOGUE/END FRAME/SFX` lines): convert durations, map `DIALOGUE: GAJJU: "…"` → `@gajju: "…"`, `END FRAME` → KEYFRAME, and **propose** character/location descriptions (owner confirms in Cast step). Long scripts: process per episode to keep outputs short; keep a shared CHARACTERS block.

---

## 7. Generation knowledge (learned the hard way — reuse it)

### 7.1 H3 prompt formats
- **Text-only (mode t2v):** three fields, no tags:
  `integrated_multimodal_description: [Shot 1] … [Shot 2] …` / `overall_soundscape: …` / `non_diegetic_music: … | N/A`
- **With references (mode ref, Ref2VA):** six sections: `subject_definitions`, `summary` (starts `[reference generation]`), `retention_analysis` (`fully_preserved`/`weak_reference` per subject per shot), `detailed_description` ([Shot N] blocks), `overall_soundscape`, `non_diegetic_music`.
- Dialogue: `<d>[English] text</d>`; speaker id `(S1)`, `(S2)` on each vocal event; say "lips clearly moving" for lipsync shots.
- `<Picture N>` numbering = upload order of reference images. Subjects: `<Subject N> is Jules in <Picture 1> — …`. A Picture can define several subjects (character + location from one frame).
- Always end visual text with "No text anywhere in frame." (avoids logos/text; still not perfect — a chip bag got a logo once).
- Prompts of 300–450 words worked well. See Appendix A for two complete working prompts.

### 7.2 Durations / frames (verified against code and ffprobe)
- 24 fps. `framesForDuration(s)` in `minimax-h3-template.ts` = `round(s·24)` rounded **up** to the next `17n+5` frame count (H3 block grid). So the file is longer than requested:
  2.5 s→73 f (3.04 s) · 4 s→107 f (4.46 s) · 5 s→124 f (5.17 s) · 6 s→158 f (6.58 s) · 7 s→175 f (7.29 s) · 8 s→192 f (8.00 s) · 10 s→243 f (10.13 s) · 30 s→736 f (30.67 s).
- These match the ffprobe lengths of the clips rendered in the session (6.58, 7.29, 8.71, 10.83 s). The number shown in the old UI's frame box is NOT the rendered length.
- **Max per clip:** the UI's manual limit is 719 frames (29.96 s). Request ≤ 29.9 s (→ 719 f); 30 s → 736 f exceeds it. Validator E06 should use this.
- Assembly and subtitles must use the **actual** duration (ffprobe), never the script number. Optionally trim each clip to the script duration at assembly (cut the tail) when exact pacing matters.

### 7.3 Reference strategy that worked
1. Generate the first scene that shows the main character+location clearly in **text mode**.
2. Extract full-res frames with ffmpeg (`-ss T -frames:v 1 -q:v 2 x.jpg`): one wide (character+location), one close-up (prop/face).
3. Use them as `<Picture 1>`, `<Picture 2>` for all other scenes; when a new character first appears, extract them and add `<Picture 3>`.
With proper character sheets (Phase 4) replace step 1–2 by the approved sheets.

### 7.4 Failure modes seen (QA must catch these)
- Character missing from a two-shot (prompt asked for both; only one appeared) — fixed by stating "TWO women are fully visible side by side… LEFT half… RIGHT half…".
- Face cut off at frame edge during dialogue — fixed by "medium close-up, whole face fully inside the frame and centred".
- Action not visible (tongs nudging) — specify framing explicitly.
- Prop state continuity (bowl should be stirred but showed sections) — mention VARIANT state explicitly in every later scene.
Re-roll (new seed) + clearer framing words fixed every case within 1–2 takes. ~1 min / take at 720p.

### 7.5 Assembly that worked (ffmpeg on Colab)
```bash
# concat N clips (video+audio), then 1 s fade-out
ffmpeg -i c1.mp4 … -i cN.mp4 -filter_complex "[0:v][0:a]…[N-1:v][N-1:a]concat=n=N:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 192k tmp.mp4
ffmpeg -i tmp.mp4 -vf fade=t=out:st=$((D-1)):d=1 -af afade=t=out:st=$((D-1)):d=1 … final.mp4
```
H3 audio is **32 kHz** — when mixing in a music track, resample explicitly (`aresample=48000`) and use `amix`/`sidechaincompress` (duck music under dialogue). Respect TRANSITION (`cut` → concat, `fade 1s` → `xfade`/`acrossfade`).

---

## 8. Phases (build in order; each has a definition of done)

### Phase 1 — Script format, parser, validator, LLM fixer  (status: NOT STARTED)
1. Write `docs/SCRIPT_FORMAT.md` (owner-readable, from §6) + `docs/templates/short_film_template.txt` + `series_template.txt`.
2. `worker/src/script/parse.ts` → AST `{header, characters[], props[], locations[], rules[], episodes[{number,title,scenes[{…, shots[], lines[], sfx[]}]}]}` (no EPISODE ⇒ one implicit episode with `number: 0`). `serialize.ts` AST → canonical text. `validate.ts` → issues (§6.1).
3. Unit tests (vitest) using the three real scripts (§11): chicken & burrito parse with 0 errors; jungle parses with expected E05/W04 errors.
4. `worker/src/llm/hf.ts` (chat completions via HF router, retry/backoff, model id from env) + `fixer.ts` (§6.2).
5. CLI for testing without the Worker: `npx tsx worker/scripts/fix.ts <file>` → writes `<file>.fixed.txt` + report.
6. **Model bake-off:** run fixer on jungle Episode 01 with DeepSeek-V4-Pro and GLM-5.3; compare validity (0 errors), faithfulness (no story changes), and quality of invented character descriptions. Record the winner in §4.
**Done when:** all 3 scripts end with 0 validation errors after fixing; owner reads the jungle Episode 01 result and agrees.

### Phase 2 — Cloudflare backend + UI shell  (status: NOT STARTED)
1. `wrangler` project in `worker/`; bindings: D1 `DB`, R2 `MEDIA`, DO `LOGHUB`, secrets `HF_TOKEN`, `GPU_KEY`. Static assets from `web/dist`.
2. D1 migration (§5.2), API: projects CRUD, script upload → fix (async job, LLM runs in Worker), approve, assets list, scenes list, jobs, presigned R2 URLs.
3. LogHub DO: `POST /log` appends + broadcasts; `GET /ws?project=` WebSocket; keep last 500 lines.
4. `web/`: React+Vite+Tailwind, screens §5.5 (start with Projects, Script review, Logs drawer).
5. Cloudflare Access application on the Worker hostname (owner's email only). Verify `Cf-Access-Jwt-Assertion` in the Worker for `/api/*` except `/api/gpu/*` (GPU key instead).
6. Deploy (`wrangler deploy`); owner logs in from Mac.
**Done when:** owner uploads a script on the live URL, sees fixed script + change list, approves it; logs stream live.
Note: the owner's Cloudflare login for wrangler is needed (`npx wrangler login`, owner clicks Allow).

### Phase 3 — Colab GPU worker  (status: NOT STARTED)
1. `gpu/src/main.ts`: heartbeat, claim loop, job handlers, log forwarding, R2 upload via presigned PUT, idle exit.
2. Handler `clip`: download refs → `uploadImage` to ComfyUI → `buildMiniMaxH3Workflow` (mode ref/t2v, targetDimensions 1080p) → submit → poll → upload mp4.
3. Notebook: keep Steps 1–6 (they work), add Klein model + new custom nodes to Steps 4/6, replace Step 7 with "start GPU worker" (env: `STUDIO_URL`, `GPU_KEY` via Colab secrets panel, NOT pasted in a cell), keep idle auto-delete of runtime.
**Done when:** a scene queued from the UI renders on Colab and plays in the UI from R2.

### Phase 4 — Character / location reference sheets  (status: NOT STARTED)
1. Klein 9B portrait from the character spec (text → image), white/neutral background, full body + face. Edit: Klein image-edit with the owner's instruction on the previous version (keeps identity). Recreate: new seed.
2. Turnaround + voice: **ComfyUI-OrbitSheets** (MIT) "Character Turnaround Prompt (H3)" + "Frame Select" (+ VLM judge via HF endpoint) → 5 views + contact sheet + **voice sample**. Alternative for stills-only sheet: `muse-character-sheet-klein` (needs ComfyUI-RMBG; Klein 9B ≈ 29 GB VRAM).
3. Locations: Klein anchor still → OrbitSheets location sheet (front/right/rear/left).
4. Props: Klein still (+ VARIANT stills).
5. UI Cast screen with approve/change/recreate + voice player.
**Done when:** jungle Episode 01 cast (Gajju, Bunty, Sher Singh, animals) approved by owner.

### Phase 5 — Automatic scene prompts, QA, regeneration, voices, chaining  (status: NOT STARTED)
1. `prompt-writer` LLM: approved script scene + approved asset descriptions + reference slot map → H3 Ref2VA prompt (Appendix A style). Deterministic reference picking: location sheet view + each cast member's best view (≤9 images) + each speaking character's voice sample as `<Audio N>` (≤3).
2. Clips rendered with `non_diegetic_music: N/A`.
3. QA job = **visual + audio**, result `{pass, issues[], fix_hint, scores}`; fail ⇒ new take with fix_hint merged into prompt (max 2 auto retakes) ⇒ then flag for owner.
   - **Visual:** ~8 frames (start/middle/end of each shot; or a low-res proxy clip if the VLM accepts video input — Qwen3-VL does) → vision LLM with KEYFRAME/FRAME/CAST: cast present, faces inside frame, action visible, prop variant state.
   - **Dialogue/ASR:** run `faster-whisper` (large-v3) on the GPU worker → transcript + word timestamps; compare with the script lines (normalized WER; flag if > ~25 % or a line is missing / extra speech appears).
   - **Voice consistency:** speaker embedding (e.g. SpeechBrain ECAPA or resemblyzer) of each dialogue segment vs the character's approved voice sample; flag below a cosine threshold (calibrate on the first approved takes).
   - **Lip-sync (stretch goal):** SyncNet-style offset/confidence on `LIPSYNC: required` shots; until then mark lip-sync as "owner check" in the UI.
   - Still frames alone cannot judge speech, voice or lip-sync — these checks are why the audio step exists.
4. Owner *Regenerate* with optional note (note → prompt-writer).
5. Chaining: scenes with same `AT` location and `TRANSITION: cut` in sequence form a `chain_group`; test **ComfyUI-H3-Motion-Context** (GPL-3; `context_length` 22, `audio_context_length` 18; resolution must match; quality drifts down long chains — cap chain length ~4) vs **ComfyUI_MiniMaxH3_Director** (Apache-2.0, inter-segment guidance). Keep the better one.
**Done when:** "The Stir" (burrito script) renders end-to-end with ≤1 owner action per scene.

### Phase 6 — Assembly, music, subtitles, final player  (status: NOT STARTED)
1. `assemble` job on GPU worker: approved takes in order, transitions, actual durations (ffprobe, §7.2), one music track (owner-uploaded mp3 or generated later), duck under dialogue, 1080p H.264 + AAC 48 kHz (resample H3's 32 kHz audio).
2. **Subtitles from what was actually spoken:** use each clip's ASR word timestamps (from QA) + the clip's real start offset in the final timeline; text = the script line (correct spelling) aligned to the ASR timing (fall back to script `at:` only if ASR found no speech). Optional burn-in.
3. UI Final screen: player + download mp4/srt; per episode and whole film/series.
**Done when:** jungle Episode 01 (90 s) final video plays in the UI and on the owner's Mac.

### Afterwards
Notifications (email/Telegram), idea→script generator, serverless GPU option, retire the old Next.js UI (`src/`).

---

## 9. Borrowed from GitHub (researched 2026-10-25)

| Repo | License | Use |
|---|---|---|
| [lumosai8/ComfyUI-OrbitSheets](https://github.com/lumosai8/ComfyUI-OrbitSheets) | MIT | Character turnaround + location sheets rendered by H3; VLM frame selection; voice sample. Phase 4 |
| [muse-collective-26/muse-character-sheet-klein](https://github.com/muse-collective-26/muse-character-sheet-klein) | node: see repo; Klein 9B non-commercial (fine: personal) | 5-pose Klein sheet with confirm/re-roll/edit. Phase 4 alt |
| [NikoDemon80/ComfyUI-H3-Motion-Context](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context) | GPL-3.0 | Clip chaining (motion+audio continue across cuts), works after `MiniMaxH3ReferenceToVideo`. Phase 5 |
| [AIMixer/ComfyUI_MiniMaxH3_Director](https://github.com/AIMixer/ComfyUI_MiniMaxH3_Director) | Apache-2.0 | Multi-segment H3, shared refs, inter-segment guidance. Phase 5 alt |
| [eternityspring/shuohao-skills](https://github.com/eternityspring/shuohao-skills) | Apache-2.0 | Ideas for character bible / staging / storyboard prompts (Chinese-first) |
| [chatfire-AI/huobao-drama](https://github.com/chatfire-AI/huobao-drama) | CC BY-NC-SA | Design idea only: agents script_rewriter → extractor → storyboard_breaker → prompt_generator |
| Toonflow / DramaClaw / Jellyfish | MIT / ELv2 / Apache | Evaluated, **not adopted** (server apps, no H3 Ref2VA, no Worker/D1) |
Also: ComfyUI has `MiniMaxH3AddGuide` (anchor an image at any frame) — the current template already uses it for audio refs in t2v/flf.

---

## 10. Gotchas already solved (don't re-break)

1. **Next.js 16 defaults to Turbopack**; this repo needs `--webpack` (`next dev --webpack`, build via `scripts/build.mjs`).
2. **Dev server blocks cross-origin requests** through a tunnel domain → Colab must run the **production build** (`npm run build` + `node server.js`). Notebook Step 5/7 already do this.
3. **Ubuntu 24.04 (Colab)** has no `libgl1-mesa-glx` → use `libgl1`; never hide apt errors (`> /dev/null`) — Step 3 now checks `which ffmpeg aria2c`.
4. **Latent upscaler node** (current version) requires `enable_temporal_chunking` and `force_unload` inputs (old name `enable_chunking` kept too) — fixed in `minimax-h3-template.ts`. `docs/Minimax_Studio_Workflow.json` was **not** updated.
5. **Colab notebook kernelspec** must be set (`metadata.kernelspec.name = python3`) or "Runtime type" is blank.
6. **Drive-mounted output folder is slow to read** through the tunnel (~10 KB/s–1 MB/s). Do frame extraction/assembly on Colab; serve media from R2 in the new design.
7. Typing long prompts into the UI via automation drops characters → set textarea values programmatically (React native value setter + `input` event).
8. G4 is detected as "RTX PRO 6000 Blackwell" → flags `--reserve-vram 3 --highvram`; L4 must NOT use `--highvram`.
9. H3 audio is 32 kHz (see §7.5).
10. Fixed after an external review (2026-10-25, branch `drama-pipeline`): gallery folder names `.`/`..` escaped `output/` (sanitizer now rejects dot-names, `folderPath` checks containment, generate route uses the same sanitizer); model downloads accepted files ≥90 % complete (root cause: `sizeBytes` used GiB for decimal GB) → exact byte sizes + exact Content-Length check; `doDownload` swallowed errors so retries never ran → errors now propagate, retry+Range resume verified with a local test server; "Repeat generation" kept old refs/frames → restore now replaces them; Frames mode output 1920×1088 → now cropped to 1920×1080 like other modes; exported workflow JSON got the new upscaler inputs.
11. FLF follow-up: browser metadata now uses cropped output dimensions. Repeat stores exact pixel dimensions instead of converting them to MP (including nonstandard ratios and legacy aligned outputs); changing the resolution or first frame clears that override. Regression tests: `npm test`.
12. The old UI lets the duration slider reach 30 s, which renders 736 frames (> the 719 manual limit) — clamp to 29.9 s if the old UI is kept.
13. The H3 community license reportedly may not cover some regions (EU/UK/KR/US per a node README) — owner uses it for personal research; just don't plan commercial distribution.

---

## 11. Test material (on the owner's Mac; don't commit)

| File | Type | Notes |
|---|---|---|
| `~/Downloads/chicken_tacos_drama_script.txt` | 6 scenes, 40 s, 16:9 | Canonical format. Rendered as "The Missing Crunch" (Drive: `MyDrive/MiniMax_Studio/outputs/The_Missing_Crunch.mp4`) |
| `~/Downloads/burrito_bowl_drama_script.txt` | 7 scenes, 40 s, 16:9 | Canonical format. Rendered as "The Stir" (`…/outputs/The_Stir.mp4`) |
| `~/Downloads/jungle_mayhem_drama_Script.txt` | 20 episodes × 9 scenes × 10 s, 9:16 | Loose format, **no character descriptions** → main fixer test |

If the next AI cannot read `~/Downloads`, ask the owner to attach the files.

---

## 12. Status (update at the end of every phase)

| Phase | Status | Date | Notes |
|---|---|---|---|
| 0 Research & plan | DONE | 2026-10-25 | This document |
| 1 Script format/parser/validator/fixer | NOT STARTED | | `.dev.vars` already gitignored; owner must create it with HF_TOKEN |
| 2 Cloudflare backend + UI | NOT STARTED | | needs `wrangler login` by owner |
| 3 Colab GPU worker | NOT STARTED | | |
| 4 Reference sheets | NOT STARTED | | |
| 5 Prompts/QA/regenerate/voice/chaining | NOT STARTED | | |
| 6 Assembly/music/subtitles/player | NOT STARTED | | |

---

## Appendix A — Two complete prompts that produced good clips

**A1. Text mode (scene 2 of "The Stir", 1280×720, 162 frames):**
```
integrated_multimodal_description: [Shot 1] Wide shot, static camera, held, eye-level, cinematic film still, 35mm lens, soft film grain, warm honey-and-cool-light colour grade. Midday in a bright apartment kitchen: a wooden island in the centre, hanging pothos plants, a copper pendant light above the island, and a tall window on the left pouring warm honey sunlight across the scene, with soft cool fill light from the right. On the island, centred, sits a wide shallow cream ceramic bowl with a thin terracotta rim, holding a burrito bowl arranged in six neat separate sections: white rice, black beans, sliced grilled chicken, yellow corn salsa, green guacamole and red salsa, with a small lime wedge and a single cilantro sprig at the centre. Jules, a tall lean 34-year-old woman with a long face, sharp cheekbones, a small scar through her left eyebrow, warm tan skin, focused hazel eyes and a thick black braid over her right shoulder, wearing an olive linen shirt with sleeves rolled past the elbow, slim grey jeans and a small canvas apron with a front pocket, stands on the right at the island edge. She steps back, puts her hands on her hips, lifts her chin and tilts her head to admire the bowl, letting out a small satisfied exhale through her nose.
[Shot 2] Close-up on the face of Jules, camera drifting gently left. She leans down over the island until her head is level with the rim of the bowl, which sits sharp in the foreground with its six neat sections. Warm sunlight from the left lights her cheekbones and the scar in her eyebrow. She gives one slow, proud nod and, lips clearly moving, says, pleased: <d>[English] Now that's a bowl.</d> Realistic food texture, fresh herbs, no text anywhere in frame.

overall_soundscape: Quiet bright kitchen at midday, soft room tone, faint city ambience through the window. Shot 1: a small soft exhale through the nose. Shot 2: her pleased line, close and dry.

non_diegetic_music: Warm, gentle solo upright piano at a slow mid-tempo, soft and intimate.
```

**A2. Reference mode with 3 pictures (scene 6, two speakers):**
```
subject_definitions:
<Subject 1> is Jules in <Picture 1> — a tall lean woman with a long face, sharp cheekbones, a scar through the left eyebrow, warm tan skin, a thick black braid over the right shoulder, olive linen shirt with rolled sleeves and a small canvas apron.
<Subject 2> is the sunlit kitchen in <Picture 1> — wooden island, hanging pothos plants, copper pendant light, warm midday sun from the left.
<Subject 3> is the burrito bowl in <Picture 2> — the same wide shallow cream ceramic bowl with a terracotta rim, now with all the ingredients stirred together into a colourful swirl and a lime wedge on top.
<Subject 4> is Devi in <Picture 3> — a woman with a square face, a dimple in her left cheek, light freckles, light brown skin, short black side-parted hair and a cream cable-knit sweater.

summary:
[reference generation] <Subject 1> is horrified that <Subject 3> was stirred; <Subject 4> tastes it and calmly says it is better this way.

retention_analysis:
<Subject 1> ([Shot 1]): fully_preserved — face, scar, braid, olive shirt and apron retained.
<Subject 2> ([Shot 1], [Shot 2]): fully_preserved — wooden island and warm sunlight retained.
<Subject 3> ([Shot 1], [Shot 2]): weak_reference — same bowl and rim, ingredients now stirred into a swirl.
<Subject 4> ([Shot 2]): fully_preserved — face, dimple, freckles, short hair and cream sweater retained.

detailed_description:
[Shot 1] Close-up on the face of <Subject 1>, camera drifting gently in, cinematic film still, 35mm lens, shallow depth of field, soft film grain, warm honey-and-cool-light colour grade. The stirred <Subject 3> sits in the soft foreground. She stares at it with her mouth open and eyes wide, one hand frozen in mid-air at chest height, palm up. Lips clearly moving, <Subject 1> (S1) says, horrified: <d>[English] Twenty minutes!</d>
[Shot 2] Close-up on the face of <Subject 4>, static camera, held, the stirred bowl in the soft foreground. She holds a short wooden spoon near her mouth, takes a slow bite, chews with her eyes half closed, and a small warm smile spreads across her face, dimple showing. Lips clearly moving, <Subject 4> (S2) says, warm and low: <d>[English] Better this way. Try it.</d> No text anywhere in frame.

overall_soundscape:
Quiet bright kitchen at midday. Shot 1: her horrified exclamation, close and dry. Shot 2: a soft chew, then her warm low line.

non_diegetic_music:
Warm, gentle solo upright piano at a slow mid-tempo.
```
(In the new pipeline set `non_diegetic_music: N/A` — music is added at assembly.)
