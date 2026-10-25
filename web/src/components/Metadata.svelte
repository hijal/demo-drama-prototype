<script lang="ts">
  import { Image, Film, AudioLines, ArrowDownToLine, RotateCcw } from "lucide-svelte";
  import { useGenStore } from "@/lib/gen-store";
  import { toast } from "@/lib/notifications";
  let {
    data,
    onretry,
    onclose,
  }: { data: Record<string, any>; onretry: () => void; onclose: () => void } = $props();

  const IMAGE_INTENT_LABELS: Record<string, string> = {
    identity: "character/object",
    scene: "scene",
    style: "style",
    composition: "composition",
  };
  const AUDIO_INTENT_LABELS: Record<string, string> = {
    voice: "voice",
    drive: "tempo/rhythm",
    style: "style",
  };
  const DETAIL_LABELS: Record<string, string> = {
    match: "Match output (match)",
    max: "Maximum detail (max)",
  };
  const MODE_LABELS: Record<string, string> = {
    t2v: "Text in video",
    flf: "First/last frame",
    ref: "References",
  };
  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  function formatCreatedAt(raw: unknown): string | null {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new Date(n * 1000).toLocaleString("en-US");
  }
  const basename = (p: unknown) => (typeof p === "string" ? p.split(/[\\/]/).pop() || p : "—");

  const params = $derived(
    (data?.params && typeof data.params === "object" && !Array.isArray(data.params)
      ? data.params
      : data) as Record<string, any>,
  );
  const prompt = $derived(typeof params?.prompt === "string" ? params.prompt : null);
  const generationMode = $derived(
    typeof params?.generation_mode === "string" ? params.generation_mode.trim().toLowerCase() : "",
  );
  const modeLabel = $derived(MODE_LABELS[generationMode] ?? (generationMode ? generationMode : null));
  const firstFrame = $derived(typeof params?.first_frame === "string" && params.first_frame ? params.first_frame : null);
  const lastFrame = $derived(typeof params?.last_frame === "string" && params.last_frame ? params.last_frame : null);
  const references = $derived(
    Array.isArray(params?.references)
      ? params.references
      : Array.isArray(params?.minimax_h3_references)
        ? params.minimax_h3_references
        : [],
  );
  const videoLength = $derived(typeof params?.video_length === "number" ? params.video_length : null);
  const fps = $derived(typeof params?.fps === "number" && params.fps > 0 ? params.fps : null);
  const durationSeconds = $derived(typeof params?.duration_seconds === "number" ? params.duration_seconds : null);
  const pass1 = $derived(typeof params?.pass1_steps === "number" ? params.pass1_steps : null);
  const pass2 = $derived(typeof params?.pass2_steps === "number" ? params.pass2_steps : null);
  const stepsLabel = $derived(
    pass1 != null || pass2 != null
      ? `${pass1 ?? "—"} + ${pass2 ?? "—"}`
      : params?.num_inference_steps != null
        ? String(params.num_inference_steps)
        : null,
  );
  const restJson = $derived.by(() => {
    if (!data) return null;
    const shallow = { ...data };
    delete shallow.params;
    const p = params && params !== data ? { ...params } : null;
    if (p)
      for (const key of [
        "prompt", "model_type", "seed", "resolution", "video_length", "num_inference_steps",
        "pass1_steps", "pass2_steps", "guidance_scale", "activated_loras", "loras_multipliers",
        "lora", "references", "minimax_h3_references", "minimax_h3_turbo_mode",
        "minimax_h3_reference_detail", "minimax_h3_text_encoder", "pass2_sampler", "pass1_sampler",
        "pass1_scheduler", "turbo_lora_strength", "generation_mode", "first_frame", "last_frame",
        "tool", "duration_seconds", "fps", "file_size", "source_file",
      ])
        delete p[key];
    const merged = p ? { ...shallow, ...p } : shallow;
    return Object.keys(merged).length > 0 ? JSON.stringify(merged, null, 2) : null;
  });

  function toEditor() {
    const store = useGenStore.getState();
    store.setVideoPrompt(prompt!);
    if (typeof params?.seed === "number" && params.seed >= 0) store.setVideoSeed(params.seed);
    window.dispatchEvent(new CustomEvent("h3:goto-generate"));
    toast.success("Prompt loaded into editor", {
      description: 'Only prompt and seed. For a complete recovery, use "Retry".',
    });
    onclose();
  }
  let failedThumbs = $state<Record<number, boolean>>({});
</script>

