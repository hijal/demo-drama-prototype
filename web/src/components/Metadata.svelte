<script lang="ts">
  import {
    Image,
    Film,
    AudioLines,
    ArrowDownToLine,
    RotateCcw,
  } from "lucide-svelte";
  import { useGenStore } from "@/lib/gen-store";
  import { toast } from "@/lib/notifications";
  let {
    data,
    onretry,
    onclose,
  }: { data: Record<string, any>; onretry: () => void; onclose: () => void } =
    $props();
  const p = $derived(
    data.params && typeof data.params === "object" ? data.params : data,
  );
  const refs = $derived(p.references || p.minimax_h3_references || []);
  const frameDuration = $derived(
    p.video_length && p.fps ? p.video_length / p.fps : undefined,
  );
  const fields = $derived(
    [
      {
        label: "Mode",
        value:
          (
            {
              t2v: "Text in video",
              flf: "First/last frame",
              ref: "References",
            } as Record<string, string>
          )[p.generation_mode] || p.generation_mode,
      },
      { label: "Seed", value: p.seed ?? "—" },
      { label: "Resolution", value: p.resolution ?? "—" },
      {
        label: "Duration",
        value:
          (p.duration_seconds ?? frameDuration) != null
            ? `${(p.duration_seconds ?? frameDuration).toFixed(1)} c${p.video_length ? ` · ${p.video_length} frame.` : ""}`
            : "—",
      },
      {
        label:
          p.pass1_steps != null || p.pass2_steps != null
            ? "Steps (pass1 + pass2)"
            : "Steps",
        value:
          p.pass1_steps != null || p.pass2_steps != null
            ? `${p.pass1_steps ?? "—"} + ${p.pass2_steps ?? "—"}`
            : (p.num_inference_steps ?? "—"),
      },
      { label: "Sampler (pass 2)", value: p.pass2_sampler },
      { label: "Sampler (pass 1)", value: p.pass1_sampler },
      { label: "Scheduler (pass 1)", value: p.pass1_scheduler },
      { label: "Turbo LoRA", value: p.turbo_lora_strength },
      { label: "Guidance", value: p.guidance_scale },
      {
        label: "Date",
        value: data.created_at
          ? new Date(data.created_at * 1000).toLocaleString("en-US")
          : "—",
      },
      {
        label: "Generation time",
        value:
          data.generation_time > 0
            ? `${Math.floor(data.generation_time / 60)}:${String(Math.floor(data.generation_time % 60)).padStart(2, "0")}`
            : "—",
      },
    ].filter((item) => item.value !== undefined),
  );
  function toEditor() {
    useGenStore.getState().setVideoPrompt(p.prompt);
    if (typeof p.seed === "number" && p.seed >= 0)
      useGenStore.getState().setVideoSeed(p.seed);
    window.dispatchEvent(new CustomEvent("h3:goto-generate"));
    toast.success("Prompt loaded into editor");
    onclose();
  }
  const basename = (path: string) => path.split(/[\\/]/).pop() || path;
</script>

<div class="space-y-4">
  {#if data.job_id}<p class="text-[10px] text-muted-foreground font-mono">
      job {data.job_id}
    </p>{/if}
  {#if p.prompt}<div class="space-y-1">
      <div class="flex items-center justify-between gap-2">
        <p
          class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide"
        >
          Prompt
        </p>
        <div class="flex items-center gap-1.5">
          <button
            class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
            onclick={toEditor}
            ><ArrowDownToLine class="w-3 h-3" />To editor</button
          ><button
            class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            onclick={onretry}><RotateCcw class="w-3 h-3" />Retry</button
          >
        </div>
      </div>
      <div
        class="rounded-md bg-[var(--surface-2)] border border-border p-2.5 text-xs text-foreground/90 whitespace-pre-wrap break-words max-h-48 overflow-y-auto leading-relaxed"
      >
        {p.prompt}
      </div>
    </div>{/if}
  <div class="grid grid-cols-2 gap-x-4 gap-y-3">
    {#each fields as item}<div class="space-y-0.5">
        <p
          class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide"
        >
          {item.label}
        </p>
        <div class="text-sm text-foreground/90 break-words">{item.value}</div>
      </div>{/each}
  </div>
  {#if p.first_frame || p.last_frame}<div class="space-y-1.5">
      <p
        class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide"
      >
        Frames (fl2va)
      </p>
      {#each [{ label: "First frame", path: p.first_frame }, { label: "Last frame", path: p.last_frame }] as frame}{#if frame.path}<div
            class="flex items-center gap-2 rounded-md bg-[var(--surface-2)] border border-border px-2 py-1.5"
          >
            <Image class="w-3.5 h-3.5 text-purple-400 shrink-0" /><span
              class="text-xs text-foreground/90 truncate"
              >{frame.label}: {basename(frame.path)}</span
            >
          </div>{/if}{/each}
    </div>{/if}
  {#if refs.length}<div class="space-y-1.5">
      <p
        class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide"
      >
        References ({refs.length})
      </p>
      {#each refs as ref, index}{@const Icon =
          ref.type === "image"
            ? Image
            : ref.type === "video"
              ? Film
              : AudioLines}
        <div
          class="flex items-center gap-2 rounded-md bg-[var(--surface-2)] border border-border px-2 py-1.5"
        >
          <Icon class="w-3.5 h-3.5 text-cyan-400" /><span
            class="text-xs truncate"
            >{index + 1}. {basename(ref.path || "—")}</span
          ><span class="text-[10px] text-muted-foreground"
            >{ref.role || ref.audio_intent || ref.image_intent || ""}</span
          >
        </div>{/each}
    </div>{/if}
  <details>
    <summary class="text-xs text-muted-foreground cursor-pointer">More</summary>
    <pre
      class="whitespace-pre-wrap break-words text-[10px] font-mono text-muted-foreground mt-2">{JSON.stringify(
        data,
        null,
        2,
      )}</pre>
  </details>
</div>
