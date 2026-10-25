<script lang="ts">
  import { Check, ChevronDown } from "lucide-svelte";
  let {
    id,
    label,
    value,
    options,
    disabled = false,
    onchange,
  }: {
    id?: string;
    label: string;
    value: string;
    options: (string | { value: string; label: string })[];
    disabled?: boolean;
    onchange: (value: string) => void;
  } = $props();
  const uid = $props.id();
  const items = $derived(
    options.map((option) =>
      typeof option === "string" ? { value: option, label: option } : option,
    ),
  );
  let trigger = $state<HTMLButtonElement>(),
    list = $state<HTMLDivElement>(),
    expanded = $state(false),
    left = $state(0),
    top = $state(0),
    width = $state(0);
  function open() {
    if (!trigger || !list) return;
    const rect = trigger.getBoundingClientRect();
    left = Math.min(rect.left, innerWidth - rect.width - 4);
    top = Math.min(
      rect.bottom + 4,
      innerHeight - Math.min(280, items.length * 32 + 8) - 4,
    );
    width = rect.width;
    list.showPopover();
    requestAnimationFrame(() =>
      list
        ?.querySelector<HTMLButtonElement>(
          `[data-index="${Math.max(
            0,
            items.findIndex((item) => item.value === value),
          )}"]`,
        )
        ?.focus(),
    );
  }
  function choose(next: string) {
    onchange(next);
    list?.hidePopover();
    trigger?.focus();
  }
  function navigate(e: KeyboardEvent) {
    if (e.key === " ") return;
    const index = Number(
      (document.activeElement as HTMLElement)?.dataset.index || 0,
    );
    let next = index;
    if (e.key === "ArrowDown") next = (index + 1) % items.length;
    else if (e.key === "ArrowUp")
      next = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key.length === 1) {
      const found = items.findIndex(
        (item, i) =>
          i > index && item.label.toLowerCase().startsWith(e.key.toLowerCase()),
      );
      next =
        found >= 0
          ? found
          : items.findIndex((item) =>
              item.label.toLowerCase().startsWith(e.key.toLowerCase()),
            );
    } else return;
    e.preventDefault();
    list?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
  }
</script>

<button
  {id}
  bind:this={trigger}
  type="button"
  role="combobox"
  aria-label={label}
  aria-expanded={expanded}
  aria-controls={uid}
  aria-haspopup="listbox"
  {disabled}
  class="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-[var(--surface-2)] px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 h-9"
  onclick={open}
  onkeydown={(e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      open();
    }
  }}
  ><span class="truncate"
    >{items.find((item) => item.value === value)?.label || value}</span
  ><ChevronDown class="size-4 opacity-50 shrink-0" /></button
>
<div
  id={uid}
  bind:this={list}
  popover
  role="listbox"
  tabindex="-1"
  aria-label={label}
  ontoggle={(e) => (expanded = e.newState === "open")}
  onkeydown={navigate}
  style:left={`${left}px`}
  style:top={`${top}px`}
  style:width={`${width}px`}
  class="fixed m-0 p-1 max-h-[280px] overflow-y-auto rounded-md border border-border bg-[var(--surface-3)] text-foreground shadow-md z-[100]"
>
  {#each items as item, index}<button
      type="button"
      role="option"
      aria-selected={item.value === value}
      data-index={index}
      tabindex="-1"
      class="relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground hover:bg-accent"
      onclick={() => choose(item.value)}
      >{item.label}{#if item.value === value}<span
          class="absolute right-2 flex size-3.5 items-center justify-center"
          ><Check class="size-4" /></span
        >{/if}</button
    >{/each}
</div>
