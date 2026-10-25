<script lang="ts">
  import Modal from "./Modal.svelte";
  import MentionTextarea, { type MentionItem } from "./MentionTextarea.svelte";
  import PromptQuality from "./PromptQuality.svelte";
  import {
    WrapText,
    Copy,
    Trash,
    Tags,
    History,
    Sparkles,
    MessageSquareQuote,
    Camera,
    LayoutTemplate,
    Star,
    X,
  } from "lucide-svelte";
  import { CAMERA_WORDS, EXAMPLES } from "@/lib/prompt-examples";
  import { usePromptHistory } from "@/lib/prompt-history-store";
  import { readable } from "../lib/store";
  import { toast } from "@/lib/notifications";
  let {
    open = $bindable(false),
    initialText,
    onsave,
    onsaveandrun,
    placeholder = "Enter or edit prompt...",
    mentions = [],
  }: {
    open?: boolean;
    initialText: string;
    onsave: (text: string) => void;
    onsaveandrun?: (text: string) => void;
    placeholder?: string;
    mentions?: MentionItem[];
  } = $props();

  const SKELETONS: Array<{ label: string; text: string }> = [
    {
      label: "Portrait",
      text: "A character with <Picture 1> [what they are doing], [place, time of day], [lighting and mood]. The camera [movement/shot]. He/She says: <d>short line.</d>",
    },
    {
      label: "Scene",
      text: "A character with <Picture 1> [action] in [location from <Video 1>], [surrounding details], [light]. The camera [movement]. Sounds: [background sounds].",
    },
    {
      label: "Dialogue",
      text: "A character with <Picture 1> [scene context and place]. He/She says: <d>first short line.</d> A pause, [reaction/gesture]. Then: <d>second line.</d>",
    },
  ];

  const history = readable(usePromptHistory);
  let text = $state("");
  let rightTab = $state<"insert" | "history" | "examples">("insert");
  let editor = $state<ReturnType<typeof MentionTextarea>>();
  $effect(() => {
    if (open) text = initialText;
  });

  const insert = (snippet: string) => editor?.insertAtCursor(snippet);
  function applyPrompt(snippet: string) {
    text = snippet;
    toast.success("Prompt applied");
  }
  function handleSave() {
    onsave(text);
    open = false;
  }
  function handleSaveAndRun() {
    onsave(text);
    open = false;
    onsaveandrun?.(text);
  }
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Prompt copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }
  function handleKeyDownFs(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (onsaveandrun) handleSaveAndRun();
      else handleSave();
    }
  }
  const BUTTON_SM =
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none h-8 px-3";
</script>

