<script lang="ts">
  import { onMount } from 'svelte'
  import Modal from './Modal.svelte'
  import PromptQuality from './PromptQuality.svelte'
  import NumberField from './NumberField.svelte'
  import Gallery from './Gallery.svelte'
  import { readable } from '../lib/store'
  import {
    useGenStore,
    type VideoRefItem,
    type VideoGenState,
  } from '@/lib/gen-store'
  import { useGenProgress } from '@/lib/gen-progress-store'
  import { usePromptHistory } from '@/lib/prompt-history-store'
  import { uploadInputFile } from '@/lib/upload'
  import {
    VALID_KSAMPLERS,
    PASS1_SCHEDULERS,
    flfNominalDimensions,
  } from '@/lib/comfy/minimax-h3-template'
  import {
    buildPresets,
    alignFrames,
    type ModelOptions,
  } from '@/lib/video-controls'
  import {
    computeOutputDimensions,
    type createVideoGeneration,
  } from '@/lib/video-generation'
  import { EXAMPLES, CAMERA_WORDS } from '@/lib/prompt-examples'
  import { api, inputUrl, message } from '../lib/api'
  import { gallery } from '../lib/gallery'
  import { toast } from '@/lib/notifications'
  let {
    controller,
  }: { controller?: ReturnType<typeof createVideoGeneration> } = $props()
  const store = readable(useGenStore),
    progress = readable(useGenProgress),
    history = readable(usePromptHistory)
  const v = $derived($store.video)
  const generation = $derived($progress.video)
  const patch = (value: Partial<VideoGenState>) =>
    useGenStore.getState().patchVideo(value)
  let options = $state<ModelOptions | null>(null)
  let uploading = $state(false)
  let editor = $state(false)
  let showHistory = $state(false)
  let promptElement: HTMLTextAreaElement
  let mention = $state(false)
  let preview = $state('')
  let stage = $state('')
  const presets = $derived(buildPresets(options, true))
  const minFrames = $derived(options?.frames_minimum ?? 60)
  const maxFrames = $derived(options?.frames_maximum ?? 719)
  const frameStep = $derived(options?.frames_steps ?? 17)
  const active = $derived(
    ['submitting', 'queued', 'running'].includes(generation.phase),
  )
  const dimensions = $derived(
    v.targetDimensions
      ? `${v.targetDimensions.width} × ${v.targetDimensions.height}`
      : v.freeResolution
        ? (() => {
            const [w, h] = v.resolution.split('x').map(Number)
            const d = computeOutputDimensions(
              v.mode === 'flf' && v.startFrame?.width && v.startFrame.height
                ? `${v.startFrame.width}:${v.startFrame.height}`
                : `${w}:${h}`,
              v.finalResolution || 0.7,
            )
            return `${d.w} × ${d.h}`
          })()
        : v.mode === 'flf' && v.startFrame?.width && v.startFrame.height
          ? (() => {
              const short = Math.min(...v.resolution.split('x').map(Number))
              const d = flfNominalDimensions(
                short,
                v.startFrame!.width!,
                v.startFrame!.height!,
              )
              return `${d.w} × ${d.h}`
            })()
          : v.resolution.replace('x', ' × '),
  )
  onMount(() => {
    let disposed = false
    api<ModelOptions>('/api/comfy/model-options?model_type=minimax_h3_ref2va')
      .then((d) => {
        if (!disposed) options = d
      })
      .catch(() => {})
    return () => (disposed = true)
  })
  $effect(() => {
    const pid = generation.promptId
    const phase = generation.phase
    preview = ''
    stage = ''
    if (!pid || !['queued', 'running'].includes(phase)) return
    let disposed = false,
      busy = false
    async function poll() {
      if (busy) return
      busy = true
      try {
        const data = await api(
          `/api/comfy/preview?prompt_id=${encodeURIComponent(pid!)}`,
        )
        if (!disposed) {
          preview = data.preview?.image || ''
          stage =
            data.stage?.label ||
            (data.preview
              ? `Step ${data.preview.step} / ${data.preview.total}`
              : '')
        }
      } catch {
      } finally {
        busy = false
      }
    }
    void poll()
    const timer = setInterval(poll, 2000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  })
  function changePrompt(text: string) {
    useGenStore.getState().setVideoPrompt(text)
  }
  function insert(text: string) {
    const start = promptElement?.selectionStart ?? v.prompt.length,
      end = promptElement?.selectionEnd ?? start
    changePrompt(v.prompt.slice(0, start) + text + v.prompt.slice(end))
    mention = false
    requestAnimationFrame(() => {
      promptElement?.focus()
      promptElement?.setSelectionRange(start + text.length, start + text.length)
    })
  }
  function insertMention(text: string) {
    const cursor = promptElement?.selectionStart ?? v.prompt.length
    const before = v.prompt.slice(0, cursor),
      at = before.lastIndexOf('@')
    if (mention && at >= 0)
      changePrompt(before.slice(0, at) + text + ' ' + v.prompt.slice(cursor))
    else insert(text + ' ')
    mention = false
  }
  const tagFor = (ref: VideoRefItem) =>
    `<${{ image: 'Picture', video: 'Video', audio: 'Audio' }[ref.kind]} ${v.refs.filter((r) => r.kind === ref.kind).findIndex((r) => r.id === ref.id) + 1}>`
  function dialogue() {
    const start = promptElement?.selectionStart ?? v.prompt.length,
      end = promptElement?.selectionEnd ?? start
    insert(`<d>${v.prompt.slice(start, end) || '[English] Dialogue here.'}</d>`)
  }
  async function upload(
    files: FileList | File[] | null,
    slot?: 'start' | 'end',
  ) {
    if (!files?.length || uploading) return
    uploading = true
    try {
      for (const file of Array.from(files)) {
        const mime =
          file.type ||
          (/\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name)
            ? 'image/'
            : /\.(avi|m4v|mkv|mov|mp4|webm)$/i.test(file.name)
              ? 'video/'
              : /\.(aac|flac|m4a|mp3|ogg|wav)$/i.test(file.name)
                ? 'audio/'
                : '')
        const kind = mime.startsWith('image/')
          ? 'image'
          : mime.startsWith('video/')
            ? 'video'
            : mime.startsWith('audio/')
              ? 'audio'
              : null
        if (!kind || (slot && kind !== 'image'))
          throw new Error(
            slot
              ? 'Choose an image for the frame.'
              : 'Choose an image, video or audio file.',
          )
        if (!slot) {
          if (v.mode !== 'ref' && kind !== 'audio')
            throw new Error(
              'Use audio references in Text/Frames mode; upload images into the frame slots.',
            )
          const limits = options?.omni_reference_limits ?? {
            image: 9,
            video: 3,
            audio: 3,
            total: 15,
          }
          if (
            v.refs.filter((r) => r.kind === kind).length >= limits[kind] ||
            v.refs.length >= limits.total
          )
            throw new Error('Reference limit reached.')
        }
        const result = await uploadInputFile(file)
        const previewUrl = URL.createObjectURL(file)
        if (slot) {
          let width: number | undefined, height: number | undefined
          try {
            const bitmap = await createImageBitmap(file)
            width = bitmap.width
            height = bitmap.height
            bitmap.close()
          } catch {
            URL.revokeObjectURL(previewUrl)
            throw new Error('Could not read frame dimensions.')
          }
          const frame = {
            path: result.path,
            name: file.name,
            previewUrl,
            width,
            height,
          }
          if (slot === 'start') useGenStore.getState().setVideoStartFrame(frame)
          else useGenStore.getState().setVideoEndFrame(frame)
          break
        } else
          useGenStore.getState().addVideoRefs([
            {
              id: crypto.randomUUID(),
              kind,
              path: result.path,
              name: file.name,
              previewUrl,
              role: '',
              imageIntent: 'identity',
              audioIntent: 'voice',
              includeAudio: false,
            },
          ])
        if (result.staged)
          toast.info(
            'Reference saved locally; it will transfer when ComfyUI is available.',
          )
      }
    } catch (e) {
      toast.error(message(e))
    } finally {
      uploading = false
    }
  }
  async function generate() {
    if (!controller || uploading) return
    const current = useGenStore.getState().video
    if (!current.prompt.trim()) {
      toast.error('Enter video description')
      return
    }
    if (current.mode === 'flf' && !current.startFrame) {
      toast.error('In Frames mode, the first frame is required.')
      return
    }
    let prompt = current.prompt.trim()
    if (current.mode !== 'ref') {
      const cleaned = prompt
        .replace(/<\/?(?:Picture|Video|Subject)\s*\d+\s*>/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
      if (cleaned !== prompt)
        toast.warning('Unsupported reference tags removed for this mode.')
      prompt = cleaned
    }
    if (!prompt) {
      toast.error('Prompt is empty after clearing tags')
      return
    }
    usePromptHistory.getState().add(prompt)
    await controller.generate({
      ...current,
      modelType: current.modelType,
      prompt,
      targetDimensions:
        current.mode === 'flf'
          ? (current.targetDimensions ?? undefined)
          : undefined,
      firstFrame: current.mode === 'flf' ? current.startFrame?.path : undefined,
      lastFrame: current.mode === 'flf' ? current.endFrame?.path : undefined,
      firstFrameWidth: current.startFrame?.width,
      firstFrameHeight: current.startFrame?.height,
      references: current.refs.filter(
        (r) => current.mode === 'ref' || r.kind === 'audio',
      ),
      finalResolution: current.freeResolution
        ? current.finalResolution || 0.7
        : undefined,
      outputSubfolder: current.outputFolder || '',
    })
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void generate()
    }
  }}
