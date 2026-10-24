'use client'

/**
 * Learn tab content: step definitions for the beginner tutorial.
 * Each step = a mockup of the relevant screen area (learn-mockups.tsx)
 * with numbered <Hl> highlights + callouts explaining "what / why / how".
 * INVARIANT: every callout number n has exactly one matching <Hl n> zone.
 *
 * (правка 114) Полная актуализация тура под текущий функционал программы:
 *   + окно приветствия (правки 112–113),
 *   + диктофон в поле промпта (правки 65/74),
 *   + горячая клавиша R/К на диктовку (правка 118),
 *   + вложения чата живут только в чате (правка 108), KV-кэш LLM (правка 109),
 *   + ручной ввод значений у слайдеров (правка 107),
 *   + два режима Upscale и метки в галерее (правки 74/77/78),
 *   + отдельный шаг по LoRA: турбо-лора в списке, сила, триггеры (правки 44/95/96),
 *   + вкладка «Внешний вид» и 8 вкладок настроек (правка 111),
 *   + шаги pass 1: 2–30, по умолчанию 4, ручной ввод 1–128 (правки 63–77).
 *
 * (правка 163) Актуализация под правки 136–162:
 *   + 3 режима генерации: Текст / Кадры / Референсы (правка 146),
 *   + Bonsai 2 27B — LLM по умолчанию (правка 162),
 *   + Ассистент видит видео-кадры на Bonsai (правка 162),
 *   + RTX VSR: HDR убран (правка 162), DLSS 1.5× работает (правка 162),
 *   + Bonsai light — optional, баннер не требует (правка 162),
 *   + Соотношение сторон в режиме «Кадры» из первого кадра (правка 152),
 *   + Ассистент знает режим и не ломает промпт при переключении (правка 150).
 */
import type { ReactNode } from 'react'
import {
  Hl,
  MockSidebar,
  MockRefDropzone,
  MockRefCard,
  MockPrompt,
  MockCtaButton,
  MockSelect,
  MockSlider,
  MockToggle,
  MockBar,
  MockLabel,
  MockQueuePill,
  MockGalleryTile,
  MockLightbox,
  MockMetaDialog,
  MockStats,
  MockWarningBanner,
  MockModelsList,
  MockSettingsGeneral,
  MockSettingsAppearance,
  MockSettingsLlm,
  MockSettingsDanger,
  MockSettingsComfyLinks,
  MockSettingsVoice,
  MockSettingsOpt,
  MockLoraList,
  MockUpscalePanel,
  MockWelcomeDialog,
} from './learn-mockups'

export interface LearnCallout {
  n: number
  title: string
  text: string
}

export interface LearnStep {
  id: string
  title: string
  /** One-line teaser shown in the "Что дальше" strip. */
  short: string
  mock: ReactNode
  callouts: LearnCallout[]
  tip?: string
}

/* ── helper: wrapper for mockup areas ── */
function Stage({ children }: { children: ReactNode }) {
  return <div className="w-full flex items-center justify-center gap-3 flex-wrap">{children}</div>
}