{#snippet paramCell(label: string, value: string, extra = "")}
  <div class="space-y-0.5">
    <p class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
    <div class="text-sm text-foreground/90 break-words"><span class={extra}>{value}</span></div>
  </div>
{/snippet}

{#if typeof data.job_id === "string"}<p class="text-[10px] text-muted-foreground font-mono">job {data.job_id}</p>{/if}

{#if prompt}<div class="space-y-1">
    <div class="flex items-center justify-between gap-2">
      <p class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Prompt</p>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onclick={toEditor}
          class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
          title="Upload prompt and seed to the generation form"
          ><ArrowDownToLine class="w-3 h-3" />To editor</button
        >
        <button
          type="button"
          onclick={onretry}
          class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
          title="Restore ALL generation parameters (prompt, seed, references, samplers, resolution...)"
          ><RotateCcw class="w-3 h-3" />Retry</button
        >
      </div>
    </div>
    <div
      class="rounded-md bg-[var(--surface-2)] border border-border p-2.5 text-xs text-foreground/90 whitespace-pre-wrap break-words max-h-48 overflow-y-auto leading-relaxed"
    >
      {prompt}
    </div>
  </div>{/if}

<div class="grid grid-cols-2 gap-x-4 gap-y-3">
  {#if modeLabel}{@render paramCell("Mode", modeLabel, "text-[13px] text-cyan-300")}{/if}
  {@render paramCell("Seed", typeof params?.seed === "number" ? String(params.seed) : "—", "font-mono")}
  {@render paramCell("Resolution", params?.resolution != null ? String(params.resolution) : "—")}
  {@render paramCell(
    "Duration",
    durationSeconds != null
      ? `${durationSeconds.toFixed(1)} c${videoLength != null ? ` · ${videoLength} frame.` : ""}`
      : videoLength != null && fps != null
        ? `${(videoLength / fps).toFixed(1)} c · ${videoLength} frame.`
        : "—",
  )}
  {@render paramCell(pass1 != null || pass2 != null ? "Steps (pass1 + pass2)" : "Steps", stepsLabel ?? "—")}
  {#if params?.pass2_sampler != null}{@render paramCell("Sampler (pass 2)", String(params.pass2_sampler), "font-mono")}{/if}
  {#if params?.pass1_sampler != null}{@render paramCell("Sampler (pass 1)", String(params.pass1_sampler), "font-mono")}{/if}
  {#if params?.pass1_scheduler != null}{@render paramCell("Scheduler (pass 1)", String(params.pass1_scheduler), "font-mono")}{/if}
  {#if params?.turbo_lora_strength != null}{@render paramCell("Turbo LoRA", String(params.turbo_lora_strength), "font-mono")}{/if}
  {#if params?.guidance_scale != null}{@render paramCell("Guidance", String(params.guidance_scale))}{/if}
  {@render paramCell("Date", formatCreatedAt(data.created_at) ?? "—")}
  {@render paramCell(
    "Generation time",
    typeof data.generation_time === "number" && data.generation_time > 0 ? formatDuration(data.generation_time) : "—",
  )}
</div>

{#if firstFrame || lastFrame}<div class="space-y-1.5">
    <p class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Frames (fl2va)</p>
    {#if firstFrame}<div class="flex items-center gap-2 rounded-md bg-[var(--surface-2)] border border-border px-2 py-1.5">
        <Image class="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <span class="text-xs text-foreground/90 truncate flex-1" title={firstFrame}>First frame: {basename(firstFrame)}</span>
      </div>{/if}
    {#if lastFrame}<div class="flex items-center gap-2 rounded-md bg-[var(--surface-2)] border border-border px-2 py-1.5">
        <Image class="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <span class="text-xs text-foreground/90 truncate flex-1" title={lastFrame}>Last frame: {basename(lastFrame)}</span>
      </div>{/if}
  </div>{/if}

{#if references.length > 0}<div class="space-y-1.5">
    <p class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">References ({references.length})</p>
    {#each references as ref, index}
      {@const type = String(ref.type || "").toLowerCase()}
      {@const Icon = type === "image" ? Image : type === "video" ? Film : AudioLines}
      {@const intent =
        type === "image"
          ? (IMAGE_INTENT_LABELS[ref.image_intent || ref.role || "identity"] ?? ref.role) || "—"
          : type === "audio"
            ? AUDIO_INTENT_LABELS[ref.audio_intent || "voice"]
            : ref.include_audio === false
              ? "no sound"
              : "with sound"}
      {@const thumbUrl =
        ref.path && (type === "image" || type === "video")
          ? `/api/comfy/file?filename=${encodeURIComponent(ref.path)}&subfolder=&type=input&width=96`
          : null}
      <div class="flex items-start gap-2 rounded-md bg-[var(--surface-2)] border border-border px-2 py-1.5">
        <span class="text-[10px] font-mono text-muted-foreground shrink-0 mt-0.5">#{index + 1}</span>
        {#if thumbUrl && !failedThumbs[index]}<img
            src={thumbUrl}
            alt=""
            loading="lazy"
            onerror={() => (failedThumbs[index] = true)}
            class="w-10 h-10 rounded-md object-cover border shrink-0 {type === 'image'
              ? 'border-purple-500/30'
              : 'border-cyan-500/30'}"
          />{:else}<Icon
            class="w-3.5 h-3.5 shrink-0 mt-0.5 {type === 'image'
              ? 'text-purple-400'
              : type === 'video'
                ? 'text-cyan-400'
                : 'text-emerald-400'}"
          />{/if}
        <div class="min-w-0 flex-1">
          <p class="text-xs text-foreground/90 truncate" title={basename(ref.path)}>{basename(ref.path)}</p>
          <p class="text-[10px] text-muted-foreground">{intent}{ref.role ? ` role: ${ref.role}` : ""}</p>
        </div>
      </div>
    {/each}
    {#if params?.minimax_h3_reference_detail != null}<p class="text-[10px] text-muted-foreground">
        Detail: {DETAIL_LABELS[String(params.minimax_h3_reference_detail)] ?? String(params.minimax_h3_reference_detail)}
      </p>{/if}
  </div>{/if}

{#if restJson}<details class="text-xs">
    <summary class="cursor-pointer text-muted-foreground hover:text-foreground select-none">More (other fields)</summary>
    <pre class="mt-1.5 p-2 rounded bg-[var(--surface-2)] border border-border overflow-auto max-h-48">{restJson}</pre>
  </details>{/if}
