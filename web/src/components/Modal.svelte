<script lang="ts">
  import type { Snippet } from 'svelte'
  let {
    open = $bindable(false),
    title,
    children,
    wide = false,
  }: {
    open?: boolean
    title: string
    children: Snippet
    wide?: boolean
  } = $props()
  let dialog = $state<HTMLDialogElement>()
  $effect(() => {
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  })
</script>

<dialog
  bind:this={dialog}
  class:wide
  onclose={() => (open = false)}
  oncancel={() => (open = false)}
  onclick={(e) => {
    if (e.target === dialog) open = false
  }}
>
  <div class="modal-body">
    <header class="section-head">
      <h2>{title}</h2>
      <button
        class="icon-button"
        aria-label="Close dialog"
        onclick={() => (open = false)}>✕</button
      >
    </header>
    {@render children()}
  </div>
</dialog>
