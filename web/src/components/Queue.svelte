<script lang="ts">
  import { readable } from '../lib/store'
  import { useGenQueue } from '@/lib/gen-queue-store'
  import { useGenProgress } from '@/lib/gen-progress-store'
  import { api, message } from '../lib/api'
  import { toast } from '@/lib/notifications'
  const queue = readable(useGenQueue)
  let open = $state(false)
  const active = $derived(
    $queue.items.filter((i) =>
      ['submitting', 'queued', 'running'].includes(i.status),
    ).length,
  )
  async function cancel(id: string, promptId: string | null) {
    try {
      // A submitting request without a prompt ID is cancelled by the shared controller.
      if (!promptId) {
        window.dispatchEvent(new CustomEvent('h3:cancel-all'))
        return
      }
      await api('/api/comfy/cancel', { prompt_id: promptId })
      useGenQueue.getState().setStatus(id, 'cancelled')
      if (useGenProgress.getState().video.promptId === promptId)
        useGenProgress.getState().resetVideoGen()
    } catch (e) {
      toast.error(message(e))
    }
  }
</script>

<aside class="queue-panel" aria-label="Generation queue">
  <button
    class="queue-toggle"
    onclick={() => (open = !open)}
    aria-expanded={open}
    >Queue <span class="badge">{active}</span><span>{open ? '⌄' : '⌃'}</span
    ></button
  >
  {#if open}<div class="queue-items">
      <div class="section-head">
        <strong>Generation queue</strong><button
          onclick={() => useGenQueue.getState().clearFinished()}
          >Clear finished</button
        >
      </div>
      {#each $queue.items as item (item.id)}<article class="queue-item">
          <div class="section-head">
            <span>{item.label || 'Untitled video'}</span><span class="badge"
              >{item.status}</span
            >
          </div>
          <progress max={item.progressMax || 100} value={item.progressValue}
          ></progress>{#if item.error}<p class="error">
              {item.error}
            </p>{/if}{#if ['submitting', 'running', 'queued'].includes(item.status)}<button
              onclick={() => cancel(item.id, item.promptId)}>Cancel task</button
            >{/if}
        </article>{:else}<p class="empty">No tasks yet.</p>{/each}
    </div>{/if}
</aside>
