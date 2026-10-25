<script lang="ts">
  import Slider from "./Slider.svelte";
  let {
    label,
    value,
    min,
    max,
    step = 1,
    inputMin,
    inputMax,
    inputHint,
    formatValue,
    unit,
    disabled = false,
    onchange,
    hint = "",
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    /** Manual-input bounds; the input is shown only when one is given. */
    inputMin?: number;
    inputMax?: number;
    inputHint?: string;
    formatValue?: (value: number) => string;
    unit?: string;
    disabled?: boolean;
    onchange: (value: number) => void;
    hint?: string;
  } = $props();
  const safeValue = $derived(typeof value === "number" && !isNaN(value) ? value : min);
  const manual = $derived(inputMin !== undefined || inputMax !== undefined);
  const inMin = $derived(inputMin ?? min);
  const inMax = $derived(inputMax ?? max);
  const outOfSlider = $derived(safeValue < min || safeValue > max);
  let draft = $state<string | null>(null);
  function commit() {
    if (draft === null) return;
    const n = Number.parseFloat(draft.replace(",", "."));
    draft = null;
    if (!Number.isFinite(n)) return;
    let v = Math.min(inMax, Math.max(inMin, n));
    if (step > 0) v = Math.round(v / step) * step;
    v = Math.round(v * 10000) / 10000;
    if (v !== safeValue) onchange(v);
  }
</script>

<div class="space-y-2">
  <div class="flex items-center justify-between gap-2">
    <span class="flex items-center gap-2 text-xs leading-none select-none text-muted-foreground font-medium"
      >{label}</span
    >
    {#if manual}<input
        type="text"
        inputmode="decimal"
        aria-label={`${label}: manual input (${inMin}–${inMax})`}
        title={inputHint || `Acceptable ${inMin}–${inMax}`}
        value={draft ?? String(safeValue)}
        oninput={(e) => (draft = e.currentTarget.value)}
        onfocus={(e) => {
          draft = null;
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onblur={commit}
        onkeydown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            draft = null;
            e.currentTarget.blur();
          }
        }}
        {disabled}
        class="h-6 w-16 shrink-0 rounded-md border bg-[var(--surface-2)] px-1.5 text-right font-mono text-xs tabular-nums focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 {outOfSlider
          ? 'border-amber-500/50 text-amber-300'
          : 'border-border text-foreground/80'} {disabled ? 'opacity-40 pointer-events-none' : ''}"
      />{:else}<span
        class="text-xs font-mono tabular-nums {outOfSlider ? 'text-amber-300' : 'text-foreground/80'}"
        title={outOfSlider ? "Out of slider range (manual input)" : undefined}
        >{formatValue ? formatValue(safeValue) : safeValue}{unit ? ` ${unit}` : ""}</span
      >{/if}
  </div>
  <Slider {label} value={safeValue} {min} {max} {step} {disabled} {onchange} />
  {#if hint}<p class="text-[10px] text-muted-foreground/60">{hint}</p>{/if}
</div>
