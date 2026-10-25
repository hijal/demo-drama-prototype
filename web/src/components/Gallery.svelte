<script lang="ts">
  import Modal from './Modal.svelte'
  import { gallery, loadGallery, type GalleryFile } from '../lib/gallery'
  import { api, fileKey, message } from '../lib/api'
  import { restoreFromMeta } from '@/lib/restore-from-meta'
  import { useGenStore } from '@/lib/gen-store'
  import { formatSeconds } from '@/lib/gen-duration-store'
  import { toast } from '@/lib/notifications'
  let {
    embedded = false,
    folder = '',
  }: { embedded?: boolean; folder?: string } = $props()
  let filter = $state('*'),
    search = $state(''),
    sort = $state('newest')
  let selected = $state<string[]>([])
  let viewing = $state<GalleryFile | null>(null)
  let viewerOpen = $state(false),
    metaOpen = $state(false)
  let metadata = $state<Record<string, any> | null>(null)
  let metaError = $state('')
  let busy = $state(false)
  let destination = $state('')
  let selectionMode = $state(false)
  const files = $derived(
    $gallery.files
      .filter(
        (f) =>
          (embedded
            ? f.subfolder === folder
            : filter === '*' || f.subfolder === filter) &&
          f.filename.toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a, b) =>
        sort === 'name'
          ? a.filename.localeCompare(b.filename)
          : sort === 'oldest'
            ? (a.mtime ?? 0) - (b.mtime ?? 0)
            : (b.mtime ?? 0) - (a.mtime ?? 0),
      ),
  )
  const selectedFiles = $derived(
    $gallery.files.filter((f) => selected.includes(fileKey(f))),
  )
  const download = (f: GalleryFile) =>
    f.url + (f.url.includes('?') ? '&' : '?') + 'download=1'
  function open(file: GalleryFile) {
    viewing = file
    viewerOpen = true
  }
  async function repeat(file: GalleryFile) {
    busy = true
    try {
      if (
        await restoreFromMeta(
          file.subfolder ? `${file.subfolder}/${file.filename}` : file.filename,
        )
      ) {
        viewerOpen = false
        metaOpen = false
      }
    } catch (e) {
      toast.error(message(e))
    } finally {
      busy = false
    }
  }
  async function showMeta(file: GalleryFile) {
    viewing = file
    metadata = null
    metaError = ''
    metaOpen = true
    try {
      const data = await api(
        `/api/comfy/meta?${new URLSearchParams({ path: file.subfolder ? `${file.subfolder}/${file.filename}` : file.filename })}`,
      )
      if (viewing && fileKey(viewing) === fileKey(file)) metadata = data
    } catch (e) {
      metaError = message(e)
    }
  }
  async function remove(items: GalleryFile[]) {
    if (
      !items.length ||
      !confirm(
        `Delete ${items.length} video${items.length === 1 ? '' : 's'} permanently?`,
      )
    )
      return
    busy = true
    try {
      for (const file of items)
        await api('/api/comfy/delete', {
          filename: file.filename,
          subfolder: file.subfolder,
        })
      selected = []
      viewerOpen = false
      toast.success('Videos deleted')
    } catch (e) {
      toast.error(message(e))
    } finally {
      await loadGallery()
      busy = false
    }
  }
  async function move(items: GalleryFile[], to: string) {
    if (!items.length) return
    busy = true
    try {
      for (const file of items)
        await api('/api/comfy/move', {
          filename: file.filename,
          from: file.subfolder,
          to,
        })
      selected = []
      viewerOpen = false
      toast.success('Videos moved')
    } catch (e) {
      toast.error(message(e))
    } finally {
      await loadGallery()
      busy = false
    }
  }
  async function folderAction(action: 'create' | 'rename' | 'delete') {
    const old = filter === '*' ? '' : filter
    if (action !== 'create' && !old) return
    const name =
      action === 'delete'
        ? old
        : prompt(
            action === 'create' ? 'New folder name' : 'Rename folder',
            old,
          )?.trim()
    if (
      !name ||
      (action === 'delete' && !confirm(`Delete empty folder “${old}”?`))
    )
      return
    busy = true
    try {
      const result = await api(
        '/api/comfy/folders',
        action === 'rename' ? { from: old, to: name } : { name },
        action === 'create' ? 'POST' : action === 'rename' ? 'PATCH' : 'DELETE',
      )
      const next = action === 'delete' ? '' : result.name || name
      filter = next
      if (
        action !== 'create' &&
        useGenStore.getState().video.outputFolder === old
      )
        useGenStore.getState().patchVideo({ outputFolder: next })
      toast.success('Folders updated')
    } catch (e) {
      toast.error(message(e))
    } finally {
      await loadGallery()
      busy = false
    }
  }
  function toggle(file: GalleryFile) {
    const key = fileKey(file)
    selected = selected.includes(key)
      ? selected.filter((k) => k !== key)
      : [...selected, key]
  }
  function adjacent(direction: number) {
    if (!viewing || !files.length) return
    const index = files.findIndex((f) => fileKey(f) === fileKey(viewing!))
    viewing = files[(index + direction + files.length) % files.length]
  }
  function drop(event: DragEvent, to: string) {
    event.preventDefault()
    const key = event.dataTransfer?.getData('text/x-h3-file')
    const file = $gallery.files.find((f) => fileKey(f) === key)
    if (file) void move([file], to)
  }
