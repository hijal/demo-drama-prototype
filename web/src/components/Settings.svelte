<script lang="ts">
  import { onMount } from 'svelte'
  import Modal from './Modal.svelte'
  import NumberField from './NumberField.svelte'
  import { api, message } from '../lib/api'
  import { readable } from '../lib/store'
  import { uploadModel } from '../lib/model-upload'
  import { useGenStore, DEFAULT_VIDEO_STATE } from '@/lib/gen-store'
  import { usePromptHistory } from '@/lib/prompt-history-store'
  import { useGenDurations } from '@/lib/gen-duration-store'
  import { useModelUploadStore } from '@/lib/model-upload-store'
  import { loadGallery } from '../lib/gallery'
  import { toast } from '@/lib/notifications'
  let { open = $bindable(false) }: { open?: boolean } = $props()
  const store = readable(useGenStore),
    uploads = readable(useModelUploadStore)
  const video = $derived($store.video)
  let tab = $state('General')
  let config = $state({
    reserve_gb: 3,
    dynamic_vram: true,
    comfy_dir: '',
    diffusion_model: '',
    sound_on: true,
  })
  let theme = $state('dark')
  let stats = $state<any>(null),
    models = $state<any[]>([]),
    loras = $state<any[]>([])
  let diffusion = $state<{
    models: string[]
    default?: string
    current?: string
  }>({ models: [] })
  let busy = $state(false),
    error = $state(''),
    loaded = $state(false)
  let confirmation = $state(''),
    confirmOpen = $state(false)
  let requestVersion = 0
  onMount(() => {
    try {
      theme = localStorage.getItem('theme') || 'dark'
    } catch {}
  })
  async function refresh() {
    const version = ++requestVersion
    const results = await Promise.allSettled([
      api('/api/config'),
      api('/api/comfy/health'),
      api('/api/models/status'),
      api('/api/loras'),
      api('/api/comfy/diffusion-models'),
    ])
    if (version !== requestVersion) return
    if (results[0].status === 'fulfilled') {
      config = { ...config, ...results[0].value }
      error = ''
    } else error = message(results[0].reason)
    stats = results[1].status === 'fulfilled' ? results[1].value : null
    if (results[2].status === 'fulfilled')
      models = results[2].value.models ?? []
    if (results[3].status === 'fulfilled') loras = results[3].value.loras ?? []
    if (results[4].status === 'fulfilled')
      diffusion = results[4].value as typeof diffusion
    loaded = true
  }
  $effect(() => {
    if (open) {
      void refresh()
      return () => {
        requestVersion++
      }
    }
  })
  $effect(() => {
    if (!open || !models.some((m) => m.status === 'downloading')) return
    let disposed = false,
      inFlight = false
    const timer = setInterval(async () => {
      if (inFlight) return
      inFlight = true
      try {
        const data = await api('/api/models/status')
        if (!disposed) models = data.models ?? []
      } catch {
      } finally {
        inFlight = false
      }
    }, 2000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  })
  async function save(patch: Partial<typeof config>) {
    busy = true
    error = ''
    try {
      const result = await api('/api/config', patch)
      config = { ...config, ...result }
      toast.success('Settings saved')
    } catch (e) {
      error = message(e)
      toast.error(error)
    } finally {
      busy = false
    }
  }
  function changeTheme(value: string) {
    theme = value
    document.documentElement.className = value
    try {
      localStorage.setItem('theme', value)
    } catch {}
  }
  async function modelAction(
    action: 'download' | 'cancel' | 'delete',
    id: string,
  ) {
    if (
      action === 'delete' &&
      !confirm('Delete this model from disk? You can download it again later.')
    )
      return
    busy = true
    try {
      await api(`/api/models/${action}`, { modelId: id })
      const data = await api('/api/models/status')
      models = data.models ?? []
      toast.success(
        action === 'download'
          ? 'Download started'
          : action === 'cancel'
            ? 'Download cancelled'
            : 'Model deleted',
      )
    } catch (e) {
      toast.error(message(e))
    } finally {
      busy = false
    }
  }
  async function downloadAll() {
    for (const model of models.filter(
      (m) => !m.optional && ['missing', 'error'].includes(m.status),
    ))
      await modelAction('download', model.id)
  }
  async function upload(file: File | undefined, target: 'diffusion' | 'lora') {
    if (!file) return
    try {
      await uploadModel(file, target)
      await refresh()
      toast.success('Model uploaded')
    } catch (e) {
      toast.error(message(e))
    }
  }
  async function updateLora(name: string, patch: Record<string, unknown>) {
    busy = true
    try {
      const result = await api('/api/loras', { name, ...patch }, 'PUT')
      if (result.warning) toast.warning(result.warning)
      const data = await api('/api/loras')
      loras = data.loras ?? []
    } catch (e) {
      toast.error(message(e))
    } finally {
      busy = false
    }
  }
  async function deleteLora(name: string) {
    if (!confirm(`Delete LoRA “${name}” and its file?`)) return
    busy = true
    try {
      await api('/api/loras', { name, deleteFile: true }, 'DELETE')
      const data = await api('/api/loras')
      loras = data.loras ?? []
    } catch (e) {
      toast.error(message(e))
    } finally {
      busy = false
    }
  }
  function ask(action: string) {
    confirmation = action
    confirmOpen = true
  }
  async function reset() {
    const action = confirmation
    busy = true
    error = ''
    try {
      if (action === 'Reset settings' || action === 'Factory reset') {
        await api('/api/config', {
          reserve_gb: 3,
          dynamic_vram: true,
          sound_on: true,
          diffusion_model: '',
        })
        useGenStore.getState().patchVideo({ ...DEFAULT_VIDEO_STATE, refs: [] })
      }
      if (action === 'Factory reset') await api('/api/loras/reset', {})
      if (action === 'Clear input cache' || action === 'Factory reset') {
        await api('/api/comfy/clean', { target: 'input' })
        useGenStore.getState().clearVideoRefs()
        useGenStore.getState().setVideoStartFrame(null)
        useGenStore.getState().setVideoEndFrame(null)
      }
      if (action === 'Delete generated content' || action === 'Factory reset') {
        await api('/api/comfy/clean', { target: 'output' })
        usePromptHistory.getState().clear()
        useGenDurations.getState().clear()
        useGenStore.getState().setVideoPrompt('')
        await loadGallery()
      }
      if (action === 'Factory reset') changeTheme('dark')
      await refresh()
      confirmOpen = false
      toast.success(`${action} complete`)
    } catch (e) {
      error = `${message(e)}. Some earlier steps may already have completed.`
      toast.error(error)
    } finally {
      busy = false
    }
  }
  const size = (bytes: number) =>
    bytes >= 1024 ** 3
      ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
      : `${(bytes / 1024 ** 2).toFixed(0)} MB`
</script>

<Modal bind:open title="Settings" wide>
  <div class="settings-tabs" role="tablist" aria-label="Settings sections">
    {#each ['General', 'Appearance', 'Optimization', 'ComfyUI', 'Links', 'Reset'] as name}<button
        role="tab"
        aria-selected={tab === name}
        class:active={tab === name}
        onclick={() => (tab = name)}>{name}</button
      >{/each}
  </div>
  <div class="settings-body">
    {#if error}<p class="error" role="alert">{error}</p>{/if}{#if !loaded}<p>
        Loading settings…
      </p>{/if}
    {#if tab === 'General'}
      <div class="section-head">
        <h3>ComfyUI connection</h3>
        <span class="badge">{stats ? 'Connected' : 'Offline'}</span><button
          onclick={refresh}>Check connection</button
        >
      </div>
      <label class="field"
        ><span>ComfyUI installation folder</span><input
          bind:value={config.comfy_dir}
        /><small
          >Folder containing ComfyUI. Changing it updates uploads and gallery
          paths.</small
        ></label
      >
      <div class="inline">
        <button
          disabled={busy}
          onclick={async () => {
            try {
              const result = await api(
                `/api/config/check?dir=${encodeURIComponent(config.comfy_dir)}`,
              )
              toast.info(
                result.has_comfy
                  ? 'ComfyUI folder found'
                  : 'ComfyUI folder not found',
              )
            } catch (e) {
              toast.error(message(e))
            }
          }}>Check folder</button
        ><button
          disabled={busy}
          onclick={() => save({ comfy_dir: config.comfy_dir })}
          >Save folder</button
        >
      </div>
      <hr />
      <h3>Diffusion model</h3>
      <label class="field"
        ><span>Active diffusion model</span><select
          value={config.diffusion_model ||
            diffusion.current ||
            diffusion.default ||
            ''}
          onchange={(e) => save({ diffusion_model: e.currentTarget.value })}
          >{#if diffusion.default}<option value={diffusion.default}
              >Default · {diffusion.default}</option
            >{/if}{#if config.diffusion_model && !diffusion.models.includes(config.diffusion_model) && config.diffusion_model !== diffusion.default}<option
              value={config.diffusion_model}
              >{config.diffusion_model} · unavailable</option
            >{/if}{#each diffusion.models.filter((m) => m !== diffusion.default) as model}<option
              >{model}</option
            >{/each}</select
        ></label
      >
      <label class="button"
        >Upload diffusion model<input
          class="visually-hidden"
          type="file"
          accept=".safetensors"
          aria-label="Upload diffusion model"
          disabled={$uploads.active}
          onchange={(e) => {
            void upload(e.currentTarget.files?.[0], 'diffusion')
            e.currentTarget.value = ''
          }}
        /></label
      >
      <hr />
      <div class="section-head">
        <h3>Model files</h3>
        <button disabled={busy} onclick={downloadAll}
          >Download missing models</button
        >
      </div>
      <div class="models-list">
        {#each models as model (model.id)}<article>
            <div class="section-head">
              <div>
                <strong>{model.label}</strong><small
                  >{model.sizeLabel} {model.optional ? '· optional' : ''}</small
                >
              </div>
              <span class="badge">{model.status}</span>
            </div>
            {#if model.status === 'downloading'}<progress
                value={model.bytesReceived ?? 0}
                max={model.totalBytes || 1}
              ></progress><small
                >{size(model.bytesReceived ?? 0)}{model.totalBytes
                  ? ` / ${size(model.totalBytes)}`
                  : ''} · {size(model.speed ?? 0)}/s</small
              ><button
                disabled={busy}
                onclick={() => modelAction('cancel', model.id)}
                >Cancel download</button
              >{:else if model.status === 'ready'}<button
                class="danger"
                disabled={busy}
                onclick={() => modelAction('delete', model.id)}
                >Delete model</button
              >{:else}<button
                disabled={busy}
                onclick={() => modelAction('download', model.id)}
                >Download</button
              >{/if}{#if model.error}<p class="error">{model.error}</p>{/if}
          </article>{:else}<p class="hint">
            No model status available. Check the backend connection.
          </p>{/each}
      </div>
      <hr />
      <div class="section-head">
        <h3>LoRAs</h3>
        <button
          disabled={busy}
          onclick={async () => {
            try {
              await api('/api/loras/reset-patches', {})
              toast.success('LoRA patches reset')
            } catch (e) {
              toast.error(message(e))
            }
          }}>Reset patches</button
        >
      </div>
      <p class="hint">Enable models, adjust strength and set trigger words.</p>
      <label class="button"
        >Upload LoRA<input
          class="visually-hidden"
          type="file"
          accept=".safetensors"
          aria-label="Upload LoRA"
          disabled={$uploads.active}
          onchange={(e) => {
            void upload(e.currentTarget.files?.[0], 'lora')
            e.currentTarget.value = ''
          }}
        /></label
      >
      {#each loras as lora (lora.name)}<article class="lora-card">
          <div class="section-head">
            <label class="check"
              ><input
                type="checkbox"
                checked={lora.enabled}
                disabled={busy}
                onchange={(e) =>
                  updateLora(lora.name, { enabled: e.currentTarget.checked })}
              />{lora.name}</label
            >{#if lora.isTurbo}<span class="badge">Turbo</span>{/if}
          </div>
          <NumberField
            label={`Strength: ${lora.name}`}
            min={0}
            max={2}
            step={0.05}
            value={lora.strength}
            onchange={(n) => updateLora(lora.name, { strength: n })}
          /><label class="field"
            ><span>Trigger words</span><input
              value={lora.trigger || ''}
              disabled={busy}
              onchange={(e) =>
                updateLora(lora.name, { trigger: e.currentTarget.value })}
            /></label
          ><button
            class="danger"
            disabled={busy}
            onclick={() => deleteLora(lora.name)}>Delete LoRA</button
          >
        </article>{/each}
    {:else if tab === 'Appearance'}<h3>Studio theme</h3>
      <div class="theme-options">
        {#each [{ id: 'light', name: 'Light' }, { id: 'dark-gray', name: 'Dark gray' }, { id: 'dark', name: 'Deep dark' }] as choice}<button
            class:active={theme === choice.id}
            onclick={() => changeTheme(choice.id)}>{choice.name}</button
          >{/each}
      </div>
      <hr />
      <label class="check"
        ><input
          type="checkbox"
          checked={config.sound_on}
          disabled={busy}
          onchange={(e) => save({ sound_on: e.currentTarget.checked })}
        />Play sound when generation completes</label
      >
    {:else if tab === 'Optimization'}<h3>GPU memory</h3>
      <NumberField
        label="Reserved VRAM (GB)"
        value={config.reserve_gb}
        min={0}
        max={16}
        step={0.5}
        onchange={(n) => (config.reserve_gb = n)}
      /><label class="check"
        ><input type="checkbox" bind:checked={config.dynamic_vram} />Dynamic
        VRAM</label
      ><button
        class="primary"
        disabled={busy}
        onclick={() =>
          save({
            reserve_gb: config.reserve_gb,
            dynamic_vram: config.dynamic_vram,
          })}>Save optimization</button
      >
      <p class="hint">
        VRAM reserve and dynamic allocation apply when ComfyUI restarts.
      </p>
      <hr />
      <h3>Generation optimizations</h3>
      <label class="check"
        ><input
          type="checkbox"
          checked={video.lowVramAttention}
          onchange={(e) =>
            useGenStore
              .getState()
              .patchVideo({ lowVramAttention: e.currentTarget.checked })}
        />Low VRAM attention</label
      ><label class="check"
        ><input
          type="checkbox"
          checked={video.chunkFeedForward}
          onchange={(e) =>
            useGenStore
              .getState()
              .patchVideo({ chunkFeedForward: e.currentTarget.checked })}
        />Chunk feed forward</label
      >{#if video.chunkFeedForward}<NumberField
          label="Feed-forward chunks"
          min={1}
          max={32}
          value={video.chunkFFChunks}
          onchange={(n) =>
            useGenStore.getState().patchVideo({ chunkFFChunks: Math.round(n) })}
        /><NumberField
          label="Chunk length threshold"
          min={512}
          max={65536}
          step={512}
          value={video.chunkFFThreshold}
          onchange={(n) =>
            useGenStore
              .getState()
              .patchVideo({ chunkFFThreshold: Math.round(n) })}
        />{/if}
    {:else if tab === 'ComfyUI'}<div class="section-head">
        <h3>System information</h3>
        <button onclick={refresh}>Refresh status</button>
      </div>
      {#if stats}<pre class="metadata">{JSON.stringify(
            stats,
            null,
            2,
          )}</pre>{:else}<p class="empty">
          ComfyUI is offline. Start the Colab runtime to connect.
        </p>{/if}
    {:else if tab === 'Links'}<div class="links-list">
        <a
          href="https://github.com/hijal/demo-drama-prototype"
          target="_blank"
          rel="noreferrer">Project repository ↗</a
        ><a
          href="https://colab.research.google.com/github/hijal/demo-drama-prototype/blob/main/MiniMax_Studio_Colab.ipynb"
          target="_blank"
          rel="noreferrer">Open Colab notebook ↗</a
        ><a
          href="https://github.com/Comfy-Org/ComfyUI"
          target="_blank"
          rel="noreferrer">ComfyUI ↗</a
        >
      </div>
    {:else if tab === 'Reset'}<h3>Reset and cleanup</h3>
      <p class="hint">
        Each action asks for confirmation before modifying files or settings.
      </p>
      {#each [{ name: 'Reset settings', desc: 'Restore default generation, model and application settings.' }, { name: 'Clear input cache', desc: 'Permanently delete uploaded references and input files.' }, { name: 'Delete generated content', desc: 'Permanently delete generated videos, prompt history and duration records.' }, { name: 'Factory reset', desc: 'Reset settings and LoRAs, delete input/output files and clear prompt history.' }] as action}<article
          class="reset-action"
        >
          <div>
            <strong>{action.name}</strong>
            <p>{action.desc}</p>
          </div>
          <button
            class="danger"
            disabled={busy}
            onclick={() => ask(action.name)}>{action.name}</button
          >
        </article>{/each}
    {/if}
    {#if $uploads.active}<div class="upload-progress">
        <strong>Uploading {$uploads.fileName}</strong><progress
          max="100"
          value={$uploads.progress}
        ></progress><small
          >{$uploads.progress}% · You can close Settings while the upload
          continues.</small
        >
      </div>{/if}
  </div>
</Modal>
<Modal bind:open={confirmOpen} title={`${confirmation}?`}
  ><p>
    This action changes saved settings or permanently deletes files as described
    above. It cannot be undone.
  </p>
  <div class="inline">
    <button disabled={busy} onclick={() => (confirmOpen = false)}>Cancel</button
    ><button class="danger" disabled={busy} onclick={reset}
      >{busy ? 'Working…' : `Confirm ${confirmation.toLowerCase()}`}</button
    >
  </div></Modal
>
