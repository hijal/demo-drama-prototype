<script lang="ts">
  let {
    text,
    element,
    height,
  }: {
    text: string;
    element: HTMLTextAreaElement | undefined;
    height?: number;
  } = $props();
  let backdrop = $state<HTMLPreElement>();
  const parts = $derived(
    text.split(
      /(<(?:Picture|Video|Audio|Subject|Scene|Location) \d+>|<d>[\s\S]*?<\/d>|<\/?d>)/g,
    ),
  );
  function color(part: string) {
    if (part.startsWith("<Picture")) return "bg-purple-500/25 text-purple-200";
    if (part.startsWith("<Video")) return "bg-cyan-500/25 text-cyan-200";
    if (part.startsWith("<Audio")) return "bg-emerald-500/25 text-emerald-200";
    if (part.startsWith("<Subject")) return "bg-pink-500/25 text-pink-200";
    if (/^<(Scene|Location)/.test(part)) return "bg-sky-500/25 text-sky-200";
    if (part.startsWith("<d>") && part.endsWith("</d>"))
      return "bg-amber-500/25 text-amber-200";
    if (/^<\/?d>$/.test(part)) return "bg-amber-500/20 text-amber-300/60";
    return "";
  }
  $effect(() => {
    if (!element) return;
    const target = element;
    function sync() {
      if (backdrop) {
        backdrop.scrollTop = target.scrollTop;
        backdrop.scrollLeft = target.scrollLeft;
      }
    }
    target.addEventListener("scroll", sync);
    sync();
    return () => target.removeEventListener("scroll", sync);
  });
</script>

<pre
  bind:this={backdrop}
  style:height={height ? `${height}px` : undefined}
  aria-hidden="true"
  class="absolute inset-0 m-0 overflow-hidden pointer-events-none whitespace-pre-wrap break-words rounded-lg border border-border bg-[var(--surface-2)] px-3 py-2 text-sm leading-relaxed font-mono text-foreground">{#each parts as part}<span
      class="rounded {color(part)}">{part}</span
    >{/each}{"\n"}</pre>