</script>

<div class:gallery-page={!embedded} class="gallery-content">
  {#if !embedded}<header class="page-heading">
      <div class="eyebrow">MADE IN YOUR STUDIO</div>
      <div class="section-head">
        <h1>Gallery <span class="badge">{$gallery.files.length}</span></h1>
        <button onclick={loadGallery}>↻ Refresh</button>
      </div>
      <p>Your generated scenes, ready to replay and refine.</p>
    </header>
    <div class="gallery-toolbar">
      <input
        type="search"
        aria-label="Search videos"
        placeholder="Search videos…"
        bind:value={search}
      /><select aria-label="Sort videos" bind:value={sort}
        ><option value="newest">Newest first</option><option value="oldest"
          >Oldest first</option
        ><option value="name">File name</option></select
      ><button
        onclick={() => {
          selectionMode = !selectionMode
          selected = []
        }}>{selectionMode ? 'Done selecting' : 'Select videos'}</button
      ><button disabled={busy} onclick={() => folderAction('create')}
        >＋ New folder</button
      >
    </div>
    <div class="folder-bar" aria-label="Gallery folders">
      <button class:active={filter === '*'} onclick={() => (filter = '*')}
        >All videos</button
      ><button
        class:active={filter === ''}
        onclick={() => (filter = '')}
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => drop(e, '')}>General</button
      >{#each $gallery.folders as name}<button
          class:active={filter === name}
          onclick={() => (filter = name)}
          ondragover={(e) => e.preventDefault()}
          ondrop={(e) => drop(e, name)}>▱ {name}</button
        >{/each}{#if filter && filter !== '*'}<button
          disabled={busy}
          onclick={() => folderAction('rename')}>Rename folder</button
        ><button disabled={busy} onclick={() => folderAction('delete')}
          >Delete folder</button
        >{/if}
    </div>
    {#if selectionMode}<div class="selection-bar">
        <label class="check"
          ><input
            type="checkbox"
            checked={files.length > 0 &&
              files.every((f) => selected.includes(fileKey(f)))}
            onchange={(e) =>
              (selected = e.currentTarget.checked ? files.map(fileKey) : [])}
          />Select all</label
        ><span>{selectedFiles.length} selected</span><select
          aria-label="Move destination"
          bind:value={destination}
          ><option value="">General</option
          >{#each $gallery.folders as name}<option>{name}</option
            >{/each}</select
        ><button
          disabled={busy || !selectedFiles.length}
          onclick={() => move(selectedFiles, destination)}>Move selected</button
        ><button
          class="danger"
          disabled={busy || !selectedFiles.length}
          onclick={() => remove(selectedFiles)}>Delete selected</button
        >
      </div>{/if}
  {:else}<div class="section-head gallery-small-heading">
      <small>{folder || 'General'} · {files.length} videos</small><button
        onclick={loadGallery}>↻ Refresh</button
      >
    </div>{/if}
  {#if $gallery.error}<div class="error" role="alert">
      {$gallery.error}<button onclick={loadGallery}>Retry</button>
    </div>{/if}
  {#if $gallery.loading}<p class="empty">
      Loading your videos…
    </p>{:else if !files.length}<div class="empty gallery-empty">
      <span>▤</span>
      <h3>{search ? 'No matching videos' : 'Your story begins here'}</h3>
      <p>
        {search
          ? 'Try another file name.'
          : 'Generated videos will appear in this space.'}
      </p>
    </div>{:else}<div class="video-grid">
      {#each files as file (fileKey(file))}<article
          class="video-card"
          draggable={!selectionMode}
          ondragstart={(e) =>
            e.dataTransfer?.setData('text/x-h3-file', fileKey(file))}
        >
          <button
            class="video-poster"
            aria-label={`Play ${file.filename}`}
            onclick={() => (selectionMode ? toggle(file) : open(file))}
            ><video src={file.url} preload="metadata" muted playsinline
              ><track kind="captions" /></video
            ><span class="play-icon">▶</span
            >{#if file.generationTime != null}<span class="time-badge"
                >{formatSeconds(file.generationTime)}</span
              >{/if}</button
          >
          <div class="video-details">
            <div class="section-head">
              {#if selectionMode}<input
                  type="checkbox"
                  aria-label={`Select ${file.filename}`}
                  checked={selected.includes(fileKey(file))}
                  onchange={() => toggle(file)}
                />{/if}<strong title={file.filename}>{file.filename}</strong>
            </div>
            <small
              >{file.subfolder || 'General'}{file.mtime
                ? ` · ${new Date(file.mtime * 1000).toLocaleString()}`
                : ''}</small
            >
            <div class="video-actions">
              <button disabled={busy} onclick={() => repeat(file)}
                >↻ Repeat</button
              ><button onclick={() => showMeta(file)}>Info</button><a
                href={download(file)}
                download={file.filename}>Download</a
              ><button
                class="danger"
                disabled={busy}
                onclick={() => remove([file])}>Delete</button
              >
            </div>
          </div>
        </article>{/each}
    </div>{/if}
</div>
<Modal bind:open={viewerOpen} title={viewing?.filename || 'Video'} wide
  >{#if viewing}<video
      class="lightbox-video"
      src={viewing.url}
      controls
      autoplay
      playsinline><track kind="captions" /></video
    >
    <div class="lightbox-actions">
      <button onclick={() => adjacent(-1)}>← Previous</button><button
        onclick={() => adjacent(1)}>Next →</button
      ><button disabled={busy} onclick={() => repeat(viewing!)}
        >Repeat generation</button
      ><button onclick={() => showMeta(viewing!)}>Metadata</button><a
        class="button"
        href={download(viewing)}
        download={viewing.filename}>Download video</a
      ><select aria-label="Move video to folder" bind:value={destination}
        ><option value="">General</option
        >{#each $gallery.folders as name}<option>{name}</option>{/each}</select
      ><button disabled={busy} onclick={() => move([viewing!], destination)}
        >Move video</button
      ><button class="danger" disabled={busy} onclick={() => remove([viewing!])}
        >Delete video</button
      >
    </div>{/if}</Modal
>
<Modal bind:open={metaOpen} title="Generation metadata" wide
  >{#if metaError}<p class="error">{metaError}</p>{:else if metadata}<pre
      class="metadata">{JSON.stringify(metadata, null, 2)}</pre>
    <div class="inline">
      <button class="primary" disabled={busy} onclick={() => repeat(viewing!)}
        >Load into editor</button
      ><button
        onclick={async () => {
          try {
            await navigator.clipboard.writeText(
              JSON.stringify(metadata, null, 2),
            )
            toast.success('Metadata copied')
          } catch {
            toast.error('Clipboard unavailable')
          }
        }}>Copy metadata</button
      >
    </div>{:else}<p>Loading metadata…</p>{/if}</Modal
>