{#snippet panelBlock(icon: typeof Tags, title: string)}
  {@const Icon = icon}
  <div class="flex items-center gap-1.5 text-muted-foreground">
    <Icon class="w-3.5 h-3.5" />
    <span class="text-[10px] font-medium uppercase tracking-wide">{title}</span>
  </div>
{/snippet}

<Modal bind:open title="Prompt editor" kind="editor">
  {#snippet header()}
    <div class="px-4 pt-3 pb-2 border-b border-border shrink-0 flex items-center justify-between gap-2 pr-12">
      <div>
        <h2 class="text-base font-semibold leading-none">Prompt editor</h2>
        {#if mentions.length > 0}<p class="text-[10px] text-muted-foreground mt-0.5">
            Enter <span class="font-mono text-foreground/80">@</span> to insert a reference
          </p>{/if}
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-[11px] text-muted-foreground mr-2">{text.length} characters</span>
        <button
          type="button"
          onclick={() => editor?.wrapSelection("<d>", "</d>")}
          title="Wrap selection in <d>…</d>"
          class="p-1.5 rounded-md text-muted-foreground hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
          ><WrapText class="w-4 h-4" /></button
        >
        <button
          type="button"
          onclick={copyPrompt}
          title="Copy prompt"
          class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] transition-colors"
          ><Copy class="w-4 h-4" /></button
        >
        <button
          type="button"
          onclick={() => (text = "")}
          title="Clear"
          class="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
          ><Trash class="w-4 h-4" /></button
        >
        <button type="button" class="{BUTTON_SM} hover:bg-accent hover:text-accent-foreground" onclick={() => (open = false)}
          >Cancel</button
        >
        {#if onsaveandrun}<button
            type="button"
            onclick={handleSaveAndRun}
            title="Ctrl+Enter"
            class="{BUTTON_SM} shadow-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white border-0 font-semibold"
            >Save and run</button
          >{/if}
        <button
          type="button"
          onclick={handleSave}
          class="{BUTTON_SM} {onsaveandrun
            ? 'border shadow-xs bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50'
            : 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90'}">Save</button
        >
      </div>
    </div>
  {/snippet}

  <div class="flex-1 min-h-0 flex flex-col lg:flex-row gap-2 px-3 py-2">
    <div class="flex-1 min-h-0 flex flex-col gap-2">
      <div class="relative flex-1 min-h-0">
        <MentionTextarea
          bind:this={editor}
          value={text}
          onchange={(next) => (text = next)}
          onkeydown={handleKeyDownFs}
          {placeholder}
          {mentions}
          label="Expanded prompt"
          class="w-full h-full resize-none rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>
      <PromptQuality prompt={text} refsCount={mentions.length} class="shrink-0" />
    </div>

    <aside
      class="w-full lg:w-[300px] shrink-0 rounded-lg border border-border bg-[var(--surface-1)]/70 flex flex-col max-h-[38vh] lg:max-h-none p-5"
    >
      <div class="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface-2)]/60 border border-border mb-3 shrink-0">
        {#each [{ id: "insert", label: "Insert", icon: Tags }, { id: "history", label: "History", icon: History }, { id: "examples", label: "Examples", icon: Sparkles }] as tab (tab.id)}
          {@const Icon = tab.icon}
          <button
            type="button"
            onclick={() => (rightTab = tab.id as typeof rightTab)}
            class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors {rightTab ===
            tab.id
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
              : 'text-muted-foreground border border-transparent hover:text-foreground'}"
            ><Icon class="w-3.5 h-3.5" />{tab.label}</button
          >
        {/each}
      </div>

      {#if rightTab === "insert"}
        <div class="flex-1 overflow-y-auto space-y-4 min-h-0 px-1">
          <div class="space-y-1.5">
            {@render panelBlock(Tags, "References (insert tag)")}
            <div class="flex flex-wrap gap-1.5">
              {#each mentions as m (m.id)}<button
                  type="button"
                  onclick={() => insert(m.trigger)}
                  title={m.label}
                  class="px-2 py-1 rounded-md text-[10px] font-mono border border-border bg-[var(--surface-2)] hover:border-cyan-500/40 hover:text-cyan-300 transition-colors"
                  >{m.trigger.replace(/[<>]/g, "")}</button
                >{/each}
              {#if mentions.length === 0}<p class="text-[10px] text-muted-foreground/70">
                  Upload references on the generation tab.
                </p>{/if}
            </div>
          </div>
          <div class="space-y-1.5">
            {@render panelBlock(MessageSquareQuote, "Dialogue (spoken)")}
            <div class="space-y-1">
              <button
                type="button"
                onclick={() => insert("<d>hero's speech</d>")}
                class="w-full px-2 py-1.5 rounded-md text-[11px] border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
                >+ &lt;d&gt;…&lt;/d&gt;</button
              >
              <button
                type="button"
                onclick={() => editor?.wrapSelection("<d>", "</d>")}
                class="w-full px-2 py-1.5 rounded-md text-[11px] border border-amber-500/20 text-amber-300/80 hover:bg-amber-500/10 transition-colors"
                title="Select the text in the prompt and click">Wrap selection in &lt;d&gt;</button
              >
            </div>
          </div>
          <div class="space-y-1.5">
            {@render panelBlock(Camera, "Camera and light")}
            <div class="flex flex-wrap gap-1">
              {#each CAMERA_WORDS as w (w)}<button
                  type="button"
                  onclick={() => insert(w)}
                  class="px-1.5 py-0.5 rounded-full border border-border bg-[var(--surface-2)]/70 text-[10px] text-foreground/80 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors"
                  >{w}</button
                >{/each}
            </div>
          </div>
          <div class="space-y-1.5">
            {@render panelBlock(LayoutTemplate, "Scene Templates")}
            <div class="space-y-1">
              {#each SKELETONS as s (s.label)}<button
                  type="button"
                  onclick={() => insert(s.text)}
                  class="w-full text-left px-2 py-1.5 rounded-md text-[11px] border border-border bg-[var(--surface-2)]/70 text-foreground/85 hover:border-cyan-500/40 transition-colors"
                  >{s.label} <span class="text-muted-foreground/60">- insert skeleton</span></button
                >{/each}
            </div>
          </div>
        </div>
      {/if}

      {#if rightTab === "history"}
        <div class="flex-1 overflow-y-auto min-h-0 space-y-1">
          <div class="flex items-center justify-between px-1 py-1.5 border-b border-border sticky top-0 bg-[var(--surface-1)]">
            <span class="text-[10px] font-semibold text-foreground">History of prompts</span>
            {#if $history.entries.length > 0}<button
                type="button"
                onclick={() => usePromptHistory.getState().clear()}
                class="text-[9px] text-muted-foreground hover:text-red-400">clear everything</button
              >{/if}
          </div>
          {#if $history.entries.length === 0}<p class="px-2 py-4 text-[11px] text-muted-foreground text-center">
              While empty, launched prompts are saved here automatically.
            </p>{/if}
          {#each $history.entries as e (e.id)}<div
              class="group flex items-start gap-2 px-2 py-1.5 hover:bg-white/5 cursor-pointer rounded-md"
              role="button"
              tabindex="0"
              onclick={() => applyPrompt(e.text)}
              onkeydown={(ev) => ev.key === "Enter" && applyPrompt(e.text)}
            >
              <button
                type="button"
                onclick={(ev) => {
                  ev.stopPropagation();
                  usePromptHistory.getState().toggleFavorite(e.id);
                }}
                title={e.favorite ? "Remove from favorites" : "Add to favorites"}
                class="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center transition-colors {e.favorite
                  ? 'text-amber-400'
                  : 'text-muted-foreground/40 hover:text-amber-400'}"
                ><Star class="w-3 h-3" fill={e.favorite ? "currentColor" : "none"} /></button
              >
              <p class="flex-1 min-w-0 text-[11px] text-foreground/90 leading-snug line-clamp-2 break-words">{e.text}</p>
              <button
                type="button"
                onclick={(ev) => {
                  ev.stopPropagation();
                  usePromptHistory.getState().remove(e.id);
                }}
                class="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center text-muted-foreground/40 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove from history"><X class="w-3 h-3" /></button
              >
            </div>{/each}
        </div>
      {/if}

      {#if rightTab === "examples"}
        <div class="flex-1 overflow-y-auto min-h-0 space-y-1">
          <div class="px-1 py-1.5 border-b border-border sticky top-0 bg-[var(--surface-1)]">
            <span class="text-[10px] font-semibold text-foreground">Ready-made examples</span>
          </div>
          {#each EXAMPLES as ex (ex.title)}<div
              class="px-2 py-1.5 hover:bg-white/5 cursor-pointer rounded-md"
              role="button"
              tabindex="0"
              onclick={() => applyPrompt(ex.text)}
              onkeydown={(ev) => ev.key === "Enter" && applyPrompt(ex.text)}
            >
              <p class="text-[11px] font-medium text-foreground">{ex.title}</p>
              <p class="text-[10px] text-muted-foreground/80 line-clamp-2 leading-snug break-words">{ex.note}</p>
            </div>{/each}
          <p class="px-2 py-2 text-[9px] text-muted-foreground/60 border-t border-border mt-2">
            Replaces the current prompt. Prompts are in English: the model understands it best.
          </p>
        </div>
      {/if}
    </aside>
  </div>
</Modal>
