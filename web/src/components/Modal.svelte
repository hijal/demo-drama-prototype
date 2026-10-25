<script lang="ts">
  import type { Snippet } from "svelte";
  import { X } from "lucide-svelte";
  let {
    open = $bindable(false),
    title,
    children,
    wide = false,
    kind = "default",
    description = "",
    icon,
    header,
  }: {
    open?: boolean;
    title: string;
    children: Snippet;
    wide?: boolean;
    kind?:
      "default" | "settings" | "metadata" | "editor" | "reference" | "confirm";
    description?: string;
    icon?: Snippet;
    header?: Snippet;
  } = $props();
  let dialog = $state<HTMLDialogElement>();
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  data-slot="dialog-content"
  aria-label={title}
  class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 m-0 rounded-lg border border-border bg-[var(--surface-3)] text-foreground shadow-lg p-0 backdrop:bg-black/50 max-w-[96vw] max-h-[96vh] {kind ===
  'settings'
    ? 'w-[950px] h-[920px]'
    : kind === 'metadata'
      ? 'w-[512px] max-h-[80vh]'
      : kind === 'editor'
        ? 'w-[80vw] h-[85vh]'
        : kind === 'confirm'
          ? 'w-[384px]'
          : wide
            ? 'w-[950px]'
            : 'w-[512px]'}"
  onclose={() => (open = false)}
  oncancel={() => (open = false)}
  onclick={(e) => {
    if (e.target === dialog) {
      const r = dialog!.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        open = false;
    }
  }}
>
  <div
    class="flex flex-col max-h-[96vh] {kind === 'settings' ||
    kind === 'metadata' ||
    kind === 'editor'
      ? 'h-full'
      : 'p-6 gap-4'}"
  >
    {#if header}{@render header()}{:else}<header
        class="shrink-0 {kind === 'settings'
          ? 'px-6 pt-5 pb-2'
          : kind === 'metadata'
            ? 'px-4 py-3 border-b border-border'
            : kind === 'editor'
              ? 'px-4 pt-3 pb-2'
              : ''}"
      >
        <h2
          class="{kind === 'metadata'
            ? 'text-sm'
            : 'text-lg'} leading-none font-semibold flex items-center gap-2"
        >
          {#if icon}{@render icon()}{/if}{title}
        </h2>
        {#if description}<p class="text-sm text-muted-foreground mt-2">
            {description}
          </p>{/if}
      </header>{/if}
    {@render children()}
  </div>
  <button
    class="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-none"
    aria-label="Close dialog"
    onclick={() => (open = false)}><X class="size-4" /></button
  >
</dialog>
