<script lang="ts">
  import { onDestroy } from "svelte";
  let {
    phase,
    isGenerating,
    progressPercent,
    statusMessage,
    error,
    oninterrupt,
    onreset,
    startedAt = null,
    promptId = null,
  }: {
    phase: string;
    isGenerating: boolean;
    progressPercent: number;
    statusMessage: string | null;
    error: string | null;
    oninterrupt: () => void;
    onreset: () => void;
    startedAt?: number | null;
    promptId?: string | null;
  } = $props();

  function formatElapsed(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 1000);
  onDestroy(() => clearInterval(tick));

  type Stage = { stage: number; totalStages: number; step: number; total: number };
  type Preview = {
    url: string;
    mime: string;
    step: number;
    total: number;
    width: number;
    height: number;
    stage?: Stage | null;
  };
  let previewData = $state<Preview | null>(null);
  const previewActive = $derived(phase === "running" || phase === "queued");

  $effect(() => {
    const pid = promptId;
    if (!previewActive || !pid) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/comfy/preview?prompt_id=${encodeURIComponent(pid)}&_t=${Date.now()}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.stage) {
          const s = data.stage as Stage;
          previewData = previewData
            ? { ...previewData, stage: s }
            : { url: "", mime: "image/jpeg", step: 0, total: 0, width: 0, height: 0, stage: s };
        }
        if (data.preview?.image) {
          const base = previewData ?? {
            url: "",
            mime: "image/jpeg",
            step: 0,
            total: 0,
            width: 0,
            height: 0,
            stage: null,
          };
          previewData = {
            ...base,
            url: data.preview.image,
            mime: data.preview.mime || "image/jpeg",
            step: data.preview.step || 0,
            total: data.preview.total || 0,
            width: data.preview.width || 0,
            height: data.preview.height || 0,
          };
        }
      } catch {
        /* ignore */
      }
    };
    void poll();
    const timer = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  });
  // A new job starts with an empty preview, like the React component remounting.
  $effect(() => {
    promptId;
    previewData = null;
  });

  const stage = $derived(previewData?.stage ?? null);
  const passLabel = $derived(stage ? `Pass ${stage.stage}/${stage.totalStages}` : "Preview");
  const stepNow = $derived(stage && stage.total > 0 ? stage.step : (previewData?.step ?? 0));
  const stepTotal = $derived(stage && stage.total > 0 ? stage.total : (previewData?.total ?? 0));
  const stepLabel = $derived(stepTotal > 0 ? ` · step ${stepNow}/${stepTotal}` : "");
</script>

<div class="space-y-2">
  <!-- Phase + elapsed -->
  <div class="flex items-center justify-between gap-2 text-xs">
    <span
      class="font-medium shrink-0 {phase === 'running'
        ? 'text-cyan-400'
        : phase === 'queued' || phase === 'submitting'
          ? 'text-yellow-400'
          : phase === 'done'
            ? 'text-green-400'
            : phase === 'error'
              ? 'text-red-400'
              : 'text-muted-foreground'}"
    >
      {#if phase === "idle"}Ready to generate{/if}
      {#if phase === "submitting"}Submitting…{/if}
      {#if phase === "queued"}Queued…{/if}
      {#if phase === "running"}{progressPercent > 0 ? `Generating… ${progressPercent}%` : "Generating…"}{/if}
      {#if phase === "done"}Done ✓{/if}
      {#if phase === "error"}Error{/if}
    </span>
    <div class="flex items-center gap-2 min-w-0">
      {#if startedAt && isGenerating}<span
          class="text-[10px] font-mono text-muted-foreground tabular-nums"
          >{formatElapsed(now - startedAt)}</span
        >{/if}
      {#if statusMessage}<span
          class="text-muted-foreground/60 truncate max-w-[140px]"
          title={statusMessage}>{statusMessage}</span
        >{/if}
    </div>
  </div>

  <!-- Progress bar -->
  <div class="h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
    {#if isGenerating}
      {#if phase === "queued" || phase === "submitting" || (phase === "running" && progressPercent === 0)}
        <div
          class="h-full w-1/3 rounded-full animate-pulse {phase === 'running'
            ? 'bg-gradient-to-r from-cyan-500/80 to-blue-500/80'
            : 'bg-gradient-to-r from-yellow-500/80 to-amber-500/80'}"
        ></div>
      {:else}
        <div
          class="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
          style:width={`${progressPercent}%`}
          style:transition="width 0.3s ease-in-out"
        ></div>
      {/if}
    {:else if phase === "done"}
      <div class="h-full w-full bg-gradient-to-r from-green-500/60 to-emerald-500/60 rounded-full"></div>
    {/if}
  </div>

  <!-- Live preview — only while a job is active -->
  {#if isGenerating}
    {#if !previewData || !previewData.url}
      <div
        class="rounded-lg border border-dashed border-border bg-[var(--surface-1)]/50 h-28 flex flex-col items-center justify-center gap-1"
      >
        <span class="text-[10px] text-muted-foreground/50 creative-pulse">Waiting for preview…</span>
        {#if previewData?.stage}<span class="text-[10px] text-cyan-300 font-medium"
            >Pass {previewData.stage.stage}/{previewData.stage.totalStages}{previewData.stage.total > 0
              ? ` · step ${previewData.stage.step}/${previewData.stage.total}`
              : ""}</span
          >{/if}
      </div>
    {:else}
      <div class="relative rounded-lg overflow-hidden border border-cyan-500/20 bg-black/40">
        {#if previewData.mime === "video/mp4"}
          <video src={previewData.url} autoplay loop muted class="w-full h-auto max-h-48 object-contain"></video>
        {:else}
          <img
            src={previewData.url}
            alt="Preview"
            class="w-full h-auto max-h-48 object-contain"
            draggable="false"
          />
        {/if}
        {#if previewData.mime === "image/webp"}<span
            class="absolute bottom-1 right-1 px-1 py-0.5 bg-black/50 rounded text-[8px] text-cyan-300"
            >anim</span
          >{/if}
        <div
          class="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-cyan-300 font-medium flex items-center gap-1.5"
        >
          <span>{passLabel}{stepLabel}</span>
          {#if previewData.width > 0 && previewData.height > 0}<span class="text-white/40 font-normal"
              >{previewData.width}×{previewData.height}</span
            >{/if}
        </div>
      </div>
    {/if}
  {/if}

  <!-- Stop -->
  {#if isGenerating}<button
      onclick={oninterrupt}
      aria-label="Cancel all"
      class="w-full text-xs text-red-400/70 hover:text-red-400 py-1 transition-colors">Stop</button
    >{/if}

  <!-- Error -->
  {#if error}<div class="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
      <span class="text-sm text-red-400 font-medium shrink-0">Error</span>
      <div class="space-y-1 min-w-0">
        <p class="text-xs text-red-300/70 break-words">{error}</p>
        <button
          onclick={onreset}
          class="inline-flex items-center justify-center rounded-md h-auto p-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors"
          >Try again</button
        >
      </div>
    </div>{/if}
</div>
