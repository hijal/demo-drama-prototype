<script lang="ts">
  import { Check, Copy, RotateCcw } from "lucide-svelte";
  import { toast } from "@/lib/notifications";
  import { SERIES_SCRIPT_PROMPT, SINGLE_SCRIPT_PROMPT } from "../lib/script-format";

  let mode = $state<"single" | "episode">("single");
  const defaults = { single: SINGLE_SCRIPT_PROMPT, episode: SERIES_SCRIPT_PROMPT };
  let prompts = $state({ ...defaults });
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompts[mode]);
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = false), 1500);
      toast.success("Copied. Paste it into an AI chat.");
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  }
</script>

<div class="h-full w-full flex flex-col p-6 gap-4 min-h-0" data-format-script>
  <div class="flex flex-col gap-1">
    <h1 class="text-lg font-semibold text-foreground">Format Script</h1>
    <p class="text-xs text-muted-foreground">
      Copy this prompt, write your story idea in it, and give it to an AI
      (ChatGPT, Claude, Gemini). It returns a script in the studio format.
    </p>
  </div>

  <div
    role="tablist"
    aria-label="Script type"
    class="inline-flex self-start rounded-lg bg-[var(--surface-2)] p-1 gap-1"
  >
    {#each [{ id: "single" as const, label: "Single" }, { id: "episode" as const, label: "Episode" }] as item}
      <button
        role="tab"
        aria-selected={mode === item.id}
        onclick={() => (mode = item.id)}
        class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors {mode ===
        item.id
          ? 'bg-[var(--surface-3)] text-foreground'
          : 'text-muted-foreground hover:text-foreground'}">{item.label}</button
      >
    {/each}
  </div>

  <div class="flex items-center gap-2">
    <button
      onclick={copy}
      class="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium gradient-creative text-white"
    >
      {#if copied}<Check class="w-3.5 h-3.5" />Copied{:else}<Copy
          class="w-3.5 h-3.5"
        />Copy{/if}
    </button>
    <button
      onclick={() => (prompts[mode] = defaults[mode])}
      disabled={prompts[mode] === defaults[mode]}
      class="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:pointer-events-none"
      ><RotateCcw class="w-3.5 h-3.5" />Reset</button
    >
  </div>
  <textarea
    aria-label={mode === "single" ? "Single script prompt" : "Episode series prompt"}
    bind:value={prompts[mode]}
    spellcheck="false"
    class="flex-1 min-h-0 w-full resize-none rounded-lg border border-border bg-[var(--surface-1)] p-4 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-cyan-500/50"
  ></textarea>
</div>
