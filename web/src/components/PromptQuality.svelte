<script lang="ts">
  import type { VideoRefItem } from "@/lib/gen-store";
  import { analyze } from "../lib/prompt-quality";
  let { prompt, refs }: { prompt: string; refs: VideoRefItem[] } = $props();
  const items = $derived(analyze(prompt, refs.length));
  const colors = {
    ok: "text-emerald-400/90 bg-emerald-500/10 border-emerald-500/20",
    warn: "text-amber-300 bg-amber-500/10 border-amber-500/25",
    muted: "text-muted-foreground bg-[var(--surface-2)]/70 border-border",
  };
</script>

{#if items.length}<div
    class="flex flex-wrap items-center gap-1.5"
    aria-label="Prompt suggestions"
  >
    {#each items as item}<span
        class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] {colors[
          item.kind
        ]}">{item.text}</span
      >{/each}
  </div>{/if}
