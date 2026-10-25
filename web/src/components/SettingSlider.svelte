<script lang="ts">
  let {
    label,
    value,
    min,
    max,
    step = 1,
    inputMin = min,
    inputMax = max,
    onchange,
    hint = "",
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    inputMin?: number;
    inputMax?: number;
    onchange: (value: number) => void;
    hint?: string;
  } = $props();
  let draft = $state<string | null>(null);
  function commit() {
    if (draft === null) return;
    const n = parseFloat(draft.replace(",", "."));
    draft = null;
    if (Number.isFinite(n))
      onchange(
        Math.round(Math.max(inputMin, Math.min(inputMax, n)) / step) * step,
      );
  }
</script>

<div class="space-y-2">
  <div class="flex items-center justify-between gap-2">
    <label
      class="text-xs text-muted-foreground font-medium"
      for={`slider-${label}`}>{label}</label
    ><input
      class="h-6 w-16 shrink-0 rounded-md border border-border bg-[var(--surface-2)] px-1.5 text-right font-mono text-[11px] focus:outline-none focus:border-cyan-500/50"
      type="text"
      inputmode="decimal"
      aria-label={label}
      value={draft ?? String(value)}
      oninput={(e) => (draft = e.currentTarget.value)}
      onblur={commit}
      onkeydown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") draft = null;
      }}
    />
  </div>
  <input
    id={`slider-${label}`}
    type="range"
    class="w-full h-1.5 accent-cyan-500"
    {min}
    {max}
    {step}
    {value}
    oninput={(e) => onchange(Number(e.currentTarget.value))}
  />{#if hint}<p class="text-[10px] text-muted-foreground/60">{hint}</p>{/if}
</div>
