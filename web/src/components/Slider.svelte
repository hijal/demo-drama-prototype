<script lang="ts">
  /** Markup and classes of the Radix slider used by the Next.js studio
   *  (components/ui/slider.tsx + SettingSlider overrides); a transparent
   *  native range input on top keeps pointer and keyboard behaviour. */
  let {
    id,
    label,
    value,
    min,
    max,
    step = 1,
    disabled = false,
    onchange,
  }: {
    id?: string;
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    onchange: (value: number) => void;
  } = $props();
  const percent = $derived(
    max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0,
  );
</script>

<div
  data-slot="slider"
  class="relative flex w-full touch-none items-center select-none py-1 {disabled
    ? 'opacity-40 pointer-events-none'
    : ''}"
>
  <span data-slot="slider-track" class="bg-muted relative grow overflow-hidden rounded-full h-1.5 w-full">
    <span data-slot="slider-range" class="bg-primary absolute h-full" style:width={`${percent}%`}></span>
  </span>
  <span
    data-slot="slider-thumb"
    class="absolute block h-3.5 w-3.5 shrink-0 rounded-full border-0 bg-primary shadow-[0_0_8px_rgba(139,92,246,0.4)] hover:shadow-[0_0_12px_rgba(139,92,246,0.6)] transition-[color,box-shadow] pointer-events-none"
    style:left={`calc(${percent}% - ${(percent / 100) * 14}px)`}
  ></span>
  <input
    {id}
    type="range"
    aria-label={label}
    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0"
    {min}
    {max}
    {step}
    {value}
    {disabled}
    oninput={(e) => onchange(Number(e.currentTarget.value))}
  />
</div>
