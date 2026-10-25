<script lang="ts">
  import PromptHighlight from "./PromptHighlight.svelte";
  import Modal from "./Modal.svelte";
  import PromptQuality from "./PromptQuality.svelte";
  import {
    Tags,
    MessageSquareQuote,
    Camera,
    LayoutTemplate,
    Copy,
    Trash2,
    WrapText,
    History,
    Sparkles,
    Star,
  } from "lucide-svelte";
  import { CAMERA_WORDS, EXAMPLES } from "@/lib/prompt-examples";
  import { usePromptHistory } from "@/lib/prompt-history-store";
  import type { VideoRefItem } from "@/lib/gen-store";
  import { readable } from "../lib/store";
  import { toast } from "@/lib/notifications";
  let {
    open = $bindable(false),
    prompt,
    refs,
    tagFor,
    onsave,
    onrun,
  }: {
    open?: boolean;
    prompt: string;
    refs: VideoRefItem[];
    tagFor: (ref: VideoRefItem) => string;
    onsave: (text: string) => void;
    onrun?: () => void;
  } = $props();
  let text = $state(""),
    tab = $state("Insert"),
    textarea = $state<HTMLTextAreaElement>();
  const history = readable(usePromptHistory);
  $effect(() => {
    if (open) text = prompt;
  });
  function insert(snippet: string, wrap = false) {
    const start = textarea?.selectionStart ?? text.length,
      end = textarea?.selectionEnd ?? start;
    const value = wrap ? `<d>${text.slice(start, end)}</d>` : snippet;
    text = text.slice(0, start) + value + text.slice(end);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + value.length, start + value.length);
    });
  }
  function save(run = false) {
    onsave(text);
    open = false;
    if (run) onrun?.();
  }
  const skeletons = [
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
  const chip =
    "px-2 py-1 rounded-md text-[10px] font-mono border border-border bg-[var(--surface-2)] hover:border-cyan-500/40 hover:text-cyan-300";
</script>

<Modal bind:open title="Prompt editor" kind="editor">
  {#snippet header()}<header
      class="px-4 pt-3 pb-2 border-b border-border shrink-0 flex items-center justify-between"
    >
      <div>
        <h2 class="text-base font-semibold">Prompt editor</h2>
        {#if refs.length}<p class="text-[10px] text-muted-foreground mt-0.5">
            Enter @ to insert a reference
          </p>{/if}
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-[11px] text-muted-foreground mr-2"
          >{text.length} characters</span
        ><button
          class="p-1.5 rounded-md text-muted-foreground hover:text-amber-300"
          title="Wrap selection in <d>…</d>"
          onclick={() => insert("", true)}><WrapText class="w-4 h-4" /></button
        ><button
          class="p-1.5 rounded-md text-muted-foreground hover:text-foreground"
          title="Copy prompt"
          onclick={async () => {
            await navigator.clipboard.writeText(text);
            toast.success("Prompt copied to clipboard");
          }}><Copy class="w-4 h-4" /></button
        ><button
          class="p-1.5 rounded-md text-muted-foreground hover:text-red-400"
          title="Clear"
          onclick={() => (text = "")}><Trash2 class="w-4 h-4" /></button
        ><button
          class="px-3 h-8 text-xs rounded-md hover:bg-accent"
          onclick={() => (open = false)}>Cancel</button
        >{#if onrun}<button
            class="px-3 h-8 text-xs rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold"
            onclick={() => save(true)}>Save and run</button
          >{/if}<button
          class="px-3 h-8 text-xs rounded-md border border-border bg-input/30"
          onclick={() => save()}>Save</button
        >
      </div>
    </header>{/snippet}
  <div class="flex-1 min-h-0 flex flex-col lg:flex-row gap-2 px-3 py-2">
    <div class="flex-1 min-h-0 flex flex-col gap-2">
      <div class="relative flex-1 min-h-0">
        <PromptHighlight {text} element={textarea} /><textarea
          aria-label="Expanded prompt"
          bind:this={textarea}
          bind:value={text}
          class="relative w-full h-full resize-none rounded-lg bg-transparent text-transparent caret-cyan-300 border border-border px-3 py-2 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Enter or edit prompt..."
          onkeydown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.stopPropagation();
              e.preventDefault();
              save(!!onrun);
            }
          }}></textarea>
      </div>
      <PromptQuality prompt={text} {refs} />
    </div>
    <aside
      class="w-full lg:w-[300px] shrink-0 rounded-lg border border-border bg-[var(--surface-1)]/70 flex flex-col max-h-[38vh] lg:max-h-none p-5"
    >
      <div
        class="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface-2)]/60 border border-border mb-3 shrink-0"
      >
        {#each [{ name: "Insert", icon: Tags }, { name: "History", icon: History }, { name: "Examples", icon: Sparkles }] as item}<button
            class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium {tab ===
            item.name
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
              : 'border border-transparent text-muted-foreground'}"
            onclick={() => (tab = item.name)}
            ><item.icon class="w-3.5 h-3.5" />{item.name}</button
          >{/each}
      </div>
      <div class="flex-1 overflow-y-auto min-h-0 space-y-4">
        {#if tab === "Insert"}<div class="space-y-1.5">
            <div
              class="flex items-center gap-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide"
            >
              <Tags class="w-3.5 h-3.5" />References
            </div>
            <div class="flex flex-wrap gap-1">
              {#each refs as ref}<button
                  class={chip}
                  onclick={() => insert(tagFor(ref))}
                  >{tagFor(ref).replace(/[<>]/g, "")}</button
                >{:else}<p class="text-[10px] text-muted-foreground/70">
                  Upload references on the generation tab.
                </p>{/each}
            </div>
          </div>
          <div class="space-y-1.5">
            <div
              class="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-wide"
            >
              <MessageSquareQuote class="w-3.5 h-3.5" />Dialogue (spoken)
            </div>
            <button
              class="w-full px-2 py-1.5 rounded-md text-[11px] border border-amber-500/30 bg-amber-500/10 text-amber-300"
              onclick={() => insert("<d>hero's speech</d>")}
              >+ &lt;d&gt;…&lt;/d&gt;</button
            ><button
              class="w-full px-2 py-1.5 rounded-md text-[11px] border border-amber-500/20 text-amber-300/80"
              onclick={() => insert("", true)}
              >Wrap selection in &lt;d&gt;</button
            >
          </div>
          <div class="space-y-1.5">
            <div
              class="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-wide"
            >
              <Camera class="w-3.5 h-3.5" />Camera and light
            </div>
            <div class="flex flex-wrap gap-1">
              {#each CAMERA_WORDS as word}<button
                  class="px-1.5 py-0.5 rounded-full border border-border bg-[var(--surface-2)]/70 text-[10px] text-foreground/80 hover:border-cyan-500/40 hover:text-cyan-300"
                  onclick={() => insert(word)}>{word}</button
                >{/each}
            </div>
          </div>
          <div class="space-y-1.5">
            <div
              class="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-wide"
            >
              <LayoutTemplate class="w-3.5 h-3.5" />Scene Templates
            </div>
            {#each skeletons as item}<button
                class="w-full text-left px-2 py-1.5 rounded-md text-[11px] border border-border bg-[var(--surface-2)]/70 text-foreground/85 hover:border-cyan-500/40"
                onclick={() => insert(item.text)}
                >{item.label}
                <span class="text-muted-foreground/60">- insert skeleton</span
                ></button
              >{/each}
          </div>
        {:else if tab === "History"}<div
            class="flex justify-between text-[10px] border-b border-border pb-2"
          >
            <span>History of prompts</span><button
              class="text-muted-foreground hover:text-red-400"
              onclick={() => usePromptHistory.getState().clear()}
              >clear everything</button
            >
          </div>
          {#each $history.entries as entry}<div class="flex items-start gap-2">
              <button
                aria-label="Toggle favorite"
                onclick={() =>
                  usePromptHistory.getState().toggleFavorite(entry.id)}
                ><Star
                  class="w-3 h-3"
                  fill={entry.favorite ? "currentColor" : "none"}
                /></button
              ><button
                class="flex-1 text-left text-[11px] line-clamp-4"
                onclick={() => (text = entry.text)}>{entry.text}</button
              ><button
                aria-label="Remove prompt"
                onclick={() => usePromptHistory.getState().remove(entry.id)}
                ><Trash2 class="w-3 h-3" /></button
              >
            </div>{:else}<p
              class="text-[11px] text-muted-foreground text-center"
            >
              While empty, launched prompts are saved here automatically.
            </p>{/each}
        {:else}{#each EXAMPLES as example}<button
              class="w-full text-left p-2 rounded-md hover:bg-white/5 border border-border"
              onclick={() => (text = example.text)}
              ><span class="text-[11px] font-medium">{example.title}</span>
              <p class="text-[10px] text-muted-foreground line-clamp-3">
                {example.note}
              </p></button
            >{/each}{/if}
      </div>
    </aside>
  </div>
</Modal>
