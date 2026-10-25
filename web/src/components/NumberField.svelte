<script lang="ts">
  let {
    label,
    value,
    min,
    max,
    step = 1,
    onchange,
    hint = '',
  }: {
    label: string
    value: number
    min: number
    max: number
    step?: number
    onchange: (value: number) => void
    hint?: string
  } = $props()
  function commit(raw: string) {
    const n = Number(raw)
    if (raw.trim() && Number.isFinite(n))
      onchange(Math.max(min, Math.min(max, n)))
  }
</script>

<label class="field"
  ><span>{label}</span><input
    type="number"
    {min}
    {max}
    {step}
    {value}
    onchange={(e) => commit(e.currentTarget.value)}
  />{#if hint}<small>{hint}</small>{/if}</label
>
