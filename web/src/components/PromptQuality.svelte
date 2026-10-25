<script lang="ts">
  import { analyze } from "../lib/prompt-quality";
  let {
    prompt,
    refsCount,
    class: className = "",
  }: { prompt: string; refsCount: number; class?: string } = $props();
  const items = $derived(analyze(prompt, refsCount));
  const KIND_CLASS = {
    ok: "text-emerald-400/90 bg-emerald-500/10 border-emerald-500/20",
    warn: "text-amber-300 bg-amber-500/10 border-amber-500/25",
    muted: "text-muted-foreground bg-[var(--surface-2)]/70 border-border",
  } as const;
</script>

{#if items.length}<div class="flex flex-wrap items-center gap-1.5 {className}" aria-label="Prompt suggestions">
    {#each items as it}<span
        class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] leading-none {KIND_CLASS[
          it.kind
        ]}">{#if it.kind === "ok"}✓{/if}{#if it.kind === "warn"}!{/if}{it.text}</span
      >{/each}
  </div>{/if}