export const LEARN_STEPS: LearnStep[] = [
  /* ═══════════════ ЧАСТЬ 1. СТАРТ ═══════════════ */
  {
    id: 'welcome',
    title: "Welcome - what is this program?",
    short: "Local studio: MiniMax H3 neural network on your PC and start.bat.",
    mock: (
      <Stage>
        <Hl n={1}><MockWelcomeDialog /></Hl>
        <Hl n={2}><MockSidebar /></Hl>
        <Hl n={3}>
          <div className="w-[200px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-1.5">
            <p className="text-[11px] font-mono text-cyan-300 font-semibold">start.bat</p>
            <p className="text-[9px] text-muted-foreground leading-relaxed">{"One click and everything starts:"}</p>
            <div className="space-y-1 pt-1">
              <p className="text-[9px] text-foreground/80">{"• ComfyUI (neural network, port 8188)"}</p>
              <p className="text-[9px] text-foreground/80">{"• web interface"}</p>
              <p className="text-[9px] text-foreground/80">{"• browser"}</p>
            </div>
          </div>
        </Hl>
        <Hl n={4}>
          <div className="w-[200px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-1.5">
            <p className="text-[11px] text-foreground font-semibold">{"🖥 Everything on your PC"}</p>
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              {"\n              The neural network runs on your video card, not in the cloud. You don’t need the Internet for generation - only for the initial download of models.\n            "}</p>
          </div>
        </Hl>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Welcome window", text: "Appears every time you start the program until you check the “Don’t show this window again” checkbox. Inside there is a short instruction of three steps: download models → generate the first video → see the result. From the window you can immediately open the settings or this tour. If the window is “lost”, get it back: Settings → General → “Show welcome window”." },
      { n: 2, title: "Five tabs", text: "“Generate” - workplace (3 modes: Text / Frames / References), “Assistant” - local LLM assistant (Bonsai 2 27B), “Upscale” - upscale video (DLSS 5 and RTX VSR 1×–4×), “Gallery” - ready-made videos, “Learn” - this tour. The sidebar can be collapsed." },
      { n: 3, title: "start.bat - your remote control", text: "The only launch point: raises the ComfyUI neural network, interface and opens the browser. If something goes wrong, just restart it." },
      { n: 4, title: "Local and offline", text: "The video is generated on your video card. After a one-time download of models, the Internet is no longer needed." },
    ],
    tip: "When you launch it for the first time, the interface may wait until ComfyUI loads - this is normal, wait for the green indicator.",
  },
  /* (правка 132) Системные требования — файл подкачки, частая причина ошибок */
  {
    id: 'sys-reqs',
    title: "System Requirements - Page File",
    short: "Increase the page file to 32 GB, otherwise you will get an \"out of memory\" error.",
    mock: (
      <Stage>
        <Hl n={1}>
          <div className="w-[280px] rounded-xl border border-amber-400/40 bg-amber-500/10 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
                  <path d="M12 9v4"/>
                  <path d="M12 17h.01"/>
                </svg>
              </span>
              <div>
                <p className="text-[13px] font-semibold text-amber-300">{"Swap file"}</p>
                <p className="text-[10px] text-muted-foreground">Virtual Memory / Page File</p>
              </div>
            </div>
            <p className="text-[11px] text-foreground/80 leading-relaxed">
              {"\n              The program consumes a lot of RAM. If the page file is small, Windows will display an “out of memory” error.\n            "}</p>
            <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[10px] text-foreground/70 leading-relaxed space-y-1">
              <p className="font-medium text-foreground">{"Minimum: 32 GB (32768 MB)"}</p>
              <p>{"Recommended: 64 GB (65536 MB)"}</p>
            </div>
          </div>
        </Hl>
        <Hl n={2}>
          <div className="w-[280px] rounded-xl border border-border bg-[var(--surface-1)] p-3.5 space-y-2">
            <p className="text-[11px] font-semibold text-foreground">{"How to enlarge (Windows):"}</p>
            <div className="space-y-1.5 text-[10px] text-muted-foreground leading-relaxed">
              <p><span className="inline-block w-4 h-4 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold text-center leading-4">1</span> Win + R → <code className="font-mono bg-[var(--surface-2)] px-1 rounded">sysdm.cpl</code> → Enter</p>
              <p><span className="inline-block w-4 h-4 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold text-center leading-4">2</span> {" Advanced Tab"}</p>
              <p><span className="inline-block w-4 h-4 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold text-center leading-4">3</span> {" “Performance” → “Options” → “Change...”"}</p>
              <p><span className="inline-block w-4 h-4 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold text-center leading-4">4</span> {" Uncheck \"Automatically detect size\""}</p>
              <p><span className="inline-block w-4 h-4 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold text-center leading-4">5</span> {" Select drive (usually C:)"}</p>
              <p><span className="inline-block w-4 h-4 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold text-center leading-4">6</span> {" Set \"Maximum size\" = "}<b className="text-foreground">32768</b></p>
              <p><span className="inline-block w-4 h-4 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold text-center leading-4">7</span> {" “Install” → “OK” → "}<b className="text-foreground">{"restart PC"}</b></p>
            </div>
          </div>
        </Hl>
        <Hl n={3}>
          <div className="w-[200px] rounded-lg border border-red-400/30 bg-red-500/5 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-red-400">{"❌ Without this:"}</p>
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              {"\n              Error “Not enough memory” / “CUDA out of memory” / the program crashes during generation.\n            "}</p>
          </div>
        </Hl>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Why is this important", text: "The program (ComfyUI + MiniMax H3 neural network) consumes 10–20+ GB of RAM during generation. The paging file (virtual memory) is “extra memory” on the disk, which provides backup when there is not enough RAM. If it is small (Windows sets 1–4 GB by default), the program will generate an error." },
      { n: 2, title: "How to increase", text: "Win + R → sysdm.cpl → “Advanced” → “Performance” → “Options” → “Edit”. Uncheck “Automatic”, select disk, “Maximum size” = 32768 (or more), “Install” → “OK” → reboot. This will take 30 seconds." },
      { n: 3, title: "Symptoms", text: "If you see errors “Not enough memory”, “CUDA out of memory”, “Page file” or the program simply crashes during generation, most likely the page file is too small. Increase it and restart your PC." },
    ],
    tip: "This only needs to be done once. After increasing the page file, the memory problem goes away forever.",
  },
  {
    id: 'first-run',
    title: "First launch - download models",
    short: "Yellow banner → Settings → download. One-time, ~50 GB.",
    mock: (
      <Stage>
        <Hl n={1}><MockWarningBanner /></Hl>
        <Hl n={2}><MockModelsList /></Hl>
        <Hl n={3}>
          <div className="w-[190px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-foreground">{"Model statuses"}</p>
            <p className="text-[9px] text-muted-foreground">{"✓ — ready"}</p>
            <p className="text-[9px] text-muted-foreground">{"○ - not downloaded"}</p>
            <p className="text-[9px] text-cyan-300">{"⬇ — swings (% and speed)"}</p>
            <p className="text-[9px] text-red-400">{"! - error (repeat)"}</p>
          </div>
        </Hl>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Banner at the top of the screen", text: "Appears when the necessary models have not yet been downloaded - without them, the generation will not work correctly. The “Download in Settings” button opens the settings, ✕ temporarily hides the banner." },
      { n: 2, title: "Two groups of models", text: "“Minimax H3 (generation)” - video engine: diffusion model, text encoder, VAE, Turbo LoRA, upscaler, etc. (total ~46 GB). “LLM assistant” - chat model: Bonsai 2 27B (default, ~7.8 GB, ternary, vision), Gemma 4 12B (Q3/Q4/Q5) or Qwen3.5 9B. It is enough to select ONE LLM model - Bonsai by default."},
      { n: 3, title: "Loading - background", text: "Click ⬇ next to the model and see the percentage and speed. You can close the settings window at any time: the download will NOT be interrupted and will continue in the background, the status will be visible in the banner. Through ✕ you can stop the download and continue later. Downloaded models remain in the models folder and will not go anywhere." },
    ],
    tip: "Have you already downloaded models with the old version of the program? Settings → General → “Transfer models from the old version”: select the folder with the old build, and the program will transfer them itself.",
  },
  {
    id: 'interface',
    title: "Interface - where everything is",
    short: "Tabs, sensors, ComfyUI indicator and settings.",
    mock: (
      <Stage>
        <Hl n={1}><MockSidebar active="generate" /></Hl>
        <Hl n={2}>
          <div className="w-[210px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-2">
            <MockLabel>{"Generation tab"}</MockLabel>
            <div className="border-2 border-dashed border-border rounded-lg py-2.5 text-center">
              <p className="text-[9px] text-muted-foreground">{"references (optional)"}</p>
            </div>
            <MockPrompt withMention />
            <MockSelect value="1280×704 · 720p" />
            <MockCtaButton label={"Generate video"} />
          </div>
        </Hl>
        <Hl n={3}>
          <div className="w-[200px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[9px] text-muted-foreground">{"ComfyUI connected"}</span>
            </div>
            <MockStats />
          </div>
        </Hl>
        <Hl n={4}>
          <div className="w-[200px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-foreground">{"⚙ Settings - 8 tabs"}</p>
            <p className="text-[9px] text-muted-foreground">{"General · Appearance · LLM · Voice"}</p>
            <p className="text-[9px] text-muted-foreground">{"Optimization · ComfyUI · Links · Reset"}</p>
          </div>
        </Hl>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Sidebar", text: "Five tabs - “Generate”, “Assistant”, “Upscale”, “Gallery”, “Learn”. At the bottom is the ComfyUI indicator (green dot = backend is connected) and the settings gear." },
      { n: 2, title: "The \"Generate\" workspace", text: "The whole chain in one place: mode (Text / Frames / References) → prompt → refs (depending on the mode) → resolution and duration → “Generate video”. Below is a status card and a gallery of the latest videos." },
      { n: 3, title: "Indicator and sensors", text: "Red dot - ComfyUI is not running: generation is not possible (gallery and settings are available). VRAM / GPU / RAM sensors - you can see from them whether you are running into video card memory." },
      { n: 4, title: "Settings - 8 tabs", text: "Everything the program can do: models and LoRA, appearance, assistant, voice input, memory optimization, ComfyUI status, links for manual download and “Reset” (danger zone). Let's look at each in the last steps of the tour." },
    ],
    tip: "The sidebar is collapsible - if you want more space for prompts.",
  },
  /* ═══════════════ ЧАСТЬ 2. ПУТЬ К ВИДЕО ═══════════════ */
  {
    id: 'modes',
    title: "Step 1 - Generation Mode",
    short: "Three modes: Text · Frames · References - choose according to your data.",
    mock: (
      <Stage>
        <div className="w-[300px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-2">
          <MockLabel>{"Generation mode"}</MockLabel>
          <div className="grid grid-cols-3 gap-1.5">
            <Hl n={1}>
              <div className="rounded-md border border-cyan-500/50 bg-cyan-500/15 px-2 py-1.5 text-center">
                <p className="text-[10px] font-semibold text-cyan-300">{"Text"}</p>
                <p className="text-[7px] text-muted-foreground mt-0.5">{"description only"}</p>
              </div>
            </Hl>
            <Hl n={2}>
              <div className="rounded-md border border-cyan-500/50 bg-cyan-500/15 px-2 py-1.5 text-center">
                <p className="text-[10px] font-semibold text-cyan-300">{"Frames"}</p>
                <p className="text-[7px] text-muted-foreground mt-0.5">{"1–2 pictures → video"}</p>
              </div>
            </Hl>
            <Hl n={3}>
              <div className="rounded-md border border-cyan-500/50 bg-cyan-500/15 px-2 py-1.5 text-center">
                <p className="text-[10px] font-semibold text-cyan-300">{"References"}</p>
                <p className="text-[7px] text-muted-foreground mt-0.5">{"up to 15 files"}</p>
              </div>
            </Hl>
          </div>
          <div className="rounded-md bg-[var(--surface-2)] px-2 py-1.5 space-y-1">
            <p className="text-[8px] text-muted-foreground"><b>{"Text:"}</b> {" prompt + audio refs (voice/voiceover). Pictures and videos are not used."}</p>
            <p className="text-[8px] text-muted-foreground"><b>{"Frames:"}</b> {" first and (optional) last frame + audio. Aspect ratio from the frame. Screenshot - Ctrl+V."}</p>
            <p className="text-[8px] text-muted-foreground"><b>{"References:"}</b> {" up to 15 files - 9 pictures, 3 videos, 3 audio. Full control."}</p>
          </div>
        </div>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Text (T2V)", text: "Pure text-to-video: only the prompt describes the scene. Audio references can be attached for voice/voiceover (WAV, MP3...), but pictures and video references are not used in this mode - the model creates everything from scratch based on the text." },
      { n: 2, title: "Frames (FL2VA)", text: "The first frame (mandatory) sets the start of the video, the last (optional) sets the end. The prompt describes the transition between them. You can simply paste a screenshot using Ctrl+V. The aspect ratio is automatically taken from the first frame - the selector is locked. Audio references for voice/voice acting." },
      { n: 3, title: "References (Ref2VA)", text: "Full mode: up to 15 files - 9 pictures (characters, objects, style), 3 videos (motion, scenes), 3 audio (voice, sound). Each file has a role. This is the most flexible mode as before." },
    ],
    tip: "The assistant knows the selected mode and will not add tags that are not supported to the prompt: when switching to “Text”, the <Picture N> and <Video N> tags will be automatically removed.",
  },
  {
    id: 'refs',
    title: "Step 2 - References (References mode)",
    short: "Up to 15 files: 9 pictures, 3 videos, 3 audio. Or zero is also possible.",
    mock: (
      <Stage>
        <div className="w-[280px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <MockLabel>{"References"}</MockLabel>
            <span className="text-[9px] text-muted-foreground">1/9 img · 1/3 vid · 0/3 aud</span>
          </div>
          <Hl n={1}><MockRefDropzone /></Hl>
          <Hl n={2}><MockRefCard /></Hl>
          <Hl n={3}>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-[var(--surface-2)] p-2">
              <div className="w-9 h-9 rounded bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
                <span className="text-[7px] text-cyan-300 font-bold">VID</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-foreground truncate font-mono">scene_walk.mp4</p>
                <p className="text-[9px] text-muted-foreground">{"scene · movement"}</p>
              </div>
              <span className="flex items-center gap-1 text-[8px] text-muted-foreground shrink-0">
                <span className="w-3 h-3 rounded-sm border border-cyan-500/50 bg-cyan-500/30 inline-flex items-center justify-center text-[7px] text-cyan-200">✓</span>
                {"\n                use sound\n              "}</span>
            </div>
          </Hl>
        </div>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Is it possible without them at all?", text: "In the “References” mode, generation is started based on just one prompt. References - accuracy: up to 15 files - 9 pictures, 3 videos, 3 audio. Pictures - who/what, video - how he moves, audio - voice and sound. You can simply paste a screenshot using Ctrl+V. In the “Text” mode, pictures and video references are not used - only audio; In the “Frames” mode, pictures are specified by the “First frame” / “Last frame” fields." },
      { n: 2, title: "The role of reference", text: "Each file has a role: “character / object”, “scene”, “style”, “composition”. This is a hint to the model WHAT to take from the file: face, background, palette or angle." },
      { n: 3, title: "Video and audio", text: "For a video reference, you can check “use sound” - the model will take the sound directly from the clip. Audio files are tied to the intent: “Voice”, “Tempo/Rhythm” or “Style” - what exactly the sound should influence." },
    ],
    tip: "Close-up faces/objects work best in good lighting. For speeches, a clean voice recording.",
  },
  {
    id: 'prompt',
    title: "Step 3 - Write a description (prompt)",
    short: "Words decide everything: @ tags, voice acting <d>...</d>, voice dictation.",
    mock: (
      <Stage>
        <div className="w-[300px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-2">
          <Hl n={1}><MockPrompt withMention /></Hl>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground">{"Enter "}<span className="font-mono text-foreground/70">@</span> {" - a list of references will appear"}</span>
            <Hl n={2}>
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center text-[10px]">🎙</span>
              </div>
            </Hl>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground">{"Voice input: press → speak → press again"}</span>
            <Hl n={3} className="shrink-0"><div className="p-1.5 rounded-lg border border-border bg-[var(--surface-2)] text-[9px] text-muted-foreground">⛶</div></Hl>
          </div>
          <div className="flex justify-end"><Hl n={4}><MockCtaButton label={"Generate video"} /></Hl></div>
        </div>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Prompt field and tags", text: "Describe the scene in words: who, where, what is doing. The model understands ENGLISH noticeably better - write the final prompt in English (the “Examples” button provides ready-made English prompts). The @ symbol inserts the <Picture 1> tag - “use this reference here.” Wrap the heroes' remarks in <d>...</d> - they will be voiced." },
      { n: 2, title: "Voice input (voice recorder)", text: "A round microphone inside the prompt field: press it - describe the scene with your voice - press it again, and the recognized text will be inserted directly into the prompt. The same button is available in the full-screen editor and in the Assistant chat. Hotkey: R (English) / K (Russian) - the same physical key in both layouts: press when the focus is NOT in the input field (for example, click in the empty space next to it) - recording starts, press again - stop and insert text. If dictation is already in progress, the key always brings it to the end. Enabled and configured in Settings → Voice." },
      { n: 3, title: "Full screen editor", text: "Expands the input field to full screen - convenient for long scripts." },
      { n: 4, title: "Launch", text: "The button is active when the prompt is entered. Ctrl+Enter starts generation directly from the input field." },
    ],
    tip: "Write cinematically: “slow camera push-in”, “warm sunset light”, “speaks in a whisper” - details improve the result.",
  },
  {
    id: 'llm-assistant',
    title: "Assistant - will write the prompt for you",
    short: "Local LLM (Bonsai 2 27B) sees the refs and issues a ready-made prompt.",
    mock: (
      <Stage>
        <div className="w-[310px] rounded-lg border border-violet-500/25 bg-[var(--surface-1)] p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-[10px] text-violet-300 font-bold">AI</span>
            </div>
            <div>
              <p className="text-[10px] font-medium text-foreground">{"Assistant Bonsai 2 27B (default)"}</p>
              <p className="text-[8px] text-emerald-400">{"● locally · sees pictures and video frames"}</p>
            </div>
          </div>
          <Hl n={1}>
            <div className="rounded-lg border border-border bg-[var(--surface-2)] p-2 space-y-1">
              <p className="text-[9px] text-muted-foreground">{"You: Describe the scene: a girl from the ref walks through the market and says hi"}</p>
              <p className="text-[9px] text-foreground/90 leading-relaxed">A girl with <span className="px-1 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[8px]">&lt;Picture 1&gt;</span> walks through the evening market, string lights… She says: <span className="px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[8px] font-mono">&lt;d&gt;Hi there!&lt;/d&gt;</span> Smooth pan, warm light.</p>
            </div>
          </Hl>
          <Hl n={2}>
            <div className="rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 p-2 flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                <span className="text-[7px] text-purple-300 font-bold">IMG</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] text-foreground/90 font-mono truncate">photo_girl.png</p>
                <p className="text-[7px] text-muted-foreground">{"visible only to the Assistant - does not appear in generation references"}</p>
              </div>
              <span className="text-[8px] text-muted-foreground shrink-0">✕</span>
            </div>
          </Hl>
          <Hl n={3}>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-border bg-[var(--surface-2)] px-2.5 py-1.5 text-[9px] text-muted-foreground">{"Describe the idea for the scene..."}</div>
              <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300 text-[10px]">➤</div>
            </div>
          </Hl>
          <div className="flex items-center justify-between gap-2">
            <Hl n={4}>
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-[9px] text-violet-300 font-medium text-center">{"✨ Improve the prompt (from the editor)"}</div>
            </Hl>
            <Hl n={5}>
              <div className="rounded-lg border border-border bg-[var(--surface-2)] px-2 py-1.5 flex items-center gap-1.5">
                <span className="text-[8px] text-muted-foreground">{"KV cache:"}</span>
                <span className="px-1 py-0.5 rounded text-[7px] border border-border text-muted-foreground">{"Off"}</span>
                <span className="px-1 py-0.5 rounded text-[7px] border border-border text-muted-foreground">Q8</span>
                <span className="px-1 py-0.5 rounded text-[7px] border border-border text-muted-foreground">Q5</span>
                <span className="px-1 py-0.5 rounded text-[7px] border border-cyan-500/50 bg-cyan-500/15 text-cyan-300 font-medium">Q4</span>
              </div>
            </Hl>
          </div>
        </div>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Local model", text: "Default - Bonsai 2 27B (ternary, ~7.8 GB, vision). Alternatives: Gemma 4 12B (Q3/Q4/Q5) or Qwen3.5 9B. Everything runs on your video card - nothing goes to the cloud. The assistant sees attached pictures and video frames, describes what is on them, and captures the characters in the prompt - MiniMax will not invent other faces." },
      { n: 2, title: "Attachments - only in chat", text: "Pictures and videos attached in the Assistant chat live ONLY in the chat: they do not appear in the list of generation references, in the gallery or in Upscale. Their only purpose is to help the Assistant describe the scene and collect prompts. The picture can be attached with a paperclip or simply pasted using Ctrl+V. For generation, refs are added separately, in the “Generate” tab." },
      { n: 3, title: "Describe your idea in English", text: "The assistant knows the full MiniMax H3 guide, selects the correct tags (<Picture N>, <Video N>, <Audio N>) and issues a ready-made prompt in English. In the header of the full-screen editor there is “Improve prompt” - it will send the current draft to LLM and switch to chat." },
      { n: 4, title: "Video vision", text: "The assistant sees video references: understands what is happening in the frame, how objects move and the scene changes - and not just the first frame. The “Video Vision” flag in Settings → LLM controls this: enabled by default, can be disabled to save memory." },
      { n: 5, title: "Long chat memory - KV cache", text: "Long dialogues “eat up” the memory. KV cache quantization (Settings → LLM: Q8 / Q5 / Q4) significantly reduces chat memory consumption with a loss of quality that is almost imperceptible in replies. By default, Q4 is enabled - the most economical mode; Set “Off” only if you want maximum accuracy and have enough memory." },
    ],
    tip: "The assistant does not invent tags: if there are no references, it does not use <Picture N>; if there is one, it links only existing numbers.",
  },
  {
    id: 'resdur',
    title: "Step 4 - Resolution and Duration",
    short: "480p for samples, 1080p for finals; up to ~30 seconds. In the \"Frames\" mode - from the frame.",
    mock: (
      <Stage>
        <div className="w-[290px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-3">
          <div className="space-y-1.5">
            <MockLabel>{"Resolution"}</MockLabel>
            <Hl n={1}>
              <div className="space-y-1.5">
                <MockSelect value="1280×704 · 720p" />
                <div className="flex gap-1 flex-wrap">
                  {['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].map((a) => (
                    <span key={a} className={a === '16:9' ? 'px-1.5 py-0.5 rounded text-[8px] border border-cyan-500/50 bg-cyan-500/15 text-cyan-300 font-medium' : 'px-1.5 py-0.5 rounded text-[8px] border border-border text-muted-foreground'}>{a}</span>
                  ))}
                </div>
              </div>
            </Hl>
          </div>
          <div className="space-y-1.5">
            <MockLabel>{"Free Resolution"}</MockLabel>
            <Hl n={2}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-1 rounded-md bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[9px] font-medium">{"Free resolution on"}</span>
                  <span className="text-[9px] font-mono text-cyan-300/90">0.70 MP (1280×704)</span>
                </div>
                <MockSlider value={40} max={100} />
                <p className="text-[8px] text-muted-foreground/70">{"Slider: 0.2–3 MP · "}<span className="text-cyan-300/80">{"manual input: up to 16 MP"}</span></p>
              </div>
            </Hl>
          </div>
          <div className="space-y-1.5">
            <MockLabel>{"Duration"}</MockLabel>
            <Hl n={3}>
              <div className="space-y-1">
                <MockSlider value={45} />
                <p className="text-[9px] text-muted-foreground/60">{"60–719 frames · alignment 17n+5 · ≈ 2.5–30 sec · "}<span className="text-cyan-300/80">{"manual frame input"}</span></p>
              </div>
            </Hl>
          </div>
        </div>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Presets and frame format", text: "Final video quality: 480p – fast, 720p – balanced, 1080p – detailed, but longer. The aspect ratio is individually selectable: 16:9, vertical 9:16, square 1:1, 4:3, 3:4 or cinematic 21:9. In the \"Frames\" mode, the aspect ratio is automatically taken from the first frame - the selector is locked so as not to stretch the original." },
      { n: 2, title: "Free resolution + manual input", text: "Turns off presets: set the final size in megapixels - the width and height are calculated from the selected format. The slider goes from 0.2 to 3 MP, and the manual input field allows you to go beyond it - up to 16 MP (above 3 MP - noticeably more VRAM and rendering time)." },
      { n: 3, title: "Duration", text: "From 2.5 to 30 seconds. The model works in fixed “steps” of frames (17n+5), so the slider jumps discretely - this is normal, not a bug. There is also manual input of frames: the value is adjusted to the mesh and boundaries of the model (60–719 frames). Long videos (20-30 sec) take much longer to generate - keep this in mind." },
    ],
    tip: "Make your first tests at 480p and with a short duration - you will see the result faster and select a prompt.",
  },
  {
    id: 'queue',
    title: "Startup and task queue",
    short: "Put several videos in a row - the queue will do everything.",
    mock: (
      <div className="w-full flex flex-col items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <Hl n={1}><MockCtaButton label={"Generate video"} /></Hl>
          <Hl n={2}><MockCtaButton label={"Add to queue"} /></Hl>
        </div>
        <Hl n={3}><MockQueuePill expanded /></Hl>
      </div>
    ),
    callouts: [
      { n: 1, title: "Launch", text: "One button - one task. During generation, the signature changes to “Still in the queue” - this is how they put several videos in a row." },
      { n: 2, title: "Multiple tasks", text: "Tasks are performed in turn: the first is considered, the second is waiting. You can go to the gallery or reload the page - the queue will continue to work." },
      { n: 3, title: "Floating queue (lower right corner)", text: "Statuses, percentages and task counter. Click - list; ✕ for a task - cancellation (the one in progress will stop, the finished files will not be affected)." },
    ],
    tip: "Canceling is not an error: you will see a calm “Generation cancelled” notification, not a red alert.",
  },
  {
    id: 'progress',
    title: "Generation progress",
    short: "Overall progress 0→100% through both passes, live draft frame.",
    mock: (
      <Stage>
        <div className="space-y-2 rounded-lg border border-border bg-[var(--surface-1)] p-3 w-full max-w-[280px]">
          <Hl n={1}>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-cyan-400 font-medium">{"Generation… 42%"}</span>
                <span className="text-muted-foreground font-mono">0:47</span>
              </div>
              <MockBar pct={42} />
            </div>
          </Hl>
          <Hl n={2}>
            <div className="rounded-lg border border-cyan-500/20 bg-black/40 h-20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/60 to-blue-950/40" />
              <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-cyan-300 font-medium">{"Pass 1 step 2/3"}</div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-9 rounded bg-[var(--surface-3)]/60 border border-cyan-500/30 creative-pulse" />
              </div>
            </div>
          </Hl>
          <Hl n={3}>
            <p className="text-[10px] text-red-400/70 text-center py-0.5">{"Stop"}</p>
          </Hl>
        </div>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Status card (bottom of the left panel)", text: "Phase (“Queued” → “Generation… 42%” → “Ready ✓”), timer and progress bar." },
      { n: 2, title: "Live preview and overall progress", text: "A draft frame right during generation - both on the first and second pass. The progress bar shows TOTAL progress (0→100%) across both passes - does not reset between them. The signature “Pass 1 · step 2/3” is the current passage inside." },
      { n: 3, title: "Stop", text: "Interrupts ALL active video tasks; there will be no partial file." },
    ],
    tip: "A video of ~5 seconds at 480p usually takes 1-3 minutes, at 1080p it takes much longer.",
  },
  {
    id: 'gallery',
    title: "Gallery of finished videos",
    short: "All videos: hover playback, Upscale and DLSS 5 tags.",
    mock: (
      <div className="w-full max-w-[330px]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] border border-border text-[9px] text-foreground">{"5 videos"}</span>
          <span className="text-[10px] text-muted-foreground">↻</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Hl n={1}><MockGalleryTile index={5} /></Hl>
          <Hl n={2}><MockGalleryTile hovered index={4} /></Hl>
          <Hl n={3}><MockGalleryTile index={3} /></Hl>
          <Hl n={4}><MockGalleryTile upscaled index={2} /></Hl>
          <MockGalleryTile index={1} />
          <MockGalleryTile index={0} />
        </div>
      </div>
    ),
    callouts: [
      { n: 1, title: "Posters and order", text: "Each video is a card with a poster frame, new ones on top. Hover your cursor and the video will play directly in the grid (without sound)." },
      { n: 2, title: "Hover actions", text: "Six buttons: open in player (⤢), download (⬇), metadata (ⓘ), repeat generation (↻) - will restore all parameters, send to upscale (✦) and delete (🗑)." },
      { n: 3, title: "Time badge", text: "The glowing signature “1 min 12 sec” - how long it took to GENERATE the video (not its length), the number is taken from the metadata." },
      { n: 4, title: "Upscale tags", text: "At the top left of the card there may be a label: “DLSS 5” (pink) - the result of neurorendering, or “Upscale” (blue) - the result of RTX Video Super Resolution. The mark is always visible, not only when hovering, so you won’t confuse the upscaled copy with the original video." },
    ],
    tip: "The ↻ arrow updates the list manually - usually it updates itself.",
  },
  /* (правка 91/122) Папки проектов — организация галереи, в туре не было */
  {
    id: 'folders',
    title: "Project folders - order in the gallery",
    short: "Group videos by project: creation, drag&drop, renaming.",
    mock: (
      <Stage>
        <div className="w-[280px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <MockLabel>{"Gallery · folders"}</MockLabel>
            <span className="text-[9px] text-muted-foreground">{"+ New folder"}</span>
          </div>
          <Hl n={1}>
            <div className="flex gap-1 flex-wrap">
              {["All videos", "Advertising", "Vacation", "Tests"].map((f, i) => (
                <span
                  key={f}
                  className={
                    i === 0
                      ? 'px-2 py-1 rounded-md text-[8px] border border-cyan-500/50 bg-cyan-500/15 text-cyan-300 font-medium'
                      : 'px-2 py-1 rounded-md text-[8px] border border-border text-muted-foreground'
                  }
                >
                  {f}
                </span>
              ))}
            </div>
          </Hl>
          <Hl n={2}>
            <div className="grid grid-cols-3 gap-1.5">
              <MockGalleryTile index={5} />
              <MockGalleryTile index={4} />
              <div className="rounded-md border border-dashed border-cyan-500/40 bg-cyan-500/5 aspect-video flex items-center justify-center">
                <span className="text-[8px] text-cyan-300">{"↔drag the video here"}</span>
              </div>
            </div>
          </Hl>
        </div>
        <Hl n={3}>
          <div className="w-[200px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-foreground">{"Generation tab"}</p>
            <div className="rounded-md border border-border bg-[var(--surface-2)] px-2 py-1.5 text-[9px] text-foreground/80">
              {"\n              📁 Project folder: "}<span className="text-cyan-300">{"Vacation"}</span> ▾
            </div>
            <p className="text-[9px] text-muted-foreground leading-relaxed">{"New videos will be placed in the selected folder"}</p>
          </div>
        </Hl>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Folders in the gallery", text: "The “New Folder” button creates a subfolder in output - group videos by project (“Advertising”, “Vacation”...). Clicking on a folder filters the grid; “All Video” shows everything in a row. An empty folder can be deleted, a non-empty folder can be cleared first." },
      { n: 2, title: "Drag and rename", text: "The video is dragged into the folder drag-and-drop directly from the card. The folder name can be changed - the videos inside will remain in place. Files are not copied, but moved, so metadata and time badges are never lost." },
      { n: 3, title: "Folder on the \"Generate\" tab", text: "Next to the generation button there is a choice of project folder (appears when the folders have already been created): all new videos for this session will go into it. The selection of a folder on the “Generate” tab does not depend on the filter in the “Gallery” - each tab has its own asset." },
    ],
    tip: "Metadata and time badges move with the video—nothing is lost.",
  },
  {
    id: 'player',
    title: "Video player",
    short: "Click on the video - pause, click on the black one - close.",
    mock: (
      <div className="w-full max-w-[320px] space-y-2">
        <Hl n={1}><MockLightbox /></Hl>
        <Hl n={2}>
          <div className="flex items-center justify-center gap-3 text-[9px] text-muted-foreground border border-border rounded-lg py-1.5 bg-[var(--surface-2)]/60">
            <span>{"Space - pause"}</span><span>{"M - sound"}</span><span>{"←→ — video"}</span><span>{"Esc - exit"}</span>
          </div>
        </Hl>
        <Hl n={3}>
          <div className="flex items-center justify-center gap-3 text-[10px]">
            <span className="p-1.5 rounded-lg bg-white/10 text-white">{"⬇ Download"}</span>
            <span className="p-1.5 rounded-lg bg-red-500/40 text-white">{"🗑 Delete"}</span>
          </div>
        </Hl>
      </div>
    ),
    callouts: [
      { n: 1, title: "Full screen player", text: "Opens from the gallery (⤢ or click on the card). Click on the VIDEO ITSELF to pause/play, click on the black area around it to close the player. The bar at the bottom is rewind." },
      { n: 2, title: "Hotkeys", text: "Space - pause, M - sound, arrows ← → - next/previous video, Esc - exit." },
      { n: 3, title: "Download and delete", text: "⬇ saves the file to disk (name starts with Minimax_Studio). The trash bin deletes the video from the output folder after confirmation - the file will also disappear from the disk." },
    ],
    tip: "Sound is also generated: the model voices cues from <d>...</d> and takes into account audio references.",
  },
  {
    id: 'upscale',
    title: "Upscale - make the video clearer",
    short: "Two modes: Neural Rendering (DLSS 5) and RTX VSR 1×–4× (HDR disabled).",
    mock: (
      <Stage>
        <Hl n={1}><MockUpscalePanel /></Hl>
        <Hl n={2}>
          <div className="w-[220px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-2">
            <p className="text-[10px] font-semibold text-foreground">{"The result is in the general gallery"}</p>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-md border border-border bg-[var(--surface-2)]/70 p-1.5 space-y-1">
                <span className="inline-flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[7px] font-semibold text-sky-300 border border-sky-400/40">✦ Upscale</span>
                <p className="text-[7px] text-muted-foreground">RTX VSR</p>
              </div>
              <div className="rounded-md border border-border bg-[var(--surface-2)]/70 p-1.5 space-y-1">
                <span className="inline-flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[7px] font-semibold text-fuchsia-300 border border-fuchsia-400/40">✦ DLSS 5</span>
                <p className="text-[7px] text-muted-foreground">Neural Rendering</p>
              </div>
            </div>
          </div>
        </Hl>
        <Hl n={3}>
          <div className="w-[180px] rounded-lg border border-violet-500/25 bg-[var(--surface-1)] p-2.5 space-y-1">
            <p className="text-[10px] font-semibold text-foreground">{"Requirements"}</p>
            <p className="text-[9px] text-muted-foreground">{"• NVIDIA RTX video card"}</p>
            <p className="text-[9px] text-muted-foreground">{"• video only (MP4 / MOV / MKV…)"}</p>
            <p className="text-[9px] text-muted-foreground">{"• processing - on your GPU"}</p>
          </div>
        </Hl>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Two processing modes", text: "Neural Rendering (DLSS 5) - the neural network “redraws” the frame: noise, tone, structure are adjusted and a preset is selected - the quality increases, but the speed decreases. RTX Video Super Resolution - 1x-4x acceleration (including 1.5x; HDR disabled - H.264 does not support HDR output) - faster and lighter on the GPU. The mode is selected directly on the tab, the start button changes to suit it." },
      { n: 2, title: "Where does the result go?", text: "The upscale video is saved to the general “Gallery” along with other videos and receives the label: “Upscale” (blue) - RTX VSR or “DLSS 5” (pink) - Neural Rendering. The mark is always visible on the card - the original and the improved copy cannot be confused." },
      { n: 3, title: "Requirements", text: "Requires NVIDIA RTX graphics card; Only video files (MP4 / MOV / MKV, etc.) are processed. Everything is calculated locally, on your GPU - the file is not sent anywhere." },
    ],
    tip: "If you're not sure which mode to choose, start with RTX VSR 2x: it's fastest and usually good enough for grain and blur.",
  },
  {
    id: 'meta',
    title: "Metadata - video recipe",
    short: "Prompt + seed = exact repetition of a successful video.",
    mock: (
      <Stage>
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <Hl n={1}><MockMetaDialog /></Hl>
          <Hl n={2}>
            <div className="w-[120px] aspect-video rounded-lg border border-border bg-[var(--surface-2)] relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-900/30 to-cyan-900/20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="p-1.5 rounded-lg bg-white/20 text-[10px] text-white">ⓘ</span>
              </div>
            </div>
          </Hl>
        </div>
        <Hl n={3}>
          <div className="flex items-center gap-2 justify-center rounded-lg border border-border bg-[var(--surface-2)]/60 px-4 py-1.5 text-[10px] text-muted-foreground">
            {"\n            📋 Copy prompt and seed → repeat generation\n          "}</div>
        </Hl>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "What's inside", text: "Prompt, seed, resolution, steps (pass 1 + pass 2), references and their roles, generation time and date - the complete recipe for HOW the video was received." },
      { n: 2, title: "How to open", text: "Button ⓘ on a card in the gallery (on hover)." },
      { n: 3, title: "Repeat result", text: "Did you like it? Copy the prompt and seed from the metadata and set the same parameters - the generation will be reproduced almost identically." },
    ],
    tip: "The metadata is located next to the video in the file <name>.meta.json - when moving the folder, copy it too.",
  },
  /* ═══════════════ ЧАСТЬ 3. ГЛУБЖЕ ═══════════════ */
  {
    id: 'advanced',
    title: "Additional generation options",
    short: "Two passes, steps (2–30, manual up to 128), seed. You can safely skip it.",
    mock: (
      <Stage>
        <div className="w-[300px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-2.5">
          <p className="text-[10px] text-muted-foreground">{"▼ Additional options"}</p>
          <Hl n={1}>
            <div className="space-y-2">
              <div className="space-y-1">
                <MockLabel>Pass 1: Low-res (MP)</MockLabel>
                <MockSlider value={20} max={200} />
                <p className="text-[8px] text-muted-foreground/70">{"slider 0.2–0.5 MP · "}<span className="text-cyan-300/80">{"no more than final resolution"}</span></p>
              </div>
              <div className="space-y-1">
                <MockLabel>{"Pass 1: Sampler Steps"}</MockLabel>
                <MockSlider value={13} max={100} />
                <p className="text-[8px] text-muted-foreground/70">{"slider 2–30 default 4 "}<span className="text-cyan-300/80">{"manual input: 1–128"}</span></p>
              </div>
              <div className="space-y-1">
                <MockLabel>{"Pass 1: Sampler/Scheduler Refs"}</MockLabel>
                <MockSelect value={"euler · simple · Match (fast)"} />
              </div>
              <div className="space-y-1">
                <MockLabel>{"Pass 2: Sigma profile (steps)"}</MockLabel>
                <MockSelect value={"3 steps (faster) 4–7 – quality"} />
              </div>
            </div>
          </Hl>
          <Hl n={2}>
            <div className="space-y-1.5">
              <MockToggle on label="Low VRAM Attention" />
              <p className="text-[8px] text-muted-foreground/70 -mt-0.5">{"and Chunk FeedForward - in Settings → Optimization"}</p>
            </div>
          </Hl>
          <Hl n={3}>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <MockLabel>Seed</MockLabel>
                <span className="text-[10px] font-mono text-muted-foreground">{"-1 (random)"}</span>
              </div>
              <p className="text-[8px] text-muted-foreground/70">{"The strength of the turbo lora is adjusted in Settings → General → LoRAs"}</p>
            </div>
          </Hl>
        </div>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Two passes + manual entry", text: "First, Pass 1 is a cheap low-resolution draft (0.2–0.5 MP; the ceiling is automatically no higher than the final resolution - the draft is never larger than the final). Then Pass 2 is the final quality improvement (Sigma profile 3–7 steps, default 3). Pass 1 steps: slider 2-30, default 4, manual input 1-128. The default sampler and scheduler for both passes is euler/simple, references have a Match/Max size mode. More steps - more accurate and longer." },
      { n: 2, title: "Memory optimizations", text: "Low VRAM Attention and Chunk FeedForward save video memory - they are in Settings → Optimization, and not in the generation form. If generation drops due to insufficient VRAM, leave them enabled or lower the resolution." },
      { n: 3, title: 'Seed', text: "“Grain” of randomness: -1 = new every time. If you liked the result, take the seed from the metadata and repeat with it." },
    ],
    tip: "A beginner does not need to open this block - the default values are selected for a quick start.",
  },
  {
    id: 'lora',
    title: "LoRA models - style and speed",
    short: "Turbo lora (4 steps), custom LoRA: strength 0.1–2.0, triggers.",
    mock: (
      <Stage>
        <Hl n={1}><MockLoraList /></Hl>
        <Hl n={2}>
          <div className="w-[200px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-foreground">{"Why LoRA"}</p>
            <p className="text-[9px] text-muted-foreground leading-relaxed">{"LoRA is an “add-on” to the main model: it adds a style, character or operating mode (turbo)."}</p>
            <p className="text-[9px] text-foreground/80">{"Strength 0.1–2.0 · triggers are inserted into prompts automatically"}</p>
          </div>
        </Hl>
        <Hl n={3}>
          <div className="w-[190px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-foreground">{"Where do they live?"}</p>
            <p className="text-[9px] text-muted-foreground">{"Settings → General → LoRAs"}</p>
            <p className="text-[9px] text-muted-foreground">{"The file is copied to the program's LoRA folder"}</p>
            <p className="text-[9px] text-muted-foreground">{"Copy progress is visible in the list"}</p>
          </div>
        </Hl>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "List of LoRAs", text: "The first line is the built-in turbo lora (Turbo badge, 1.5 GB): speeds up generation, works in conjunction with 4 steps pass 1. Each LoRA: on/off switch and strength slider 0.1–2.0. Custom LoRAs additionally have a trigger words field - when LoRA is enabled, they are automatically added to the prompt." },
      { n: 2, title: "Why LoRA", text: "LoRA is a small “add-on” on top of the main model: it can add a style, character, item or mode of operation (like turbo). The strength is adjusted with a slider: 0.1 - barely noticeable, 2.0 - most pronounced. Turbo lore has no triggers - it does not affect prompts." },
      { n: 3, title: "Add your LoRA", text: "“Add” button (Settings → General → LoRAs): select a file - it is copied to the LoRA folder of the program, the copying progress is visible in the list. You can close the settings window at any time - copying will continue in the background." },
    ],
    tip: "If LoRA works, but the picture “falls apart”, there is probably an incompatibility with the base model: switch the base model to an alternative one (Settings → General).",
  },
  /* ═══════════════ ЧАСТЬ 4. НАСТРОЙКИ ═══════════════ */
  {
    id: 'settings-general',
    title: "Settings → General and Appearance",
    short: "Models, transfer, main model + theme and sound.",
    mock: (
      <Stage>
        <Hl n={1}><MockSettingsGeneral /></Hl>
        <Hl n={2}><MockSettingsAppearance /></Hl>
        <Hl n={3}>
          <div className="w-[210px] rounded-lg border border-border bg-[var(--surface-1)] p-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-foreground">{"List of settings tabs"}</p>
            <p className="text-[9px] text-muted-foreground">{"General · Appearance · LLM · Voice"}</p>
            <p className="text-[9px] text-muted-foreground">{"Optimization · ComfyUI · Links · Reset"}</p>
          </div>
        </Hl>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Models and transfer", text: "“Transfer models from the old version” - select the folder with the old build, the program itself will find the models folder and transfer the contents. “Main model” is the basic one (MiniMax H3 FastVideo int8), and next to it is a switch for an alternative model from the diffusion_models folder: useful if with LoRA the basic model “falls apart” the picture. Downloading models (and copying LoRA) is not interrupted by closing the settings window. Bonsai light (small version) - optional, does not require a banner." },
      { n: 2, title: "Appearance", text: "Separate tab: design theme - Gray (default) or Black - and a sound signal when generation is complete (can be turned off)." },
      { n: 3, title: "Eight tabs", text: "Full list: General, Appearance, LLM, Voice, Optimization, ComfyUI, Links, Reset. Each has its own tool: from models to the danger zone." },
    ],
    tip: "If LoRA works, but the picture falls apart, there is probably an incompatibility with the base model: switch the base model to an alternative one.",
  },
  {
    id: 'settings-llm-voice',
    title: "Settings → LLM and Voice",
    short: "Assistant model, context, KV cache + voice dictation.",
    mock: (
      <Stage>
        <Hl n={1}><MockSettingsLlm /></Hl>
        <Hl n={2}><MockSettingsVoice /></Hl>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Assistant and memory", text: "Assistant model: default Bonsai 2 27B (ternary, ~7.8 GB, vision). Alternatives: Gemma 4 12B (Q3/Q4/Q5) or Qwen3.5 9B - choose according to your video card. Device: Auto / GPU / CPU. Context: 8K–100K tokens, default 25K. “Video vision” is ENABLED by default—the assistant sees video frames; can be turned off to save context. KV cache quantization (Off / Q8 / Q5 / Q4) - saves memory for long dialogs, default Q4." },
      { n: 2, title: "Voice input", text: "Whisper recognition works on the CPU and does not touch video memory. On/off, recognition model (small/medium - better for Russian), language. Live test: recording → recognized text. The microphone button appears in the prompt field, full-screen editor, and Assistant chat. Hotkey: R (English) / K (Russian) - one physical key in both layouts; You can start and stop dictation with a key without touching the mouse. Does not work while typing in fields (so as not to break the R/K input) and with Ctrl/Alt/Meta held down." },
    ],
    tip: "If generation lags on 8–12 GB VRAM, leave Bonsai 2 27B (~7.8 GB) or install Qwen3.5 9B / Gemma Q3 and increase the VRAM reserve (Optimization tab).",
  },
  {
    id: 'settings-opt-comfy',
    title: "Settings → Optimization, ComfyUI, Links, Reset",
    short: "VRAM, diagnostics, manual downloads and the danger zone.",
    mock: (
      <Stage>
        <Hl n={1}><MockSettingsOpt /></Hl>
        <Hl n={2}><MockSettingsComfyLinks /></Hl>
        <Hl n={3}><MockSettingsDanger /></Hl>
      </Stage>
    ),
    callouts: [
      { n: 1, title: "Memory optimization", text: "Reserve VRAM (1–8 GB, default 3) and Dynamic VRAM manage ComfyUI video memory - applied after restarting ComfyUI. Low VRAM Attention and Chunk FeedForward save memory right during generation - they act immediately on new generations, without restarting. If generation drops due to insufficient VRAM, enable both and/or lower the resolution." },
      { n: 2, title: "ComfyUI and Links", text: "ComfyUI tab: status, version, Python, video card, free VRAM - “Recheck” button. Links tab: direct URLs to each model for manual download (one-click copying) + hint about the hf-mirror.com mirror if Hugging Face is not available." },
      { n: 3, title: "Reset (danger zone)", text: "“Reset settings” - return all parameters to default values. “Clear cache” - ComfyUI input folder (references and temporary files). “Delete content” - output folder with all videos + assistant chats + history of prompts. Every action requires confirmation." },
    ],
    tip: "After “Reset settings”, the assistant should be given the full context - the default 25K tokens are enough for instructions.",
  },
  /* ═══════════════ ФИНАЛ ═══════════════ */
  {
    id: 'checklist',
    title: "First generation checklist",
    short: "Seven points from scratch - and the first video is ready.",
    mock: (
      <div className="w-full max-w-[400px] space-y-3">
        <Hl n={1}>
          <div className="rounded-xl border border-cyan-500/20 bg-[var(--surface-2)]/60 p-4 space-y-2.5 w-full">
            {[
              "Download the models (welcome window → Settings → download; downloading in the background)",
              "Select mode: Text / Stills / References",
              "Upload references (if the mode is “References”) - or immediately without them",
              "Describe the scene in a prompt - text, voice (🎙) or through the Assistant (Bonsai 2 27B)",
              "Link references via @, replicas - in <d>...</d>",
              "Set it to 480p and short duration",
              "Click \"Generate Video\" and watch the preview",
              "Done: look in the gallery, recipe - under ⓘ, more clearly - “Upscale” (DLSS 5 / RTX VSR)",
            ].map((t, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-xs text-foreground/90">{t}</span>
              </div>
            ))}
          </div>
        </Hl>
        <Hl n={2}>
          <div className="flex items-center gap-2 justify-center rounded-lg border border-border bg-[var(--surface-2)]/60 px-4 py-2 text-[10px] text-muted-foreground">
            {"\n            ▶ If something is wrong, restart start.bat\n          "}</div>
        </Hl>
      </div>
    ),
    callouts: [
      { n: 1, title: "Congratulations — you have completed the tour!", text: "Make the first generation using the checklist, and look in the metadata to see which settings affect what. You can return to the tour at any time through the “Learn” tab." },
      { n: 2, title: "If something went wrong", text: "Red ComfyUI indicator or generation error → restart start.bat. “ComfyUI is unavailable” during generation - it usually goes away on its own, do not interrupt. If you don’t like the result, change the seed (put -1) or ask the Assistant to rewrite the prompt." },
    ],
  },
]
