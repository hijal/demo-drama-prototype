<script lang="ts">
  import { onMount } from "svelte";
  import Modal from "./Modal.svelte";
  import MentionTextarea, { type MentionItem } from "./MentionTextarea.svelte";
  import PromptEditor from "./PromptEditor.svelte";
  import PromptQuality from "./PromptQuality.svelte";
  import Select from "./Select.svelte";
  import SettingSlider from "./SettingSlider.svelte";
  import References from "./References.svelte";
  import GenerationStatus from "./GenerationStatus.svelte";
  import {
    Sparkles,
    History,
    PencilLine,
    SlidersHorizontal,
    ChevronDown,
    Dices,
    Folder,
    Film,
    Star,
    X,
  } from "lucide-svelte";
  import Gallery from "./Gallery.svelte";
  import { readable } from "../lib/store";
  import {
    useGenStore,
    type VideoRefItem,
    type VideoGenState,
  } from "@/lib/gen-store";
  import { useGenProgress } from "@/lib/gen-progress-store";
  import { usePromptHistory } from "@/lib/prompt-history-store";
  import { uploadInputFile } from "@/lib/upload";
  import {
    VALID_KSAMPLERS,
    PASS1_SCHEDULERS,
    flfNominalDimensions,
  } from "@/lib/comfy/minimax-h3-template";
  import {
    buildPresets,
    parseResolution,
    resolveResolution,
    alignFrames,
    type ModelOptions,
  } from "@/lib/video-controls";
  import {
    computeOutputDimensions,
    type createVideoGeneration,
  } from "@/lib/video-generation";
  import { EXAMPLES, CAMERA_WORDS } from "@/lib/prompt-examples";
  import { api, inputUrl, message } from "../lib/api";
  import { gallery } from "../lib/gallery";
  import { toast } from "@/lib/notifications";
  let {
    controller,
    enabled = true,
    visible = true,
  }: {
    controller?: ReturnType<typeof createVideoGeneration>;
    enabled?: boolean;
    visible?: boolean;
  } = $props();
  const store = readable(useGenStore),
    progress = readable(useGenProgress),
    history = readable(usePromptHistory);
  const v = $derived($store.video);
  const generation = $derived($progress.video);
  const patch = (value: Partial<VideoGenState>) =>
    useGenStore.getState().patchVideo(value);
  let options = $state<ModelOptions | null>(null);
  let uploading = $state(false);
  let editor = $state(false);
  let showHistory = $state(false);
  const presets = $derived(buildPresets(options, true));
  const minFrames = $derived(options?.frames_minimum ?? 60);
  const maxFrames = $derived(options?.frames_maximum ?? 719);
  const frameStep = $derived(options?.frames_steps ?? 17);
  const active = $derived(
    ["submitting", "queued", "running"].includes(generation.phase),
  );
  const dimensions = $derived(
    v.targetDimensions
      ? `${v.targetDimensions.width} × ${v.targetDimensions.height}`
      : v.freeResolution
        ? (() => {
            const [w, h] = v.resolution.split("x").map(Number);
            const d = computeOutputDimensions(
              v.mode === "flf" && v.startFrame?.width && v.startFrame.height
                ? `${v.startFrame.width}:${v.startFrame.height}`
                : `${w}:${h}`,
              v.finalResolution || 0.7,
            );
            return `${d.w} × ${d.h}`;
          })()
        : v.mode === "flf" && v.startFrame?.width && v.startFrame.height
          ? (() => {
              const short = Math.min(...v.resolution.split("x").map(Number));
              const d = flfNominalDimensions(
                short,
                v.startFrame!.width!,
                v.startFrame!.height!,
              );
              return `${d.w} × ${d.h}`;
            })()
          : v.resolution.replace("x", " × "),
  );
  onMount(() => {
    if (!enabled) return;
    let disposed = false;
    api<ModelOptions>("/api/comfy/model-options?model_type=minimax_h3_ref2va")
      .then((d) => {
        if (!disposed) options = d;
      })
      .catch(() => {});
    return () => (disposed = true);
  });
  let mentionBox = $state<ReturnType<typeof MentionTextarea>>();
  /* Trigger numbering runs separately per reference type (Picture N / Video N / Audio N). */
  const mentions = $derived.by((): MentionItem[] => {
    const counters = { image: 0, video: 0, audio: 0 };
    return v.refs.map((ref) => {
      const tag = ref.kind === "image" ? "Picture" : ref.kind === "video" ? "Video" : "Audio";
      counters[ref.kind] += 1;
      return {
        id: ref.id,
        label: ref.name,
        trigger: `<${tag} ${counters[ref.kind]}>`,
        kind: ref.kind,
        color:
          ref.kind === "image"
            ? "bg-purple-500/15 text-purple-400"
            : ref.kind === "video"
              ? "bg-cyan-500/15 text-cyan-400"
              : "bg-emerald-500/15 text-emerald-400",
        previewUrl: ref.previewUrl || (ref.path ? inputUrl(ref.path) : undefined),
      };
    });
  });
  function changePrompt(text: string) {
    useGenStore.getState().setVideoPrompt(text);
  }
  /* References' tag chips insert at the prompt caret, like the Next.js mention box. */
  function insertMention(text: string) {
    mentionBox?.insertAtCursor(text);
  }
  const tagFor = (ref: VideoRefItem) =>
    `<${{ image: "Picture", video: "Video", audio: "Audio" }[ref.kind]} ${v.refs.filter((r) => r.kind === ref.kind).findIndex((r) => r.id === ref.id) + 1}>`;

  async function upload(
    files: FileList | File[] | null,
    slot?: "start" | "end",
  ) {
    if (!files?.length || uploading) return;
    uploading = true;
    try {
      for (const file of Array.from(files)) {
        const mime =
          file.type ||
          (/\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name)
            ? "image/"
            : /\.(avi|m4v|mkv|mov|mp4|webm)$/i.test(file.name)
              ? "video/"
              : /\.(aac|flac|m4a|mp3|ogg|wav)$/i.test(file.name)
                ? "audio/"
                : "");
        const kind = mime.startsWith("image/")
          ? "image"
          : mime.startsWith("video/")
            ? "video"
            : mime.startsWith("audio/")
              ? "audio"
              : null;
        if (!kind || (slot && kind !== "image"))
          throw new Error(
            slot
              ? "Choose an image for the frame."
              : "Choose an image, video or audio file.",
          );
        if (!slot) {
          if (v.mode !== "ref" && kind !== "audio")
            throw new Error(
              "Use audio references in Text/Frames mode; upload images into the frame slots.",
            );
          const limits = options?.omni_reference_limits ?? {
            image: 9,
            video: 3,
            audio: 3,
            total: 15,
          };
          if (
            v.refs.filter((r) => r.kind === kind).length >= limits[kind] ||
            v.refs.length >= limits.total
          )
            throw new Error("Reference limit reached.");
        }
        const result = await uploadInputFile(file);
        const previewUrl = URL.createObjectURL(file);
        if (slot) {
          let width: number | undefined, height: number | undefined;
          try {
            const bitmap = await createImageBitmap(file);
            width = bitmap.width;
            height = bitmap.height;
            bitmap.close();
          } catch {
            URL.revokeObjectURL(previewUrl);
            throw new Error("Could not read frame dimensions.");
          }
          const frame = {
            path: result.path,
            name: file.name,
            previewUrl,
            width,
            height,
          };
          if (slot === "start")
            useGenStore.getState().setVideoStartFrame(frame);
          else useGenStore.getState().setVideoEndFrame(frame);
          break;
        } else
          useGenStore.getState().addVideoRefs([
            {
              id: crypto.randomUUID(),
              kind,
              path: result.path,
              name: file.name,
              previewUrl,
              role: "",
              imageIntent: "identity",
              audioIntent: "voice",
              includeAudio: false,
            },
          ]);
        if (result.staged)
          toast.info(
            "Reference saved locally; it will transfer when ComfyUI is available.",
          );
      }
    } catch (e) {
      toast.error(message(e));
    } finally {
      uploading = false;
    }
  }
  async function generate() {
    if (!controller || uploading) return;
    const current = useGenStore.getState().video;
    if (!current.prompt.trim()) {
      toast.error("Enter video description");
      return;
    }
    if (current.mode === "flf" && !current.startFrame) {
      toast.error("In Frames mode, the first frame is required.");
      return;
    }
    let prompt = current.prompt.trim();
    if (current.mode !== "ref") {
      const cleaned = prompt
        .replace(/<\/?(?:Picture|Video|Subject)\s*\d+\s*>/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (cleaned !== prompt)
        toast.warning("Unsupported reference tags removed for this mode.");
      prompt = cleaned;
    }
    if (!prompt) {
      toast.error("Prompt is empty after clearing tags");
      return;
    }
    usePromptHistory.getState().add(prompt);
    await controller.generate({
      ...current,
      modelType: current.modelType,
      prompt,
      targetDimensions:
        current.mode === "flf"
          ? (current.targetDimensions ?? undefined)
          : undefined,
      firstFrame: current.mode === "flf" ? current.startFrame?.path : undefined,
      lastFrame: current.mode === "flf" ? current.endFrame?.path : undefined,
      firstFrameWidth: current.startFrame?.width,
      firstFrameHeight: current.startFrame?.height,
      references: current.refs.filter(
        (r) => current.mode === "ref" || r.kind === "audio",
      ),
      finalResolution: current.freeResolution
        ? current.finalResolution || 0.7
        : undefined,
      outputSubfolder: current.outputFolder || "",
    });
  }

  let advanced = $state(false),
    pass1 = $state(false),
    pass2 = $state(false),
    examples = $state(false),
    folderMenu = $state(false);
  const resolution = $derived(parseResolution(v.resolution, presets));
  const qualities = $derived(Object.keys(presets));
  const aspects = $derived(
    Object.keys(presets[resolution.quality] || presets[qualities[0]] || {}),
  );
  /* Sampler/scheduler labels for both passes (same order as VALID_KSAMPLERS / PASS1_SCHEDULERS). */
  const SAMPLER_OPTIONS = [
    { value: "euler", label: "euler (default, classic)" },
    { value: "er_sde", label: "er_sde (SDE)" },
    { value: "dpmpp_2m", label: "dpmpp_2m (multistep)" },
    { value: "dpmpp_3m_sde", label: "dpmpp_3m_sde (high quality)" },
    { value: "heun", label: "heun (2nd order)" },
    { value: "lcm", label: "lcm (few steps)" },
    { value: "res_multistep", label: "res_multistep (residual)" },
  ];
  const SCHEDULER_OPTIONS = [
    { value: "simple", label: "simple (default)" },
    ...["sgm_uniform", "karras", "exponential", "ddim_uniform", "normal", "beta", "linear_quadratic", "kl_optimal"].map((value) => ({ value, label: value })),
  ];
  const SIGMA_OPTIONS = [
    { value: "3step", label: "3 steps (faster)" },
    { value: "4step", label: "4 steps (balance)" },
    { value: "5step", label: "5 steps (high)" },
    { value: "6step", label: "6 steps (very high)" },
    { value: "7step", label: "7 steps (max)" },
  ];
  const freeDims = $derived(computeOutputDimensions(resolution.aspect, v.finalResolution > 0 ? v.finalResolution : 0.7));
  /* Pass 1 cannot be greater than the final resolution. */
  const maxLowRes = $derived(Math.min(0.5, v.finalResolution > 0 ? v.finalResolution : 0.7));
  const BADGE =
    "inline-flex items-center justify-center rounded-md border px-2 py-0.5 font-medium w-fit whitespace-nowrap shrink-0 gap-1 overflow-hidden";
  const BADGE_SECONDARY = "border-transparent bg-secondary text-secondary-foreground";
  let historyAnchor = $state<HTMLElement>(),
    examplesAnchor = $state<HTMLElement>();
  /** Position a dropdown under its anchor button (clamped to viewport). */
  function dropdownPos(anchor: HTMLElement) {
    const r = anchor.getBoundingClientRect();
    const width = 340;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const top = Math.min(r.bottom + 6, window.innerHeight - 80);
    return `top:${top}px;left:${left}px;width:${width}px`;
  }
  function applyExample(text: string) {
    const old = v.prompt;
    changePrompt(text);
    examples = false;
    if (old.trim())
      toast.success("Example inserted (previous prompt replaced)", {
        action: { label: "Cancel", onClick: () => changePrompt(old) },
      });
  }
  function setQuality(quality: string) {
    useGenStore
      .getState()
      .setVideoResolution(
        resolveResolution(quality, resolution.aspect, presets),
      );
  }
  function setAspect(aspect: string) {
    useGenStore
      .getState()
      .setVideoResolution(
        resolveResolution(resolution.quality, aspect, presets),
      );
  }
  function toggleFree() {
    const next = !v.freeResolution;
    const [w, h] = v.resolution.split("x").map(Number);
    patch({
      freeResolution: next,
      finalResolution: next
        ? v.finalResolution > 0
          ? v.finalResolution
          : Math.round((w * h) / 1e4) / 100
        : 0,
      targetDimensions: null,
    });
  }
  function length(raw: string) {
    const n = Number(raw);
    if (Number.isFinite(n))
      patch({ videoLength: alignFrames(n, minFrames, maxFrames, frameStep) });
  }
</script>

<svelte:window
  onclick={(e) => {
    if (
      !(e.target as Element).closest('[aria-label="Prompt history"],button')
    ) {
      showHistory = false;
      examples = false;
      folderMenu = false;
    }
  }}
  onkeydown={(e) => {
    if (!visible) return;
    if (e.key === "Escape") {
      showHistory = false;
      examples = false;
      folderMenu = false;
    }
  }}
  onpaste={(e) => {
    if (!visible || !enabled) return;
    if (!e.defaultPrevented && e.clipboardData?.files.length) {
      e.preventDefault();
      void upload(e.clipboardData.files);
    }
  }}
/>
<div class="flex-1 flex min-h-0">
  <div
    data-parameters-panel
    class="w-[400px] shrink-0 border-r border-border flex flex-col bg-[var(--surface-0)]"
  >
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-foreground">Parameters</h2>
        <span
          class="inline-flex items-center rounded-md border px-2 py-0.5 font-medium text-[10px] bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
          >MiniMax H3</span
        >
      </div>
      <div class="h-px w-full shrink-0 bg-border opacity-50"></div>
      <div class="space-y-1.5">
        <span
          class="flex items-center text-xs leading-none font-medium text-muted-foreground"
          >Generation mode</span
        >
        <div class="grid grid-cols-3 gap-1.5" aria-label="Generation mode">
          {#each [{ id: "t2v", label: "Text" }, { id: "flf", label: "Frames" }, { id: "ref", label: "References" }] as mode}<button
              onclick={() => patch({ mode: mode.id as VideoGenState["mode"] })}
              class="h-8 rounded-md border text-xs font-medium transition-all {v.mode ===
              mode.id
                ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                : 'bg-[var(--surface-2)] border-border text-muted-foreground hover:border-cyan-500/30'}"
              >{mode.label}</button
            >{/each}
        </div>
        {#if v.mode === "t2v"}<p class="text-[10px] text-muted-foreground/60">
            Pure text-to-video model path (t2va). Audio references below are
            used for voice and voiceover.
          </p>{:else if v.mode === "flf"}<p
            class="text-[10px] text-muted-foreground/60"
          >
            The video is built from the first frame to the last (fl2va). The
            prompt describes the transition between them.
          </p>{/if}
      </div>
      <div class="h-px w-full shrink-0 bg-border opacity-50"></div>
      <div class="space-y-2.5">
        <div class="grid grid-cols-2 gap-2">
          <div class="space-y-1.5">
            <label
              for="quality"
              class="flex items-center text-xs leading-none font-medium text-muted-foreground"
              >Resolution</label
            >
            <Select
              id="quality"
              label="Resolution quality"
              value={resolution.quality}
              options={qualities}
              disabled={v.freeResolution}
              onchange={setQuality}
            />
          </div>
          <div class="space-y-1.5">
            <label
              for="aspect"
              class="flex items-center text-xs leading-none font-medium text-muted-foreground"
              >Aspect ratio</label
            >
            <Select
              id="aspect"
              label="Aspect ratio"
              value={resolution.aspect}
              options={aspects}
              disabled={v.mode === "flf"}
              onchange={setAspect}
            />
          </div>
        </div>
        {#if v.mode !== "flf"}<button
            onclick={toggleFree}
            aria-pressed={v.freeResolution}
            class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all {v.freeResolution
              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20'
              : 'bg-[var(--surface-2)] border-border text-muted-foreground hover:border-cyan-500/40 hover:text-foreground'}"
            ><SlidersHorizontal class="h-3.5 w-3.5 shrink-0" /><span
              class="truncate">Free Resolution</span
            >{#if v.freeResolution}<span
                class="ml-auto text-[10px] font-mono text-cyan-300/90"
                >{(v.finalResolution || 0.7).toFixed(2)} MP ({dimensions})</span
              >{/if}</button
          >{#if v.freeResolution}<div class="overflow-hidden">
              <div class="space-y-1 px-1">
                <SettingSlider
                  label="Resolution (MP)"
                  value={v.finalResolution > 0 ? v.finalResolution : 0.7}
                  onchange={(n) =>
                    patch({ finalResolution: Math.round(n * 100) / 100, targetDimensions: null })}
                  min={0.2}
                  max={3.0}
                  step={0.05}
                  formatValue={(n) => {
                    const d = computeOutputDimensions(resolution.aspect, n);
                    return `${n.toFixed(2)} MP (${d.w}×${d.h})`;
                  }}
                  inputMin={0.2}
                  inputMax={16}
                  inputHint="0.2–16 MP. Above 3 MP - noticeably more VRAM and rendering time"
                />
                <p class="text-[10px] text-muted-foreground/60">
                  Free size. Final Resolution {freeDims.w}×{freeDims.h} with the ratio {resolution.aspect}.
                  <span title="Manual input allows you to go beyond the slider range (0.2–3 MP) - up to 16 MP"
                    >manual input: up to 16 MP</span
                  >
                </p>
              </div>
            </div>{/if}{/if}
      </div>
      <div class="space-y-1.5">
        <div
          class="text-xs text-muted-foreground flex items-center justify-between gap-2"
        >
          <label for="duration">Duration</label><span
            class="flex items-center gap-1.5"
            ><input
              class="h-6 w-16 rounded-md border border-border bg-[var(--surface-2)] px-1.5 text-right font-mono text-xs tabular-nums text-foreground/80 focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
              type="text"
              inputmode="numeric"
              aria-label={`Duration: manual input (${minFrames}–${maxFrames} frames)`}
              title={`Frames: ${minFrames}–${maxFrames} (grid 17n+5, 24 fps)`}
              value={v.videoLength}
              onfocus={(e) => {
                const el = e.currentTarget;
                requestAnimationFrame(() => el.select());
              }}
              onkeydown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  length(e.currentTarget.value);
                } else if (e.key === "Escape") {
                  e.currentTarget.value = String(v.videoLength);
                  e.currentTarget.blur();
                }
              }}
              onchange={(e) => length(e.currentTarget.value)}
            /><span
              class="inline-flex items-center justify-center rounded-md border border-transparent bg-secondary text-secondary-foreground px-2 py-0.5 text-xs font-medium"
              >{(v.videoLength / 24).toFixed(1)} s</span
            ></span
          >
        </div>
        <input
          id="duration"
          type="range"
          class="w-full accent-cyan-500"
          min={minFrames}
          max={maxFrames}
          step={frameStep}
          value={v.videoLength}
          oninput={(e) => length(e.currentTarget.value)}
        />
        <p class="text-[10px] text-muted-foreground/60">
          24 fps · from {(minFrames / 24).toFixed(1)} up to {(maxFrames / 24).toFixed(1)} s · alignment 17n+5 · maximum 30 s
          ·
          <span
            title="A value outside 17n+5 is rounded to the nearest valid point, outside the model boundaries - to the boundary"
            >manual input: {minFrames}–{maxFrames} frame.</span
          >
        </p>
      </div>
      <div class="h-px w-full shrink-0 bg-border opacity-50"></div>
      <References
        video={v}
        {uploading}
        onupload={upload}
        {tagFor}
        {insertMention}
      />
      <div class="h-px w-full shrink-0 bg-border opacity-50"></div>
      <div class="space-y-2">
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-border hover:border-cyan-500/30 transition-all text-left"
          onclick={() => (advanced = !advanced)}
          aria-expanded={advanced}
          ><span class="text-xs font-medium text-muted-foreground"
            >Additional options</span
          ><span
            class="text-[10px] text-muted-foreground transition-transform"
            class:rotate-180={advanced}>▼</span
          ></button
        >
        {#if advanced}<div class="space-y-3 pl-1 overflow-hidden">
            <div class="space-y-2">
              <div
                class="flex items-center gap-2 leading-none font-medium select-none text-xs text-muted-foreground justify-between"
              >
                <label for="seed">Seed</label><button
                  class="p-1 rounded hover:bg-[var(--surface-3)] transition-colors"
                  title="Random seed (-1)"
                  onclick={() => patch({ seed: -1 })}
                  ><Dices class="w-4 h-4 text-muted-foreground" /></button
                >
              </div>
              <input
                id="seed"
                aria-label="Seed"
                type="number"
                class="placeholder:text-muted-foreground border-input flex w-full min-w-0 rounded-md border px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] h-9 bg-[var(--surface-2)] border-border text-sm font-mono"
                value={v.seed}
                oninput={(e) => {
                  const n = e.currentTarget.valueAsNumber;
                  const MAX_SEED = 2 ** 31 - 1;
                  if (!Number.isFinite(n)) {
                    patch({ seed: -1 });
                    return;
                  }
                  patch({ seed: n < 0 ? -1 : Math.min(Math.trunc(n), MAX_SEED) });
                }}
              />
            </div>
            <div class="space-y-1.5">
              <button
                type="button"
                class="w-full flex items-center justify-between px-3 py-1.5 rounded-md bg-[var(--surface-3)] border border-border/60 hover:border-cyan-500/30 transition-all text-left"
                onclick={() => (pass1 = !pass1)}
                ><span class="text-[11px] font-medium text-muted-foreground"
                  >Pass 1 — Low-res</span
                ><span
                  class="text-[9px] text-muted-foreground transition-transform"
                  class:rotate-180={pass1}>▼</span
                ></button
              >{#if pass1}<div class="space-y-3 pl-1 overflow-hidden">
                  <div class="space-y-1">
                    <SettingSlider
                      label="Low-res resolution (MP)"
                      value={typeof v.lowResMP === "number" ? Math.min(v.lowResMP, maxLowRes) : 0.2}
                      onchange={(n) => patch({ lowResMP: Math.min(maxLowRes, Math.round(n * 100) / 100) })}
                      min={0.2}
                      max={maxLowRes}
                      step={0.05}
                      inputMin={0.1}
                      inputMax={maxLowRes}
                      inputHint={`0.1–${maxLowRes.toFixed(2)} MP. Pass 1 - draft, no more than final resolution`}
                    />
                    <p class="text-[10px] text-muted-foreground/60">
                      First pass permission. The lower, the faster.
                      <span title="Pass 1 cannot be greater than the final resolution"
                        >max: {maxLowRes.toFixed(2)} MP</span
                      >
                    </p>
                  </div>
                  <div class="space-y-1">
                    <SettingSlider
                      label="Sampler steps"
                      value={v.firstSamplerSteps ?? 4}
                      onchange={(n) => patch({ firstSamplerSteps: Math.round(n) })}
                      min={2}
                      max={30}
                      step={1}
                      inputMin={1}
                      inputMax={128}
                      inputHint="1–128 steps. Above 30 - generation is noticeably longer"
                    />
                    <p class="text-[10px] text-muted-foreground/60">
                      Number of steps (2–30). More = more accurate, but slower.
                      <span title="Manual input allows you to go beyond the slider range (2–30) - up to 128 steps"
                        >manual input: 1–128</span
                      >
                    </p>
                  </div>
                  <div class="space-y-1">
                    <span class="flex items-center gap-2 leading-none font-medium select-none text-xs text-muted-foreground">Sampler</span>
                    <Select
                      label="Pass 1 sampler"
                      value={v.pass1Sampler || "euler"}
                      options={SAMPLER_OPTIONS}
                      onchange={(value) => patch({ pass1Sampler: value })}
                    />
                  </div>
                  <div class="space-y-1">
                    <span class="flex items-center gap-2 leading-none font-medium select-none text-xs text-muted-foreground">Scheduler</span>
                    <Select
                      label="Pass 1 scheduler"
                      value={v.pass1Scheduler || "simple"}
                      options={SCHEDULER_OPTIONS}
                      onchange={(value) => patch({ pass1Scheduler: value })}
                    />
                  </div>
                  <div class="space-y-1">
                    <span class="flex items-center gap-2 leading-none font-medium select-none text-xs text-muted-foreground">Refs: size mode</span>
                    <div class="grid grid-cols-2 gap-1.5">
                      {#each [{ id: "match", label: "Match (quick)" }, { id: "max", label: "Max (quality)" }] as mode}<button
                          type="button"
                          class="px-2 py-1.5 rounded-md border text-[11px] transition-colors {(v.referenceDetail || 'match') === mode.id
                            ? 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10'
                            : 'border-border text-muted-foreground hover:text-foreground'}"
                          onclick={() => patch({ referenceDetail: mode.id as "match" | "max" })}
                          >{mode.label}</button
                        >{/each}
                    </div>
                    <p class="text-[10px] text-muted-foreground/60">
                      Match: refs for generation area (fast). Max: short sides 2048px (precision, slower).
                    </p>
                  </div>
                </div>{/if}
            </div>
            <div class="space-y-1.5">
              <button
                type="button"
                class="w-full flex items-center justify-between px-3 py-1.5 rounded-md bg-[var(--surface-3)] border border-border/60 hover:border-cyan-500/30 transition-all text-left"
                onclick={() => (pass2 = !pass2)}
                ><span class="text-[11px] font-medium text-muted-foreground"
                  >Pass 2 — High-res</span
                ><span
                  class="text-[9px] text-muted-foreground transition-transform"
                  class:rotate-180={pass2}>▼</span
                ></button
              >{#if pass2}<div class="space-y-3 pl-1 overflow-hidden">
                  <div class="space-y-1">
                    <span class="flex items-center gap-2 leading-none font-medium select-none text-xs text-muted-foreground">Sigma profile (steps)</span>
                    <Select
                      label="Pass 2 sigma profile"
                      value={v.sigmaVariant || "3step"}
                      options={SIGMA_OPTIONS}
                      onchange={(value) => patch({ sigmaVariant: value })}
                    />
                  </div>
                  <div class="space-y-1">
                    <span class="flex items-center gap-2 leading-none font-medium select-none text-xs text-muted-foreground">Sampler</span>
                    <Select
                      label="Pass 2 sampler"
                      value={v.pass2Sampler || "euler"}
                      options={SAMPLER_OPTIONS}
                      onchange={(value) => patch({ pass2Sampler: value })}
                    />
                  </div>
                </div>{/if}
            </div>
          </div>{/if}
      </div>
    </div>
    <div
      class="shrink-0 border-t border-border p-3 bg-[var(--surface-0)]/90 backdrop-blur-sm"
    >
      <GenerationStatus
        phase={generation.phase}
        isGenerating={active}
        progressPercent={generation.progressMax > 0
          ? Math.round((generation.progressValue / generation.progressMax) * 100)
          : 0}
        statusMessage={generation.statusMessage}
        error={generation.error}
        oninterrupt={() => controller?.interrupt()}
        onreset={() => controller?.reset()}
        startedAt={generation.startedAt}
        promptId={generation.promptId}
      />
    </div>
  </div>
  <div class="flex-1 flex flex-col min-w-0 bg-[var(--surface-1)]">
    <div
      class="p-5 pb-3 space-y-3 aurora-bg overflow-hidden flex flex-col shrink-0"
    >
      <div class="space-y-2 flex flex-col">
        <div class="flex items-center justify-between shrink-0">
          <label
            for="prompt"
            class="text-sm font-medium text-foreground flex items-center gap-2"
            ><Sparkles class="w-4 h-4 text-cyan-400" />Video description</label
          ><span class="text-[10px] text-muted-foreground/70 hidden sm:block"
            ><kbd
              class="px-1.5 py-0.5 rounded border border-border bg-[var(--surface-2)] font-mono text-[9px]"
              >Ctrl</kbd
            >
            +
            <kbd
              class="px-1.5 py-0.5 rounded border border-border bg-[var(--surface-2)] font-mono text-[9px]"
              >Enter</kbd
            > - run</span
          >
        </div>
        <div class="relative">
          <MentionTextarea
            bind:this={mentionBox}
            value={v.prompt}
            onchange={changePrompt}
            onkeydown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && v.prompt.trim()) {
                e.preventDefault();
                void generate();
              }
            }}
            placeholder="A girl with <Picture 1> walks through the market from <Video 1> and says: <d>Almost there.</d> …"
            {mentions}
            class="h-[220px]"
          />
          <button
            onclick={() => (editor = true)}
            class="absolute top-2 right-2 p-1.5 rounded-md bg-[var(--surface-3)] hover:bg-[var(--surface-4)] text-muted-foreground hover:text-foreground transition-colors border border-border/50 z-10"
            title="Open prompt editor"
            aria-label="Expand prompt editor"
            ><PencilLine class="w-3.5 h-3.5" /></button
          >
        </div>
        <PromptQuality prompt={v.prompt} refsCount={v.refs.length} />
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            onclick={(e) => {
              historyAnchor = e.currentTarget;
              showHistory = !showHistory;
              examples = false;
            }}
            class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-colors {showHistory
              ? 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10'
              : 'border-border text-muted-foreground hover:text-foreground'}"
          >
            <History class="w-3 h-3" />
            History
            {#if $history.entries.length > 0}<span
                class="ml-0.5 px-1 rounded-full bg-[var(--surface-3)] text-[9px] text-muted-foreground"
                >{$history.entries.length}</span
              >{/if}
          </button>
          <button
            type="button"
            onclick={(e) => {
              examplesAnchor = e.currentTarget;
              examples = !examples;
              showHistory = false;
            }}
            class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-colors {examples
              ? 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10'
              : 'border-border text-muted-foreground hover:text-foreground'}"
          >
            <Sparkles class="w-3 h-3" />
            Examples
          </button>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {#if v.freeResolution}<span class="{BADGE} text-[10px] bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
              >Free · {resolution.aspect} · {(v.finalResolution > 0 ? v.finalResolution : 0.7).toFixed(2)} MP ({freeDims.w}×{freeDims.h})</span
            >{:else}<span class="{BADGE} {BADGE_SECONDARY} text-[10px]">{v.resolution}</span>{/if}
          <span class="{BADGE} {BADGE_SECONDARY} text-[10px]">{(v.videoLength / 24).toFixed(1)} s · 24 fps</span>
          <span class="{BADGE} text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30"
            >2-Pass · {v.finalResolution || "auto"} MP</span
          >
          {#if v.refs.length > 0}<span class="{BADGE} {BADGE_SECONDARY} text-[10px]">{v.refs.length} reference(s)</span>{/if}
        </div>
        {#if $gallery.folders.length > 0}<div class="relative shrink-0">
            <button
              type="button"
              onclick={() => (folderMenu = !folderMenu)}
              class="h-11 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs transition-colors {v.outputFolder
                ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                : 'border-border bg-[var(--surface-2)] text-muted-foreground hover:text-foreground'}"
              title="Project folder: videos are placed in it, the gallery only shows it"
            >
              <Folder class="w-3.5 h-3.5" />
              <span class="max-w-[120px] truncate">{v.outputFolder || "Shared folder"}</span>
              <ChevronDown class="w-3 h-3 transition-transform {folderMenu ? 'rotate-180' : ''}" />
            </button>
            {#if folderMenu}
              <div class="fixed inset-0 z-40" role="presentation" onclick={() => (folderMenu = false)}></div>
              <div
                class="absolute bottom-full mb-1.5 right-0 z-50 w-52 rounded-lg border border-border bg-[var(--surface-2)] shadow-xl p-1 max-h-64 overflow-y-auto"
              >
                <button
                  type="button"
                  onclick={() => {
                    patch({ outputFolder: "" });
                    folderMenu = false;
                  }}
                  class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors {!v.outputFolder
                    ? 'bg-violet-500/10 text-violet-300'
                    : 'hover:bg-[var(--surface-3)] text-foreground/80'}"
                >
                  <Film class="w-3.5 h-3.5 shrink-0" />
                  <span class="flex-1 truncate">Shared folder</span>
                </button>
                {#each $gallery.folders as f (f)}<button
                    type="button"
                    onclick={() => {
                      patch({ outputFolder: f });
                      folderMenu = false;
                    }}
                    class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors {v.outputFolder ===
                    f
                      ? 'bg-violet-500/10 text-violet-300'
                      : 'hover:bg-[var(--surface-3)] text-foreground/80'}"
                  >
                    <Folder class="w-3.5 h-3.5 shrink-0" />
                    <span class="flex-1 truncate">{f}</span>
                  </button>{/each}
              </div>
            {/if}
          </div>{/if}
        <button
          onclick={() => void generate()}
          disabled={!controller || !v.prompt.trim()}
          title={v.prompt.trim() ? "Generate video (Ctrl+Enter)" : "Enter prompt"}
          class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-all disabled:pointer-events-none disabled:opacity-50 outline-none h-11 px-6 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white border-0 text-sm font-semibold shadow-lg shadow-cyan-500/20"
          >{active ? "Add to queue" : "Generate video"}</button
        >
      </div>
    </div>
    <div class="flex-1 overflow-y-auto px-5 pb-5 min-h-0">
      <Gallery embedded folder={v.outputFolder} />
    </div>
  </div>
</div>
<PromptEditor
  bind:open={editor}
  initialText={v.prompt}
  onsave={changePrompt}
  onsaveandrun={controller ? () => void generate() : undefined}
  placeholder="A girl with <Picture 1> walks through the market from <Video 1> and says: <d>Almost there.</d> …"
  {mentions}
/>
{#if showHistory || examples}<div
    class="fixed inset-0 z-[95]"
    role="presentation"
    onclick={() => {
      showHistory = false;
      examples = false;
    }}
  ></div>{/if}
{#if showHistory && historyAnchor}<div
    class="fixed z-[100] w-[340px] max-h-80 overflow-y-auto rounded-lg border border-border bg-[var(--surface-3)] shadow-2xl shadow-black/60"
    style={dropdownPos(historyAnchor)}
    role="region"
    aria-label="Prompt history"
  >
    <div class="flex items-center justify-between px-2.5 py-1.5 border-b border-border sticky top-0 bg-[var(--surface-3)]">
      <span class="text-[10px] font-semibold text-foreground">History of prompts</span>
      {#if $history.entries.length > 0}<button
          type="button"
          onclick={() => usePromptHistory.getState().clear()}
          class="text-[9px] text-muted-foreground hover:text-red-400">clear everything</button
        >{/if}
    </div>
    {#if $history.entries.length === 0}<p class="px-2.5 py-3 text-[11px] text-muted-foreground">
        While empty, launched prompts are saved here automatically.
      </p>{/if}
    {#each $history.entries as entry (entry.id)}<div
        class="group flex items-start gap-2 px-2.5 py-1.5 hover:bg-white/5 cursor-pointer"
        role="button"
        tabindex="0"
        onclick={() => {
          changePrompt(entry.text);
          showHistory = false;
          toast.success("Prompt inserted from history");
        }}
        onkeydown={(e) => {
          if (e.key === "Enter") {
            changePrompt(entry.text);
            showHistory = false;
          }
        }}
      >
        <button
          type="button"
          onclick={(ev) => {
            ev.stopPropagation();
            usePromptHistory.getState().toggleFavorite(entry.id);
          }}
          title={entry.favorite ? "Remove from favorites" : "Add to favorites"}
          class="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center transition-colors {entry.favorite
            ? 'text-amber-400'
            : 'text-muted-foreground/40 hover:text-amber-400'}"
        >
          <Star class="w-3 h-3" fill={entry.favorite ? "currentColor" : "none"} />
        </button>
        <p class="flex-1 min-w-0 text-[11px] text-foreground/90 leading-snug line-clamp-2 break-words">{entry.text}</p>
        <button
          type="button"
          onclick={(ev) => {
            ev.stopPropagation();
            usePromptHistory.getState().remove(entry.id);
          }}
          class="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center text-muted-foreground/40 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove from history"
        >
          <X class="w-3 h-3" />
        </button>
      </div>{/each}
  </div>{/if}
{#if examples && examplesAnchor}<div
    class="fixed z-[100] w-[340px] max-h-80 overflow-y-auto rounded-lg border border-border bg-[var(--surface-3)] shadow-2xl shadow-black/60"
    style={dropdownPos(examplesAnchor)}
  >
    <div class="px-2.5 py-1.5 border-b border-border sticky top-0 bg-[var(--surface-3)]">
      <span class="text-[10px] font-semibold text-foreground">Ready-made examples</span>
    </div>
    {#each EXAMPLES as ex (ex.title)}<div
        class="px-2.5 py-1.5 hover:bg-white/5 cursor-pointer"
        role="button"
        tabindex="0"
        onclick={() => applyExample(ex.text)}
        onkeydown={(e) => e.key === "Enter" && applyExample(ex.text)}
      >
        <p class="text-[11px] font-medium text-foreground">{ex.title}</p>
        <p class="text-[10px] text-muted-foreground/80 line-clamp-2 leading-snug break-words">{ex.text}</p>
      </div>{/each}
    <p class="px-2.5 py-2 text-[9px] text-muted-foreground/60 border-t border-border">
      Replaces the current prompt (with the ability to cancel). Prompts are in English: the model understands it best.
    </p>
  </div>{/if}
