<script lang="ts">
  import { onMount } from "svelte";
  import Modal from "./Modal.svelte";
  import PromptHighlight from "./PromptHighlight.svelte";
  import PromptEditor from "./PromptEditor.svelte";
  import PromptQuality from "./PromptQuality.svelte";
  import Select from "./Select.svelte";
  import SettingSlider from "./SettingSlider.svelte";
  import References from "./References.svelte";
  import {
    Sparkles,
    History,
    Pencil,
    SlidersHorizontal,
    ChevronDown,
    Dices,
    Folder,
    Film,
    Star,
    Trash2,
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
  let historyPosition = $state({ left: 0, top: 0 });
  let examplesPosition = $state({ left: 0, top: 0 });
  let promptElement = $state<HTMLTextAreaElement>();
  let mention = $state(false);
  let preview = $state("");
  let stage = $state("");
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
  $effect(() => {
    const pid = generation.promptId;
    const phase = generation.phase;
    preview = "";
    stage = "";
    if (!pid || !["queued", "running"].includes(phase)) return;
    let disposed = false,
      busy = false;
    async function poll() {
      if (busy) return;
      busy = true;
      try {
        const data = await api(
          `/api/comfy/preview?prompt_id=${encodeURIComponent(pid!)}`,
        );
        if (!disposed) {
          preview = data.preview?.image || "";
          stage =
            data.stage?.label ||
            (data.preview
              ? `Step ${data.preview.step} / ${data.preview.total}`
              : "");
        }
      } catch {
      } finally {
        busy = false;
      }
    }
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  });
  function changePrompt(text: string) {
    useGenStore.getState().setVideoPrompt(text);
  }
  function insert(text: string) {
    const start = promptElement?.selectionStart ?? v.prompt.length,
      end = promptElement?.selectionEnd ?? start;
    changePrompt(v.prompt.slice(0, start) + text + v.prompt.slice(end));
    mention = false;
    requestAnimationFrame(() => {
      promptElement?.focus();
      promptElement?.setSelectionRange(
        start + text.length,
        start + text.length,
      );
    });
  }
  function insertMention(text: string) {
    const cursor = promptElement?.selectionStart ?? v.prompt.length;
    const before = v.prompt.slice(0, cursor),
      at = before.lastIndexOf("@");
    if (mention && at >= 0)
      changePrompt(before.slice(0, at) + text + " " + v.prompt.slice(cursor));
    else insert(text + " ");
    mention = false;
  }
  const tagFor = (ref: VideoRefItem) =>
    `<${{ image: "Picture", video: "Video", audio: "Audio" }[ref.kind]} ${v.refs.filter((r) => r.kind === ref.kind).findIndex((r) => r.id === ref.id) + 1}>`;
  function dialogue() {
    const start = promptElement?.selectionStart ?? v.prompt.length,
      end = promptElement?.selectionEnd ?? start;
    insert(
      `<d>${v.prompt.slice(start, end) || "[English] Dialogue here."}</d>`,
    );
  }
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
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void generate();
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
          >{#if v.freeResolution}<SettingSlider
              label="Resolution (MP)"
              value={v.finalResolution || 0.7}
              min={0.2}
              max={3}
              step={0.05}
              inputMax={16}
              onchange={(n) =>
                patch({ finalResolution: n, targetDimensions: null })}
              hint={`Free size. Final Resolution ${dimensions} with the ratio ${resolution.aspect}. manual input: up to 16 MP`}
            />{/if}{/if}
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
              aria-label="Duration frames"
              value={v.videoLength}
              onchange={(e) => length(e.currentTarget.value)}
            /><span
              class="inline-flex items-center justify-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium"
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
          24 fps · from {(minFrames / 24).toFixed(1)} up to {(
            maxFrames / 24
          ).toFixed(1)} s · alignment 17n+5 · maximum 30 s · manual input: {minFrames}–{maxFrames}
          frames.
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
      <div class="space-y-3">
        <button
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
                class="text-xs text-muted-foreground flex items-center justify-between"
              >
                <label for="seed">Seed</label><button
                  title="Random seed (-1)"
                  onclick={() => patch({ seed: -1 })}
                  ><Dices class="w-4 h-4 text-muted-foreground" /></button
                >
              </div>
              <input
                id="seed"
                aria-label="Seed"
                type="number"
                class="w-full h-9 rounded-md border border-border bg-[var(--surface-2)] px-3 text-sm font-mono"
                value={v.seed}
                onchange={(e) => {
                  const n = Number(e.currentTarget.value);
                  if (Number.isFinite(n)) patch({ seed: Math.round(n) });
                }}
              />
              <p class="text-[10px] text-muted-foreground/60">-1 = random</p>
            </div>
            <div class="space-y-1.5">
              <button
                class="w-full flex items-center justify-between px-3 py-1.5 rounded-md bg-[var(--surface-3)] border border-border/60 hover:border-cyan-500/30 text-left"
                onclick={() => (pass1 = !pass1)}
                ><span class="text-[11px] font-medium text-muted-foreground"
                  >Pass 1 — Low-res</span
                ><span
                  class="text-[9px] text-muted-foreground"
                  class:rotate-180={pass1}>▼</span
                ></button
              >{#if pass1}<div class="space-y-3 pl-1 overflow-hidden">
                  <SettingSlider
                    label="Low-res resolution (MP)"
                    value={v.lowResMP}
                    min={0.2}
                    max={Math.min(0.5, v.finalResolution || 0.7)}
                    inputMin={0.1}
                    inputMax={Math.min(0.5, v.finalResolution || 0.7)}
                    step={0.05}
                    onchange={(n) => patch({ lowResMP: n })}
                    hint="First pass permission. The lower, the faster."
                  /><SettingSlider
                    label="Sampler steps"
                    value={v.firstSamplerSteps}
                    min={2}
                    max={30}
                    inputMin={1}
                    inputMax={128}
                    onchange={(n) => patch({ firstSamplerSteps: n })}
                  />{#each [{ key: "pass1Sampler", label: "Sampler", values: [...VALID_KSAMPLERS] }, { key: "pass1Scheduler", label: "Scheduler", values: [...PASS1_SCHEDULERS] }] as control}<label
                      class="block space-y-1"
                      ><span class="text-xs text-muted-foreground"
                        >{control.label}</span
                      ><Select
                        label={`Pass 1 ${control.label.toLowerCase()}`}
                        value={v[control.key as keyof VideoGenState] as string}
                        options={control.values}
                        onchange={(value) => patch({ [control.key]: value })}
                      /></label
                    >{/each}
                  <div class="space-y-1">
                    <span class="text-xs text-muted-foreground"
                      >Refs: size mode</span
                    >
                    <div class="grid grid-cols-2 gap-1.5">
                      {#each ["match", "max"] as mode}<button
                          class="px-2 py-1.5 rounded-md border text-[11px] {v.referenceDetail ===
                          mode
                            ? 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10'
                            : 'border-border text-muted-foreground'}"
                          onclick={() =>
                            patch({ referenceDetail: mode as "match" | "max" })}
                          >{mode === "match"
                            ? "Match (quick)"
                            : "Max (quality)"}</button
                        >{/each}
                    </div>
                    <p class="text-[10px] text-muted-foreground/60">
                      Match: refs for generation area (fast). Max: short sides
                      2048px (precision, slower).
                    </p>
                  </div>
                </div>{/if}
            </div>
            <div class="space-y-1.5">
              <button
                class="w-full flex items-center justify-between px-3 py-1.5 rounded-md bg-[var(--surface-3)] border border-border/60 hover:border-cyan-500/30 text-left"
                onclick={() => (pass2 = !pass2)}
                ><span class="text-[11px] font-medium text-muted-foreground"
                  >Pass 2 — High-res</span
                ><span
                  class="text-[9px] text-muted-foreground"
                  class:rotate-180={pass2}>▼</span
                ></button
              >{#if pass2}<div class="space-y-3 pl-1 overflow-hidden">
                  {#each [{ key: "sigmaVariant", label: "Sigma profile (steps)", values: ["3step", "4step", "5step", "6step", "7step"] }, { key: "pass2Sampler", label: "Sampler", values: [...VALID_KSAMPLERS] }] as control}<label
                      class="block space-y-1"
                      ><span class="text-xs text-muted-foreground"
                        >{control.label}</span
                      ><Select
                        label={`Pass 2 ${control.label.toLowerCase()}`}
                        value={v[control.key as keyof VideoGenState] as string}
                        options={control.values}
                        onchange={(value) => patch({ [control.key]: value })}
                      /></label
                    >{/each}
                </div>{/if}
            </div>
          </div>{/if}
      </div>
    </div>
    <div
      class="shrink-0 border-t border-border p-3 bg-[var(--surface-0)]/90 backdrop-blur-sm"
    >
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2 text-xs">
          <span
            class="font-medium shrink-0 {active
              ? 'text-cyan-400'
              : generation.phase === 'error'
                ? 'text-red-400'
                : 'text-muted-foreground'}"
            >{generation.phase === "idle"
              ? "Ready to generate"
              : generation.phase === "done"
                ? "Done ✓"
                : generation.phase === "error"
                  ? "Error"
                  : generation.phase === "queued"
                    ? "Queued…"
                    : generation.phase === "submitting"
                      ? "Submitting…"
                      : "Generating…"}</span
          >{#if stage}<span
              class="text-muted-foreground/60 truncate max-w-[140px]"
              >{stage}</span
            >{/if}
        </div>
        <div class="h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
          {#if active}<div
              class="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
              style:width={`${generation.progressMax ? (generation.progressValue / generation.progressMax) * 100 : 33}%`}
            ></div>{:else if generation.phase === "done"}<div
              class="h-full bg-gradient-to-r from-green-500/60 to-emerald-500/60"
            ></div>{/if}
        </div>
        {#if active}{#if preview}<img
              class="w-full rounded-md"
              src={preview}
              alt="Live generation preview"
            />{/if}<button
            class="w-full text-xs text-red-400/70 hover:text-red-400 py-1"
            aria-label="Cancel all"
            onclick={() => controller?.interrupt()}>Stop</button
          >{/if}{#if generation.error}<p
            class="text-xs text-red-300/70 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
          >
            {generation.error}
          </p>{/if}
      </div>
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
          <PromptHighlight
            text={v.prompt}
            element={promptElement}
            height={200}
          />
          <textarea
            id="prompt"
            aria-label="Prompt"
            bind:this={promptElement}
            class="relative w-full h-[200px] resize-none rounded-lg border border-border bg-transparent text-transparent caret-cyan-300 px-3 py-2 text-sm leading-relaxed font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-cyan-500/40"
            value={v.prompt}
            placeholder="A girl with <Picture 1> walks through the market from <Video 1> and says: <d>Almost there.</d> …"
            oninput={(e) => {
              changePrompt(e.currentTarget.value);
              mention = /@\w*$/.test(
                e.currentTarget.value.slice(0, e.currentTarget.selectionStart),
              );
            }}></textarea><button
            class="absolute top-2 right-2 w-7 h-7 rounded-lg border border-border/60 bg-[var(--surface-3)] flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Expand prompt editor"
            onclick={() => (editor = true)}
            ><Pencil class="w-3.5 h-3.5" /></button
          >
          {#if mention}<div
              class="absolute top-full left-0 z-40 border border-border rounded-lg bg-[var(--surface-3)] shadow-lg p-1"
            >
              {#each v.refs.filter((r) => v.mode === "ref" || r.kind === "audio") as ref}<button
                  class="block w-full px-3 py-2 text-xs text-left hover:bg-[var(--surface-4)]"
                  onmousedown={(e) => e.preventDefault()}
                  onclick={() => insertMention(tagFor(ref))}
                  >{tagFor(ref)} · {ref.name}</button
                >{/each}
            </div>{/if}
        </div>
        <PromptQuality
          prompt={v.prompt}
          refs={v.refs.filter((r) => v.mode === "ref" || r.kind === "audio")}
        />
        <div class="flex items-center gap-1.5">
          <button
            class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-border text-muted-foreground hover:text-foreground"
            onclick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              historyPosition = {
                left: Math.min(rect.left, innerWidth - 344),
                top: rect.bottom + 4,
              };
              showHistory = !showHistory;
              examples = false;
            }}
            ><History
              class="w-3 h-3"
            />History{#if $history.entries.length}<span
                class="ml-0.5 px-1 rounded-full bg-[var(--surface-3)] text-[9px]"
                >{$history.entries.length}</span
              >{/if}</button
          >
          <div class="relative">
            <button
              class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-border text-muted-foreground hover:text-foreground"
              onclick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                examplesPosition = {
                  left: Math.min(rect.left, innerWidth - 344),
                  top: rect.bottom + 4,
                };
                examples = !examples;
                showHistory = false;
              }}><Sparkles class="w-3 h-3" />Examples</button
            >{#if examples}<div
                style:left={`${examplesPosition.left}px`}
                style:top={`${examplesPosition.top}px`}
                class="fixed z-50 w-[340px] max-h-80 overflow-y-auto rounded-lg border border-border bg-[var(--surface-3)] shadow-2xl shadow-black/60"
              >
                {#each EXAMPLES as example}<button
                    class="w-full text-left px-2.5 py-2 hover:bg-white/5"
                    onclick={() => {
                      changePrompt(example.text);
                      examples = false;
                    }}
                    ><span class="text-xs font-medium">{example.title}</span>
                    <p
                      class="text-[10px] text-muted-foreground line-clamp-2 mt-1"
                    >
                      {example.text}
                    </p></button
                  >{/each}
              </div>{/if}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          <span
            class="rounded-md px-2 py-0.5 bg-secondary text-secondary-foreground text-[10px] font-medium"
            >{dimensions.replaceAll(" ", "").replace("×", "x")}</span
          ><span
            class="rounded-md px-2 py-0.5 bg-secondary text-secondary-foreground text-[10px] font-medium"
            >{(v.videoLength / 24).toFixed(1)} s · 24 fps</span
          ><span
            class="rounded-md border px-2 py-0.5 bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] font-medium"
            >2-Pass · {v.freeResolution
              ? `${v.finalResolution.toFixed(2)} MP`
              : "auto MP"}</span
          >{#if v.refs.length}<span
              class="rounded-md px-2 py-0.5 bg-secondary text-[10px]"
              >{v.refs.length} reference(s)</span
            >{/if}
        </div>
        {#if $gallery.folders.length}<div class="relative shrink-0">
            <button
              class="h-11 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs border-border bg-[var(--surface-2)] text-muted-foreground hover:text-foreground"
              onclick={() => (folderMenu = !folderMenu)}
              ><Folder class="w-3.5 h-3.5" /><span
                class="max-w-[120px] truncate"
                >{v.outputFolder || "Shared folder"}</span
              ><ChevronDown class="w-3 h-3" /></button
            >{#if folderMenu}<div
                class="absolute bottom-full mb-1.5 right-0 z-50 w-52 rounded-lg border border-border bg-[var(--surface-2)] shadow-xl p-1"
              >
                {#each ["", ...$gallery.folders] as folder}<button
                    class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left hover:bg-[var(--surface-3)]"
                    onclick={() => {
                      patch({ outputFolder: folder });
                      folderMenu = false;
                    }}
                    ><Folder class="w-3.5 h-3.5" />{folder ||
                      "Shared folder"}</button
                  >{/each}
              </div>{/if}
          </div>{/if}
        <button
          class="inline-flex items-center justify-center rounded-md h-11 px-6 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white border-0 text-sm font-semibold shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:pointer-events-none"
          disabled={!controller ||
            uploading ||
            !v.prompt.trim() ||
            (v.mode === "flf" && !v.startFrame)}
          onclick={generate}
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
  prompt={v.prompt}
  refs={v.refs.filter((r) => v.mode === "ref" || r.kind === "audio")}
  {tagFor}
  onsave={changePrompt}
  onrun={controller ? () => void generate() : undefined}
/>
{#if showHistory}<div
    style:left={`${historyPosition.left}px`}
    style:top={`${historyPosition.top}px`}
    class="fixed z-[100] w-[340px] max-h-80 overflow-y-auto rounded-lg border border-border bg-[var(--surface-3)] shadow-2xl shadow-black/60"
    role="region"
    aria-label="Prompt history"
  >
    <div class="px-2.5 py-1.5 border-b border-border flex justify-between">
      <span class="text-[10px] font-semibold">History of prompts</span><button
        class="text-[9px] text-muted-foreground hover:text-red-400"
        onclick={() => usePromptHistory.getState().clear()}
        >clear everything</button
      >
    </div>
    <div class="max-h-80 overflow-auto space-y-1">
      {#each $history.entries as entry (entry.id)}<div
          class="group flex items-start gap-2 px-2.5 py-1.5 hover:bg-white/5"
        >
          <button
            class="flex-1 text-left text-[11px] text-foreground/80 line-clamp-3"
            onclick={() => {
              changePrompt(entry.text);
              showHistory = false;
            }}>{entry.text}</button
          ><button
            aria-label="Toggle favorite"
            onclick={() => usePromptHistory.getState().toggleFavorite(entry.id)}
            ><Star
              class="w-3 h-3"
              fill={entry.favorite ? "currentColor" : "none"}
            /></button
          ><button
            aria-label="Remove prompt"
            onclick={() => usePromptHistory.getState().remove(entry.id)}
            ><Trash2 class="w-3 h-3" /></button
          >
        </div>{:else}<p class="text-[11px] text-muted-foreground">
          While empty, launched prompts are saved here automatically.
        </p>{/each}
    </div>
  </div>{/if}