/>
<div class="generate-layout">
  <section class="controls-pane">
    <header class="page-heading">
      <div class="eyebrow">YOUR NEXT SCENE STARTS HERE</div>
      <h1>Generate video <span class="badge">H3</span></h1>
      <p>Bring your story to life with video and sound.</p>
    </header>
    <div class="segmented" aria-label="Generation mode">
      {#each [{ id: 't2v', label: 'Text' }, { id: 'flf', label: 'Frames' }, { id: 'ref', label: 'References' }] as mode}<button
          class:active={v.mode === mode.id}
          onclick={() => patch({ mode: mode.id as VideoGenState['mode'] })}
          >{mode.label}</button
        >{/each}
    </div>
    <section class="control-section">
      <div class="section-head">
        <label for="prompt">Prompt</label>
        <div class="inline">
          <button onclick={() => (showHistory = true)}>History</button><button
            onclick={() => (editor = true)}>Expand ↗</button
          >
        </div>
      </div>
      <textarea
        id="prompt"
        bind:this={promptElement}
        class="prompt-input"
        value={v.prompt}
        placeholder="Describe your scene, camera movement, dialogue and sound…"
        oninput={(e) => {
          changePrompt(e.currentTarget.value)
          mention = /@\w*$/.test(
            e.currentTarget.value.slice(0, e.currentTarget.selectionStart),
          )
        }}
        onpaste={(e) => {
          const files = e.clipboardData?.files
          if (files?.length) {
            e.preventDefault()
            void upload(files)
          }
        }}></textarea>
      {#if mention}<div class="mention-list">
          {#each v.refs.filter((r) => v.mode === 'ref' || r.kind === 'audio') as ref}<button
              onmousedown={(e) => e.preventDefault()}
              onclick={() => insertMention(tagFor(ref))}
              >{tagFor(ref)} · {ref.name}</button
            >{:else}<small>Upload references to insert mentions.</small>{/each}
        </div>{/if}
      <div class="prompt-tools">
        <button onclick={dialogue}>＋ Dialogue</button><select
          aria-label="Prompt examples"
          value=""
          onchange={(e) => {
            const example = EXAMPLES[Number(e.currentTarget.value)]
            if (example) changePrompt(example.text)
            e.currentTarget.value = ''
          }}
          ><option value="" disabled>Examples</option
          >{#each EXAMPLES as example, i}<option value={i}
              >{example.title}</option
            >{/each}</select
        ><select
          aria-label="Camera vocabulary"
          value=""
          onchange={(e) => {
            insert(e.currentTarget.value)
            e.currentTarget.value = ''
          }}
          ><option value="" disabled>Camera</option
          >{#each CAMERA_WORDS as word}<option value={word}>{word}</option
            >{/each}</select
        ><small>{v.prompt.length} characters</small>
      </div>
      <p class="hint">
        Use &lt;d&gt;dialogue&lt;/d&gt; for speech; type @ to insert a
        reference.
      </p>
      <PromptQuality
        prompt={v.prompt}
        refs={v.refs.filter((r) => v.mode === 'ref' || r.kind === 'audio')}
      />
    </section>
    {#if v.mode === 'flf'}<section class="control-section">
        <div class="section-head">
          <h3>First & last frames</h3>
          <small>First frame sets the aspect ratio</small>
        </div>
        <div class="frame-grid">
          {#each ['start', 'end'] as slot}{@const frame =
              slot === 'start' ? v.startFrame : v.endFrame}
            <div class="frame-card">
              <label class="upload-zone"
                ><input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  aria-label={slot === 'start' ? 'First frame' : 'Last frame'}
                  onchange={(e) => {
                    void upload(e.currentTarget.files, slot as 'start' | 'end')
                    e.currentTarget.value = ''
                  }}
                />{#if frame}<img
                    src={frame.previewUrl || inputUrl(frame.path)}
                    alt={frame.name}
                  />{:else}<span>＋</span>{/if}<strong
                  >{slot === 'start'
                    ? 'First frame · required'
                    : 'Last frame · optional'}</strong
                ></label
              >{#if frame}<small
                  >{frame.name} · {frame.width} × {frame.height}</small
                ><button
                  onclick={() =>
                    slot === 'start'
                      ? useGenStore.getState().setVideoStartFrame(null)
                      : useGenStore.getState().setVideoEndFrame(null)}
                  >Remove {slot === 'start' ? 'first' : 'last'} frame</button
                >{/if}
            </div>{/each}
        </div>
      </section>{/if}
    <section class="control-section">
      <div class="section-head">
        <h3>{v.mode === 'ref' ? 'References' : 'Audio references'}</h3>
        <small
          >{v.refs.filter((r) => v.mode === 'ref' || r.kind === 'audio').length} uploaded</small
        >
      </div>
      <label
        class="upload-zone reference-drop"
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => {
          e.preventDefault()
          void upload(e.dataTransfer?.files ?? null)
        }}
        ><input
          type="file"
          multiple
          accept={v.mode === 'ref' ? 'image/*,video/*,audio/*' : 'audio/*'}
          aria-label="Upload references"
          disabled={uploading}
          onchange={(e) => {
            void upload(e.currentTarget.files)
            e.currentTarget.value = ''
          }}
        /><span>＋</span><strong
          >{uploading ? 'Uploading…' : 'Drop files here or browse'}</strong
        ><small
          >{v.mode === 'ref'
            ? 'Up to 9 images, 3 videos and 3 audio files'
            : 'Up to 3 audio files'}</small
        ></label
      >
      <div class="reference-list">
        {#each v.refs.filter((r) => v.mode === 'ref' || r.kind === 'audio') as ref, i (ref.id)}<article
            class="reference-card"
          >
            <div class="reference-preview">
              {#if ref.kind === 'image'}<a
                  href={ref.previewUrl || inputUrl(ref.path)}
                  target="_blank"
                  rel="noreferrer"
                  ><img
                    src={ref.previewUrl || inputUrl(ref.path)}
                    alt={ref.name}
                  /></a
                >{:else if ref.kind === 'video'}<video
                  src={ref.previewUrl || inputUrl(ref.path)}
                  controls
                  preload="metadata"><track kind="captions" /></video
                >{:else}<audio
                  src={ref.previewUrl || inputUrl(ref.path)}
                  controls
                ></audio>{/if}
            </div>
            <div class="reference-fields">
              <div class="section-head">
                <button onclick={() => insertMention(tagFor(ref))}
                  >{tagFor(ref)}</button
                ><button
                  aria-label={`Remove ${ref.name}`}
                  onclick={() => useGenStore.getState().removeVideoRef(ref.id)}
                  >✕</button
                >
              </div>
              <small>{ref.name}</small><input
                aria-label={`Role for ${ref.name}`}
                placeholder="Who or what is this reference?"
                maxlength="500"
                value={ref.role}
                onchange={(e) =>
                  useGenStore
                    .getState()
                    .updateVideoRef(ref.id, { role: e.currentTarget.value })}
              />{#if ref.kind === 'image'}<select
                  aria-label={`Intent for ${ref.name}`}
                  value={ref.imageIntent}
                  onchange={(e) =>
                    useGenStore.getState().updateVideoRef(ref.id, {
                      imageIntent: e.currentTarget
                        .value as VideoRefItem['imageIntent'],
                    })}
                  >{#each ['identity', 'scene', 'style', 'composition'] as intent}<option
                      >{intent}</option
                    >{/each}</select
                >{:else if ref.kind === 'audio'}<select
                  aria-label={`Intent for ${ref.name}`}
                  value={ref.audioIntent}
                  onchange={(e) =>
                    useGenStore.getState().updateVideoRef(ref.id, {
                      audioIntent: e.currentTarget
                        .value as VideoRefItem['audioIntent'],
                    })}
                  >{#each ['voice', 'drive', 'style'] as intent}<option
                      >{intent}</option
                    >{/each}</select
                >{:else}<label class="check"
                  ><input
                    type="checkbox"
                    checked={ref.includeAudio}
                    onchange={(e) =>
                      useGenStore.getState().updateVideoRef(ref.id, {
                        includeAudio: e.currentTarget.checked,
                      })}
                  />Include video audio</label
                >{/if}
              <div class="inline">
                <button
                  aria-label={`Move ${ref.name} earlier`}
                  disabled={v.refs.indexOf(ref) === 0}
                  onclick={() => {
                    const index = v.refs.findIndex((r) => r.id === ref.id)
                    useGenStore.getState().moveVideoRef(index, index - 1)
                  }}>↑</button
                ><button
                  aria-label={`Move ${ref.name} later`}
                  disabled={v.refs.indexOf(ref) === v.refs.length - 1}
                  onclick={() => {
                    const index = v.refs.findIndex((r) => r.id === ref.id)
                    useGenStore.getState().moveVideoRef(index, index + 1)
                  }}>↓</button
                >
              </div>
            </div>
          </article>{/each}
      </div>
    </section>
    <section class="control-section">
      <div class="section-head">
        <h3>Output</h3>
        <span class="badge">{dimensions}</span>
      </div>
      <label class="check"
        ><input
          type="checkbox"
          checked={v.freeResolution}
          onchange={(e) =>
            patch({
              freeResolution: e.currentTarget.checked,
              finalResolution: e.currentTarget.checked ? 0.7 : 0,
              targetDimensions: null,
            })}
        />Free resolution</label
      >
      <label class="field"
        ><span>Resolution / aspect ratio</span><select
          aria-label="Resolution"
          value={v.resolution}
          onchange={(e) =>
            useGenStore.getState().setVideoResolution(e.currentTarget.value)}
          >{#if !Object.values(presets).some( (group) => Object.values(group).includes(v.resolution) )}<option
              value={v.resolution}>{v.resolution} · restored</option
            >{/if}{#each Object.entries(presets) as [quality, aspects]}<optgroup
              label={quality}
              >{#each Object.entries(aspects) as [aspect, size]}<option
                  value={size}>{quality} · {aspect} · {size}</option
                >{/each}</optgroup
            >{/each}</select
        ></label
      >
      {#if v.freeResolution}<NumberField
          label="Target megapixels"
          value={v.finalResolution || 0.7}
          min={0.2}
          max={3}
          step={0.05}
          onchange={(n) => patch({ finalResolution: n })}
        />{/if}
      <div class="section-head">
        <label for="duration">Duration</label><span
          >{(v.videoLength / 24).toFixed(2)} s</span
        >
      </div>
      <input
        id="duration"
        type="range"
        min={minFrames}
        max={maxFrames}
        step={frameStep}
        value={v.videoLength}
        oninput={(e) =>
          patch({
            videoLength: alignFrames(
              Number(e.currentTarget.value),
              minFrames,
              maxFrames,
              frameStep,
            ),
          })}
      /><NumberField
        label="Duration frames"
        value={v.videoLength}
        min={minFrames}
        max={maxFrames}
        onchange={(n) =>
          patch({
            videoLength: alignFrames(n, minFrames, maxFrames, frameStep),
          })}
        hint="24 fps · aligned to the model's frame grid"
      />
      <div class="two-columns">
        <NumberField
          label="Seed"
          value={v.seed}
          min={-1}
          max={2147483647}
          onchange={(n) => patch({ seed: Math.round(n) })}
          hint="−1 for random"
        /><label class="field"
          ><span>Output folder</span><select
            value={v.outputFolder}
            onchange={(e) => patch({ outputFolder: e.currentTarget.value })}
            ><option value="">General</option
            >{#if v.outputFolder && !$gallery.folders.includes(v.outputFolder)}<option
                >{v.outputFolder}</option
              >{/if}{#each $gallery.folders as folder}<option>{folder}</option
              >{/each}</select
          ></label
        >
      </div>
    </section>
    <details class="control-section">
      <summary>Advanced parameters</summary>
      <div class="advanced-grid">
        <NumberField
          label="Pass 1 megapixels"
          value={v.lowResMP}
          min={0.1}
          max={2}
          step={0.05}
          onchange={(n) => patch({ lowResMP: n })}
        /><NumberField
          label="Pass 1 steps"
          value={v.firstSamplerSteps}
          min={2}
          max={30}
          onchange={(n) => patch({ firstSamplerSteps: n })}
        />
        {#each [{ key: 'pass1Sampler', label: 'Pass 1 sampler', values: [...VALID_KSAMPLERS] }, { key: 'pass1Scheduler', label: 'Pass 1 scheduler', values: [...PASS1_SCHEDULERS] }, { key: 'pass2Sampler', label: 'Pass 2 sampler', values: [...VALID_KSAMPLERS] }, { key: 'sigmaVariant', label: 'Pass 2 sigma profile', values: ['3step', '4step', '5step', '6step', '7step'] }, { key: 'referenceDetail', label: 'Reference detail', values: ['match', 'max'] }] as control}<label
            class="field"
            ><span>{control.label}</span><select
              value={v[control.key as keyof VideoGenState] as string}
              onchange={(e) => patch({ [control.key]: e.currentTarget.value })}
              >{#if !control.values.includes(v[control.key as keyof VideoGenState] as string)}<option
                  >{v[control.key as keyof VideoGenState] as string}</option
                >{/if}{#each control.values as value}<option>{value}</option
                >{/each}</select
            ></label
          >{/each}
      </div>
    </details>
    <div class="generate-action">
      <button
        class="primary"
        disabled={!controller ||
          uploading ||
          !v.prompt.trim() ||
          (v.mode === 'flf' && !v.startFrame)}
        onclick={generate}
        >✧ {active ? 'Add to queue' : 'Generate video'}<small>⌘ / Ctrl ↵</small
        ></button
      >
    </div>
  </section>
  <section class="results-pane">
    <header class="section-head">
      <div>
        <div class="eyebrow">YOUR CREATIONS</div>
        <h2>Studio output</h2>
      </div>
      <span class="badge">Video + Audio</span>
    </header>
    {#if active || generation.phase === 'error' || generation.phase === 'done'}<article
        class="generation-card"
      >
        <div class="section-head">
          <strong
            >{generation.phase === 'done'
              ? 'Generation complete'
              : generation.phase === 'error'
                ? 'Generation failed'
                : generation.phase === 'submitting'
                  ? 'Sending workflow…'
                  : generation.phase === 'queued'
                    ? 'Waiting in queue…'
                    : 'Generating your scene…'}</strong
          >{#if active}<button onclick={() => controller?.interrupt()}
              >Cancel all</button
            >{:else}<button
              onclick={() => useGenProgress.getState().resetVideoGen()}
              >Dismiss</button
            >{/if}
        </div>
        {#if active}<progress
            value={generation.progressValue}
            max={generation.progressMax || 100}
          ></progress>{/if}{#if stage}<p>{stage}</p>{/if}{#if preview}<img
            class="generation-preview"
            src={preview}
            alt="Live generation preview"
          />{/if}{#if generation.error}<p class="error">
            {generation.error}
          </p>{/if}
      </article>{/if}
    <Gallery embedded folder={v.outputFolder} />
  </section>
</div>
<Modal bind:open={editor} title="Prompt editor" wide
  ><textarea
    class="expanded-prompt"
    aria-label="Expanded prompt"
    value={v.prompt}
    oninput={(e) => changePrompt(e.currentTarget.value)}></textarea>
  <div class="section-head">
    <small>Describe visuals, dialogue and sound in one prompt.</small>
    <div class="inline">
      <button onclick={() => (editor = false)}>Done</button><button
        class="primary"
        disabled={!controller || !v.prompt.trim()}
        onclick={() => {
          editor = false
          void generate()
        }}>Save & generate</button
      >
    </div>
  </div></Modal
>
<Modal bind:open={showHistory} title="Prompt history"
  ><div class="history-list">
    {#each $history.entries as entry (entry.id)}<article>
        <button
          class="history-text"
          onclick={() => {
            changePrompt(entry.text)
            showHistory = false
          }}>{entry.text}</button
        >
        <div class="inline">
          <button
            aria-label="Toggle favorite"
            onclick={() => usePromptHistory.getState().toggleFavorite(entry.id)}
            >{entry.favorite ? '★ Favorite' : '☆ Favorite'}</button
          ><button onclick={() => usePromptHistory.getState().remove(entry.id)}
            >Remove</button
          >
        </div>
      </article>{:else}<p class="empty">
        Submitted prompts appear here.
      </p>{/each}
  </div></Modal
>
