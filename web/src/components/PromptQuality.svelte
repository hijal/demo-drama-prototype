<script lang="ts">
  import type { VideoRefItem } from '@/lib/gen-store'
  let { prompt, refs }: { prompt: string; refs: VideoRefItem[] } = $props()
  const hints = $derived.by(() => {
    if (!prompt.trim()) return []
    const result: string[] = []
    const tags = [...prompt.matchAll(/<(Picture|Video|Audio)\s+(\d+)>/g)]
    if (refs.length && !tags.length)
      result.push('Use @ to link your references to the prompt.')
    for (const [tag, kind, number] of tags) {
      const count = refs.filter(
        (ref) =>
          ref.kind ===
          (
            { Picture: 'image', Video: 'video', Audio: 'audio' } as Record<
              string,
              string
            >
          )[kind],
      ).length
      if (Number(number) < 1 || Number(number) > count)
        result.push(`${tag} does not match an uploaded reference.`)
    }
    if (
      (prompt.match(/<d>/g) || []).length !==
      (prompt.match(/<\/d>/g) || []).length
    )
      result.push('Balance opening <d> and closing </d> dialogue tags.')
    if (
      [...prompt.matchAll(/<d>([\s\S]*?)<\/d>/g)].some(
        (match) => match[1].trim().split(/\s+/).length > 12,
      )
    )
      result.push('Short dialogue lines (up to 12 words) work best.')
    return [...new Set(result)]
  })
</script>

{#if hints.length}<div class="prompt-quality" aria-label="Prompt suggestions">
    {#each hints as hint}<small>{hint}</small>{/each}
  </div>{/if}
