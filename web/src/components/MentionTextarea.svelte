<script lang="ts" module>
  export interface MentionItem {
    id: string;
    label: string;
    trigger: string;
    kind: string;
    color?: string;
    previewUrl?: string;
  }
</script>

<script lang="ts">
  let {
    value,
    onchange,
    onkeydown,
    placeholder,
    class: className = "",
    mentions = [],
    label = "Prompt",
  }: {
    value: string;
    onchange: (value: string) => void;
    onkeydown?: (e: KeyboardEvent) => void;
    placeholder?: string;
    class?: string;
    mentions?: MentionItem[];
    label?: string;
  } = $props();

  const TEXT_CLASSES =
    "w-full rounded-md border border-border bg-[var(--surface-2)] px-3 py-2 text-sm font-mono leading-relaxed text-foreground placeholder:text-muted-foreground/50 min-h-[200px] resize-none";
  const POPUP_WIDTH = 288;
  const PREVIEW_W = 220;
  const PREVIEW_H = 130;
  const MIN_H = 150;
  const MAX_H = Math.ceil(15 * 22.75) + 18;

  let textarea = $state<HTMLTextAreaElement>();
  let backdrop = $state<HTMLPreElement>();
  let popup = $state<HTMLDivElement>();
  let showPopup = $state(false);
  let filter = $state("");
  let selectedIndex = $state(0);
  let atPosition = $state(-1);
  let caretPos = $state<{ top: number; left: number } | null>(null);
  let hoverTag = $state<{ kind: "image" | "video"; index: number; anchor: HTMLElement } | null>(null);
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let height = $state<number | null>(null);
  let autoH = $state<number | null>(null);
  let isResizing = $state(false);
  let isHovering = $state(false);
  const isFullHeight = $derived(className.includes("h-full"));
  const effectiveH = $derived(isFullHeight ? null : (height ?? autoH));

  /** Same split as renderHighlightedPrompt in the Next.js studio. */
  const parts = $derived(
    value.split(
      /(<(?:Picture|Video|Audio) \d+>|<Subject \d+>|<Scene \d+>|<Location \d+>|<d>[\s\S]*?<\/d>|<d>|<\/d>)/g,
    ),
  );
  function partClass(p: string) {
    if (/^<(?:Picture|Video|Audio) \d+>$/.test(p))
      return p.startsWith("<Video")
        ? "rounded bg-cyan-500/25 text-cyan-200"
        : p.startsWith("<Audio")
          ? "rounded bg-emerald-500/25 text-emerald-200"
          : "rounded bg-purple-500/25 text-purple-200";
    if (/^<Subject \d+>$/.test(p)) return "rounded bg-pink-500/25 text-pink-200";
    if (/^<(?:Scene|Location) \d+>$/.test(p)) return "rounded bg-sky-500/25 text-sky-200";
    if (/^<d>[\s\S]*<\/d>$/.test(p)) return "rounded bg-amber-500/25 text-amber-200";
    if (p === "<d>" || p === "</d>") return "rounded bg-amber-500/20 text-amber-300/60";
    return "";
  }
  function mentionAttr(p: string) {
    const m = p.match(/^<(Picture|Video) (\d+)>$/);
    return m ? (m[1] === "Picture" ? `image-${m[2]}` : `video-${m[2]}`) : undefined;
  }
  function parseMentionTag(text: string): { kind: "image" | "video"; index: number } | null {
    const m = text.match(/^<(Picture|Video) (\d+)>$/);
    if (!m) return null;
    return { kind: m[1] === "Picture" ? "image" : "video", index: parseInt(m[2], 10) };
  }

  const filteredMentions = $derived(
    mentions.filter(
      (m) =>
        m.trigger.toLowerCase().includes(filter.toLowerCase()) ||
        m.label.toLowerCase().includes(filter.toLowerCase()),
    ),
  );
  $effect(() => {
    if (!showPopup) {
      filter = "";
      selectedIndex = 0;
    }
  });
  $effect(() => {
    const n = filteredMentions.length;
    selectedIndex = Math.min(selectedIndex, Math.max(0, n - 1));
  });

  function getCaretPosition(el: HTMLTextAreaElement) {
    const styles = window.getComputedStyle(el);
    const mirror = document.createElement("div");
    for (const p of [
      "boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight",
      "textTransform", "textIndent", "wordSpacing", "tabSize",
    ] as const)
      (mirror.style as unknown as Record<string, string>)[p] = (styles as unknown as Record<string, string>)[p];
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.overflowWrap = "break-word";
    document.body.appendChild(mirror);
    const pos = el.selectionStart ?? 0;
    mirror.textContent = el.value.slice(0, pos);
    const marker = document.createElement("span");
    marker.textContent = el.value.slice(pos, pos + 1) || ".";
    mirror.appendChild(marker);
    const top = marker.offsetTop - el.scrollTop;
    const left = marker.offsetLeft - el.scrollLeft;
    const lineHeight = parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.4 || 20;
    document.body.removeChild(mirror);
    return { top, left, lineHeight };
  }
  function updateCaretCoords(itemCount: number) {
    const el = textarea;
    if (!el) return;
    const { top, left, lineHeight } = getCaretPosition(el);
    const estHeight = Math.min(26 + itemCount * 40 + 8, 234);
    let y = top + lineHeight + 4;
    if (y + estHeight > el.clientHeight) y = Math.max(2, top - estHeight - 6);
    const x = Math.min(Math.max(4, left), Math.max(4, el.clientWidth - POPUP_WIDTH - 8));
    caretPos = { top: y, left: x };
  }
  function handleInsert(mention: MentionItem) {
    const cursorPos = textarea?.selectionStart ?? value.length;
    const before = value.slice(0, atPosition);
    const after = value.slice(cursorPos);
    onchange(before + mention.trigger + " " + after);
    showPopup = false;
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      const pos = before.length + mention.trigger.length + 1;
      textarea.setSelectionRange(pos, pos);
    });
  }
  function evaluateAtCaret() {
    const el = textarea;
    if (!el || mentions.length === 0) return;
    const cursorPos = el.selectionStart ?? el.value.length;
    const textBeforeCursor = el.value.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf("@");
    if (lastAt === -1) {
      showPopup = false;
      return;
    }
    const textAfterAt = textBeforeCursor.slice(lastAt + 1);
    if (textAfterAt.includes(" ") || textAfterAt.includes("\n") || textAfterAt.length > 30) {
      showPopup = false;
      return;
    }
    showPopup = true;
    filter = textAfterAt;
    atPosition = lastAt;
    updateCaretCoords(mentions.length);
  }
  function handleKeyDownLocal(e: KeyboardEvent) {
    if (showPopup && filteredMentions.length > 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % filteredMentions.length;
          return;
        case "ArrowUp":
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + filteredMentions.length) % filteredMentions.length;
          return;
        case "Enter":
          if (e.ctrlKey || e.metaKey || e.altKey) break;
          e.preventDefault();
          if (filteredMentions[selectedIndex]) handleInsert(filteredMentions[selectedIndex]);
          return;
        case "Escape":
          e.preventDefault();
          showPopup = false;
          return;
        case "Tab":
          e.preventDefault();
          if (filteredMentions[selectedIndex]) handleInsert(filteredMentions[selectedIndex]);
          return;
      }
    }
    onkeydown?.(e);
  }
  function syncScroll() {
    if (backdrop && textarea) {
      backdrop.scrollTop = textarea.scrollTop;
      backdrop.scrollLeft = textarea.scrollLeft;
    }
  }
  function findMentionAtPoint(x: number, y: number) {
    if (!backdrop) return null;
    for (const span of Array.from(backdrop.querySelectorAll<HTMLElement>("[data-mention]"))) {
      const r = span.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const m = span.dataset.mention?.match(/^(image|video)-(\d+)$/);
        if (m) return { kind: m[1] as "image" | "video", index: parseInt(m[2], 10), anchor: span };
      }
    }
    return null;
  }
  function handleMouseMove(e: MouseEvent) {
    const hit = findMentionAtPoint(e.clientX, e.clientY);
    if (hit) {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      hoverTag = hit;
    } else if (hoverTag && !hoverTimer) {
      hoverTimer = setTimeout(() => {
        hoverTag = null;
        hoverTimer = null;
      }, 120);
    }
  }
  function handleMouseLeave() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    hoverTag = null;
  }
  const hoverMention = $derived(
    hoverTag
      ? mentions.find((m) => {
          const parsed = parseMentionTag(m.trigger);
          return parsed && parsed.kind === hoverTag!.kind && parsed.index === hoverTag!.index;
        })
      : undefined,
  );
  const hoverPosition = $derived.by(() => {
    if (!hoverTag || !hoverMention?.previewUrl) return null;
    const r = hoverTag.anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const GAP = 8,
      MARGIN = 8;
    let left = r.right + GAP;
    if (left + PREVIEW_W + MARGIN > vw) left = r.left - PREVIEW_W - GAP;
    left = Math.max(MARGIN, Math.min(left, vw - PREVIEW_W - MARGIN));
    let top = r.bottom + GAP;
    if (top + PREVIEW_H + MARGIN > window.innerHeight) top = r.top - PREVIEW_H - GAP;
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - PREVIEW_H - MARGIN));
    return { top, left };
  });
  let previewLoaded = $state(false),
    previewFailed = $state(false);
  $effect(() => {
    hoverMention?.previewUrl;
    previewLoaded = false;
    previewFailed = false;
  });

  /** Auto height (150–360 px) until the user drags the resize handle. */
  $effect(() => {
    value;
    if (height !== null || isFullHeight || !textarea) return;
    const prev = textarea.style.height;
    textarea.style.height = "auto";
    autoH = Math.min(Math.max(textarea.scrollHeight + 2, 150), MAX_H);
    textarea.style.height = prev;
  });
  function handleResizeStart(e: PointerEvent) {
    e.preventDefault();
    if (!textarea) return;
    const start = { y: e.clientY, h: textarea.getBoundingClientRect().height };
    isResizing = true;
    const onMove = (ev: PointerEvent) => {
      height = Math.max(MIN_H, Math.min(MAX_H, start.h + (ev.clientY - start.y)));
    };
    const onUp = () => {
      isResizing = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  export function insertAtCursor(text: string) {
    const el = textarea;
    if (!el) {
      onchange(value + (value.endsWith(" ") || value === "" ? "" : " ") + text);
      return;
    }
    const pos = el.selectionStart ?? value.length;
    const before = value.slice(0, pos),
      after = value.slice(pos);
    const pad = before !== "" && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
    onchange(before + pad + text + after);
    requestAnimationFrame(() => {
      el.focus();
      const p = (before + pad + text).length;
      el.setSelectionRange(p, p);
    });
  }
  export function wrapSelection(open: string, close: string) {
    const el = textarea;
    if (!el) {
      onchange(value + (value ? " " : "") + open + "hero's speech" + close);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const inner = value.slice(start, end) || "hero's speech";
    onchange(value.slice(0, start) + open + inner + close + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const s = start + open.length;
      el.setSelectionRange(s, s + inner.length);
    });
  }
  export function focus() {
    textarea?.focus();
  }
</script>

<svelte:document
  onmousedown={(e) => {
    if (popup && !popup.contains(e.target as Node) && textarea && !textarea.contains(e.target as Node))
      showPopup = false;
  }}
/>

<div class="relative w-full {isFullHeight ? 'h-full' : ''}">
  <pre
    aria-hidden="true"
    bind:this={backdrop}
    class="{TEXT_CLASSES} absolute inset-0 m-0 overflow-hidden pointer-events-none whitespace-pre-wrap break-words border-border {isFullHeight
      ? 'h-full'
      : ''} {className}"
    style:height={effectiveH ? `${effectiveH}px` : undefined}
    style:overflow-y={effectiveH ? "auto" : undefined}
    style:overflow-x={effectiveH ? "hidden" : undefined}>{#each parts as p}{#if p}<span
          class={partClass(p)}
          data-mention={mentionAttr(p)}>{p}</span
        >{/if}{/each}{"\n"}</pre>
  <textarea
    bind:this={textarea}
    aria-label={label}
    {value}
    oninput={(e) => {
      onchange(e.currentTarget.value);
      evaluateAtCaret();
    }}
    onkeydown={handleKeyDownLocal}
    onkeyup={(e) => {
      if (!e.ctrlKey && !e.metaKey && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
        evaluateAtCaret();
    }}
    onclick={evaluateAtCaret}
    onscroll={syncScroll}
    onmousemove={handleMouseMove}
    onmouseleave={handleMouseLeave}
    {placeholder}
    class="{TEXT_CLASSES} relative bg-transparent text-transparent caret-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 {className}"
    rows={6}
    style:height={effectiveH ? `${effectiveH}px` : undefined}
    style:overflow-y={effectiveH ? "auto" : undefined}
    style:overflow-x={effectiveH ? "hidden" : undefined}
  ></textarea>

  {#if hoverMention?.previewUrl && hoverPosition && !previewFailed}<div
      class="fixed z-[9999] pointer-events-none rounded-xl overflow-hidden bg-[var(--surface-2)] border border-border/80 shadow-2xl shadow-black/50"
      style:top={`${hoverPosition.top}px`}
      style:left={`${hoverPosition.left}px`}
      style:width={`${PREVIEW_W}px`}
      style:height={`${PREVIEW_H}px`}
      aria-hidden="true"
    >
      <div class="w-full h-full relative">
        {#if !previewLoaded}<div class="absolute inset-0 flex items-center justify-center bg-[var(--surface-3)]">
            <div class="w-4 h-4 rounded-full border-2 border-cyan-400/40 border-t-cyan-400 animate-spin"></div>
          </div>{/if}
        {#if hoverTag?.kind === "video"}<video
            src={hoverMention.previewUrl}
            muted
            autoplay
            loop
            playsinline
            preload="auto"
            class="w-full h-full object-cover transition-opacity duration-150 {previewLoaded ? 'opacity-100' : 'opacity-0'}"
            onloadeddata={() => (previewLoaded = true)}
            onerror={() => (previewFailed = true)}
            draggable="false"
          ></video>{:else}<img
            src={hoverMention.previewUrl}
            alt={hoverMention.label || "preview"}
            class="w-full h-full object-cover transition-opacity duration-150 {previewLoaded ? 'opacity-100' : 'opacity-0'}"
            onload={() => (previewLoaded = true)}
            onerror={() => (previewFailed = true)}
            draggable="false"
          />{/if}
        {#if hoverTag?.kind === "video" && previewLoaded}<div
            class="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[9px] font-medium"
          >
            Video
          </div>{/if}
        {#if hoverMention.label && previewLoaded}<div
            class="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent"
          >
            <p class="text-[10px] text-white/90 truncate">{hoverMention.label}</p>
          </div>{/if}
      </div>
    </div>{/if}

  {#if !isFullHeight}<div
      role="separator"
      aria-label="Resize prompt"
      onpointerdown={handleResizeStart}
      onmouseenter={() => (isHovering = true)}
      onmouseleave={() => (isHovering = false)}
      class="absolute bottom-0 left-2 right-2 h-2 -mb-1 cursor-row-resize flex items-center justify-center z-10 rounded-b-md transition-colors {isResizing
        ? 'bg-cyan-500/40'
        : isHovering
          ? 'bg-cyan-500/25'
          : 'bg-transparent'}"
    >
      <div
        class="w-10 h-0.5 rounded-full transition-colors {isResizing
          ? 'bg-cyan-400'
          : isHovering
            ? 'bg-cyan-400/60'
            : 'bg-transparent'}"
      ></div>
    </div>{/if}

  {#if showPopup && filteredMentions.length > 0 && caretPos}<div
      bind:this={popup}
      style:top={`${caretPos.top}px`}
      style:left={`${caretPos.left}px`}
      style:width={`${POPUP_WIDTH}px`}
      class="absolute z-50 rounded-lg border border-border bg-[var(--surface-3)] shadow-2xl shadow-black/60 overflow-hidden"
    >
      <div class="px-2.5 py-1.5 text-[10px] text-muted-foreground/70 border-b border-border/50">Select reference</div>
      <div class="max-h-48 overflow-y-auto py-1">
        {#each filteredMentions as m, i (m.id)}<button
            type="button"
            onclick={() => handleInsert(m)}
            onmouseenter={() => (selectedIndex = i)}
            class="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors {i === selectedIndex
              ? 'bg-cyan-500/15'
              : 'hover:bg-white/5'}"
          >
            {#if m.previewUrl}<img
                src={m.previewUrl}
                alt=""
                class="w-5 h-5 shrink-0 rounded object-cover border border-border"
              />{:else}<span
                class="inline-flex items-center justify-center w-5 h-5 shrink-0 rounded text-[10px] font-medium {m.color ||
                  'bg-purple-500/15 text-purple-400'}"
                >{m.kind === "image" ? "🖼" : m.kind === "video" ? "🎬" : "🎵"}</span
              >{/if}
            <span class="flex-1 min-w-0">
              <span
                class="block text-xs font-medium truncate {i === selectedIndex
                  ? 'text-foreground'
                  : 'text-foreground/90'}">{m.trigger.replace(/[<>]/g, "")}</span
              >
              <span class="block text-[10px] text-muted-foreground/70 truncate">{m.label}</span>
            </span>
            {#if i === selectedIndex}<span class="shrink-0 text-[9px] text-cyan-400/70 font-mono">↵</span>{/if}
          </button>{/each}
      </div>
    </div>{/if}
</div>
