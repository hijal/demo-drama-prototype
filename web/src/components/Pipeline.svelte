<script lang="ts">
  import { onMount } from 'svelte'
  import { api, message } from '../lib/api'
  import { toast } from '@/lib/notifications'
  import { parseScript } from '../../../worker/src/script/parse'
  import { diffLines } from '../../../worker/src/script/diff'
  let projects = $state<any[]>([]),
    detail = $state<any>(null),
    projectId = $state(''),
    tab = $state('Script')
  let title = $state(''),
    draft = $state(''),
    raw = $state(''),
    scriptId = $state(''),
    dirty = $state(false),
    episode = $state(0),
    repairEpisode = $state(1)
  let busy = $state(false),
    error = $state(''),
    logs = $state<any[]>([]),
    gpuOnline = $state(false),
    burnSubtitles = $state(false),
    scope = $state('all')
  let assetNotes = $state<Record<string, string>>({}),
    sceneNotes = $state<Record<string, string>>({})
  let loadVersion = 0
  const media = (key: string) => `/api/media?key=${encodeURIComponent(key)}`
  const latest = $derived(detail?.scripts?.find((s: any) => s.id === scriptId))
  const issues = $derived.by(() => {
    try {
      return JSON.parse(latest?.report_json || '{}').issues || []
    } catch {
      return []
    }
  })
  const scenes = $derived(
    detail?.scenes?.filter((s: any) => s.episode_number === episode) || [],
  )
  const changes = $derived(diffLines(raw, draft))
  const ast = $derived(parseScript(draft))
  async function list() {
    try {
      projects = (await api('/api/projects')).projects || []
      error = ''
    } catch (e) {
      error = message(e)
    }
  }
  async function load(selected = projectId) {
    if (!selected) return
    const version = ++loadVersion
    try {
      const data = await api(`/api/projects/${selected}`)
      if (version !== loadVersion || selected !== projectId) return
      detail = data
      error = ''
      const next = data.scripts[0]
      if (next && !dirty && next.id !== scriptId) {
        scriptId = next.id
        draft = next.body
        raw = data.scripts.find((s: any) => s.kind === 'raw')?.body || next.body
      }
      if (
        data.episodes.length &&
        !data.episodes.some((ep: any) => ep.number === episode)
      )
        episode = data.episodes[0].number
    } catch (e) {
      if (version === loadVersion) error = message(e)
    }
  }
  async function choose(selected: string) {
    projectId = selected
    detail = null
    scriptId = ''
    draft = ''
    raw = ''
    dirty = false
    logs = []
    await load(selected)
  }
  async function action(fn: () => Promise<unknown>) {
    busy = true
    try {
      await fn()
      await load()
      await list()
    } catch (e) {
      toast.error(message(e))
      error = message(e)
    } finally {
      busy = false
    }
  }
  async function create() {
    if (!title.trim()) return
    await action(async () => {
      const p = await api('/api/projects', { title: title.trim() })
      title = ''
      await choose(p.id)
    })
  }
  async function save(fix: boolean) {
    if (!draft.trim()) return
    await action(async () => {
      const result = await api(`/api/projects/${projectId}/scripts`, {
        body: draft,
        fix,
        episode: fix && ast.episodes.length > 1 ? repairEpisode : undefined,
      })
      dirty = false
      scriptId = result.versionId
      toast.success(
        fix ? 'Script repair queued for Colab' : 'Script version saved',
      )
    })
  }
  async function approve() {
    await action(async () => {
      let versionId = scriptId
      if (dirty) {
        const result = await api(`/api/projects/${projectId}/scripts`, {
          body: draft,
        })
        versionId = result.versionId
        dirty = false
      }
      await api(`/api/projects/${projectId}/approve-script`, {
        versionId,
        revision: detail.project.revision,
      })
      toast.success('Script approved; review the cast and locations next')
      tab = 'Cast & locations'
    })
  }
  async function uploadScript(file: File | undefined) {
    if (!file) return
    if (file.size > 1_000_000) {
      toast.error('Script exceeds 1 MB')
      return
    }
    draft = await file.text()
    raw = draft
    dirty = true
    tab = 'Script'
  }
  onMount(() => {
    let disposed = false,
      inFlight = false
    void list()
    const timer = setInterval(async () => {
      if (inFlight) return
      inFlight = true
      try {
        if (projectId) await load()
        const status = await api('/api/status')
        if (!disposed) gpuOnline = !!status.gpu?.length
      } catch {
      } finally {
        inFlight = false
      }
    }, 3000)
    return () => {
      disposed = true
      loadVersion++
      clearInterval(timer)
    }
  })
  $effect(() => {
    const selected = projectId
    if (!selected) return
    let disposed = false,
      socket: WebSocket | undefined
    let polling = false
    async function poll() {
      if (disposed || polling) return
      polling = true
      try {
        const rows = await api<any[]>(`/api/projects/${selected}/logs`)
        if (!disposed) logs = rows
      } catch {
      } finally {
        polling = false
      }
    }
    try {
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/projects/${selected}/logs`,
      )
      socket.onmessage = (e) => {
        if (disposed) return
        try {
          const value = JSON.parse(e.data)
          logs = value.history || [...logs, value].slice(-500)
        } catch {}
      }
      socket.onerror = () => void poll()
    } catch {}
    void poll()
    const timer = setInterval(() => {
      if (socket?.readyState !== WebSocket.OPEN) void poll()
    }, 3000)
    return () => {
      disposed = true
      clearInterval(timer)
      socket?.close()
    }
  })
</script>

<div class="pipeline-page">
  <header class="page-heading">
    <div class="eyebrow">SCRIPT → FINISHED VIDEO</div>
    <div class="section-head">
      <h1>Drama pipeline</h1>
      <span class="badge">{gpuOnline ? 'Colab online' : 'GPU offline'}</span>
    </div>
    <p>
      Review the script and references, then let the scene queue build your
      film.
    </p>
  </header>
  {#if !gpuOnline}<div class="pipeline-banner">
      Colab chalu koro to run script repair, references and rendering. Reviewing
      saved results works while the GPU is off. <a
        href="https://colab.research.google.com/github/hijal/demo-drama-prototype/blob/drama-pipeline/Drama_Pipeline_Colab.ipynb"
        target="_blank"
        rel="noreferrer">Open pipeline notebook ↗</a
      ><small>Running the GPU runtime consumes Colab compute units.</small>
    </div>{/if}
  {#if error}<p class="error" role="alert">
      {error}
      <button
        onclick={() => {
          void list()
          void load()
        }}>Retry</button
      >
    </p>{/if}
  <div class="project-toolbar">
    <label class="field"
      ><span>Project</span><select
        value={projectId}
        onchange={(e) => choose(e.currentTarget.value)}
        ><option value="">Choose a project</option
        >{#each projects as project}<option value={project.id}
            >{project.title}</option
          >{/each}</select
      ></label
    ><label class="field"
      ><span>New project title</span><input
        bind:value={title}
        maxlength="200"
        onkeydown={(e) => {
          if (e.key === 'Enter') void create()
        }}
      /></label
    ><button class="primary" disabled={busy || !title.trim()} onclick={create}
      >Create project</button
    >
  </div>
  {#if detail}<div class="pipeline-tabs">
      {#each ['Script', 'Cast & locations', 'Scenes', 'Final', 'Logs'] as name}<button
          class:active={tab === name}
          onclick={() => (tab = name)}>{name}</button
        >{/each}
    </div>
    {#if tab === 'Script'}
      <div class="section-head">
        <h2>Script review</h2>
        <label class="button"
          >Upload .txt<input
            type="file"
            accept=".txt,text/plain"
            class="visually-hidden"
            aria-label="Upload drama script"
            onchange={(e) => {
              void uploadScript(e.currentTarget.files?.[0])
              e.currentTarget.value = ''
            }}
          /></label
        >
      </div>
      <div class="script-review">
        <label class="field"
          ><span>Original script</span><textarea
            readonly
            value={raw}
            aria-label="Original drama script"></textarea></label
        ><label class="field"
          ><span>Review and edit</span><textarea
            value={draft}
            aria-label="Reviewed drama script"
            oninput={(e) => {
              draft = e.currentTarget.value
              dirty = true
            }}></textarea></label
        >
      </div>
      <div class="inline">
        <button disabled={busy || !draft.trim()} onclick={() => save(false)}
          >Save version</button
        >{#if ast.episodes.length > 1}<label class="field"
            ><span>Repair episode</span><select bind:value={repairEpisode}
              >{#each ast.episodes as ep}<option value={ep.number}
                  >{ep.number} · {ep.title}</option
                >{/each}</select
            ></label
          >{/if}<button
          disabled={busy || !draft.trim()}
          onclick={() => save(true)}>Repair with Colab LLM</button
        ><button
          class="primary"
          disabled={busy || !draft.trim() || (!scriptId && !dirty)}
          onclick={approve}>Approve script</button
        >
      </div>
      <p class="hint">
        Approval accepts the current script and proposed descriptions.
        Generation starts only after the required reference assets are approved.
      </p>
      {#if detail.scripts.length}<label class="field"
          ><span>Version history</span><select
            value={scriptId}
            onchange={(e) => {
              const version = detail.scripts.find(
                (s: any) => s.id === e.currentTarget.value,
              )
              if (version) {
                scriptId = version.id
                draft = version.body
                dirty = false
              }
            }}
            >{#each detail.scripts as version}<option value={version.id}
                >{version.kind} · {new Date(
                  version.created_at,
                ).toLocaleString()}</option
              >{/each}</select
          ></label
        >{/if}
      {#if issues.length}<div class="issue-list">
          {#each issues as issue}<p class:error={issue.severity === 'error'}>
              <strong>{issue.code} · line {issue.line}</strong>
              {issue.message_bn || issue.message_en}
            </p>{/each}
        </div>{/if}
      <details>
        <summary>Changed lines</summary>
        <div class="script-diff">
          {#each changes as change}<small>Line {change.line}</small
            >{#each change.removed as line}<pre
                class="removed">− {line}</pre>{/each}{#each change.added as line}<pre
                class="added">＋ {line}</pre>{/each}{/each}
        </div>
      </details>
    {:else if tab === 'Cast & locations'}
      <div class="section-head">
        <h2>Cast, props & locations</h2>
        <small
          >Approve every required identity and voice before rendering.</small
        >
      </div>
      <div class="asset-grid">
        {#each detail.assets as asset (asset.id)}{@const versions =
            detail.assetVersions.filter(
              (v: any) => v.asset_id === asset.id,
            )}{@const latestVersion = versions[0]}{@const files = latestVersion
            ? JSON.parse(latestVersion.files_json)
            : {}}
          <article class="asset-card">
            <div class="section-head">
              <h3>{asset.name}</h3>
              <span class="badge">{asset.status}</span>
            </div>
            <small
              >@{asset.ref} · {asset.kind}{asset.approved_version
                ? ` · approved v${asset.approved_version}`
                : ''}</small
            >{#if files.sheet}<a
                href={media(files.sheet)}
                target="_blank"
                rel="noreferrer"
                ><img
                  src={media(files.sheet)}
                  alt={`${asset.name} reference sheet`}
                /></a
              >{/if}{#if files.voice}<audio controls src={media(files.voice)}
              ></audio>{/if}
            <details>
              <summary>Description</summary>
              <pre class="metadata">{JSON.stringify(
                  JSON.parse(asset.spec_json).fields,
                  null,
                  2,
                )}</pre>
            </details>
            <label class="field"
              ><span>Change instruction</span><input
                placeholder="Change only the outfit…"
                value={assetNotes[asset.id] || ''}
                oninput={(e) => (assetNotes[asset.id] = e.currentTarget.value)}
              /></label
            >
            <div class="inline">
              <button
                disabled={busy || asset.status === 'generating'}
                onclick={() =>
                  action(() =>
                    api(
                      `/api/projects/${projectId}/assets/${encodeURIComponent(asset.id)}/generate`,
                      { instruction: assetNotes[asset.id] || '' },
                    ),
                  )}
                >{latestVersion
                  ? 'Change / regenerate'
                  : 'Generate reference'}</button
              ><button
                disabled={busy || asset.status === 'generating'}
                onclick={() =>
                  action(() =>
                    api(
                      `/api/projects/${projectId}/assets/${encodeURIComponent(asset.id)}/generate`,
                      { instruction: '' },
                    ),
                  )}>Recreate</button
              >
            </div>
            {#if versions.length}<label class="field"
                ><span>Approve a version</span><select
                  aria-label={`Approve reference version for ${asset.name}`}
                  value=""
                  onchange={(e) => {
                    const version = Number(e.currentTarget.value)
                    if (version)
                      void action(() =>
                        api(
                          `/api/projects/${projectId}/assets/${encodeURIComponent(asset.id)}/approve`,
                          { version },
                        ),
                      )
                    e.currentTarget.value = ''
                  }}
                  ><option disabled value=""
                    >Choose after reviewing image and voice</option
                  >{#each versions as version}<option value={version.version}
                      >Version {version.version}{asset.approved_version ===
                      version.version
                        ? ' · approved'
                        : ''}</option
                    >{/each}</select
                ></label
              >{/if}
          </article>
        {:else}<p class="empty">
            Approve a valid script to create its asset cards.
          </p>{/each}
      </div>
    {:else if tab === 'Scenes'}
      <div class="section-head">
        <h2>Scene board</h2>
        <select aria-label="Scene board episode" bind:value={episode}
          >{#each detail.episodes as ep}<option value={ep.number}
              >{ep.number === 0 ? 'Film' : `Episode ${ep.number}`} · {ep.title}</option
            >{/each}</select
        >
      </div>
      <div class="inline">
        <button
          class="primary"
          disabled={busy || !scenes.length}
          onclick={() =>
            action(() => api(`/api/projects/${projectId}/render`, { episode }))}
          >Render episode automatically</button
        ><button
          disabled={busy}
          onclick={() =>
            action(() => api(`/api/projects/${projectId}/stop`, {}))}
          >Stop after current jobs</button
        ><small
          >{detail.project.auto_episode !== null
            ? 'Automatic queue enabled'
            : 'Automatic queue paused'}</small
        >
      </div>
      <div class="scene-board">
        {#each scenes as scene (scene.id)}{@const spec = JSON.parse(
            scene.spec_json,
          )}{@const takes = detail.clips.filter(
            (c: any) => c.scene_id === scene.id,
          )}
          <article class="scene-card">
            <div class="section-head">
              <h3>Scene {scene.number} · {spec.title}</h3>
              <span class="badge">{scene.duration}s requested</span>
            </div>
            <p>
              {spec.fields.VISUAL || spec.fields.KEYFRAME || spec.fields.AT}
            </p>
            <small>{spec.fields.CAMERA}</small>
            <label class="field"
              ><span>Regeneration note</span><input
                value={sceneNotes[scene.id] || ''}
                oninput={(e) => (sceneNotes[scene.id] = e.currentTarget.value)}
              /></label
            ><button
              disabled={busy ||
                takes.some((take: any) =>
                  ['queued', 'rendering', 'qa'].includes(take.status),
                )}
              onclick={() =>
                action(() =>
                  api(
                    `/api/projects/${projectId}/scenes/${encodeURIComponent(scene.id)}/render`,
                    { note: sceneNotes[scene.id] || '' },
                  ),
                )}>{takes.length ? 'Regenerate' : 'Render scene'}</button
            >
            {#each takes as take (take.id)}<div class="take">
                <div class="section-head">
                  <strong>Take {take.take}</strong><span class="badge"
                    >{scene.approved_clip_id === take.id
                      ? 'Approved'
                      : take.status}</span
                  >
                </div>
                {#if take.r2_key}<video
                    controls
                    preload="metadata"
                    src={media(take.r2_key)}><track kind="captions" /></video
                  >{/if}{#if take.qa_json}{@const qa = JSON.parse(take.qa_json)}
                  <div class="qa-report">
                    <strong
                      >{qa.pass
                        ? 'QA passed'
                        : qa.needsOwnerReview
                          ? 'Owner check required'
                          : 'QA flagged issues'}</strong
                    >{#each qa.issues || [] as issue}<p>{issue}</p>{/each}
                  </div>{/if}<button
                  disabled={busy || !['ready', 'review'].includes(take.status)}
                  onclick={() =>
                    action(() =>
                      api(
                        `/api/projects/${projectId}/scenes/${encodeURIComponent(scene.id)}/approve-clip`,
                        { clipId: take.id },
                      ),
                    )}>Use this take</button
                >
              </div>{/each}
          </article>{:else}<p class="empty">
            Approve a script to create the scene board.
          </p>{/each}
      </div>
    {:else if tab === 'Final'}
      <h2>Assemble final video</h2>
      <p class="hint">
        Only current approved takes are assembled. Audio timing comes from the
        generated clips.
      </p>
      <label class="field"
        ><span>Scope</span><select bind:value={scope}
          ><option value="all">Whole project / series</option
          >{#each detail.episodes as ep}<option value={String(ep.number)}
              >{ep.number === 0 ? 'Film' : `Episode ${ep.number}`}</option
            >{/each}</select
        ></label
      ><label class="check"
        ><input type="checkbox" bind:checked={burnSubtitles} />Burn subtitles
        into the video</label
      ><label class="button"
        >Upload continuous music<input
          type="file"
          accept="audio/*"
          class="visually-hidden"
          aria-label="Upload final music"
          onchange={(e) => {
            const file = e.currentTarget.files?.[0]
            if (file)
              void action(async () => {
                const response = await fetch(
                  `/api/projects/${projectId}/music`,
                  {
                    method: 'PUT',
                    headers: { 'Content-Type': file.type || 'audio/mpeg' },
                    body: file,
                  },
                )
                if (!response.ok) throw new Error('Music upload failed')
                toast.success('Music uploaded')
              })
            e.currentTarget.value = ''
          }}
        /></label
      >{#if detail.project.music_key}<audio
          controls
          src={media(detail.project.music_key)}
        ></audio>{/if}<button
        class="primary"
        disabled={busy}
        onclick={() =>
          action(() =>
            api(`/api/projects/${projectId}/assemble`, {
              episode: scope === 'all' ? 'all' : Number(scope),
              burnSubtitles,
            }),
          )}>Make final video</button
      >
      {#each detail.renders as final}<article class="final-render">
          <div class="section-head">
            <strong
              >{final.scope === 'all'
                ? 'Full project'
                : `Episode ${final.scope}`}</strong
            ><span class="badge">{final.status}</span>
          </div>
          {#if final.r2_key}<video controls src={media(final.r2_key)}
              ><track kind="captions" /></video
            >
            <div class="inline">
              <a href={media(final.r2_key)} download="final.mp4">Download MP4</a
              >{#if final.srt_r2_key}<a
                  href={media(final.srt_r2_key)}
                  download="final.srt">Download subtitles</a
                >{/if}
            </div>{/if}
        </article>{/each}
    {:else if tab === 'Logs'}<div class="section-head">
        <h2>Live project logs</h2>
        <button onclick={() => void load()}>Refresh jobs</button>
      </div>
      <div class="job-list">
        {#each detail.jobs as job}<article>
            <div class="section-head">
              <strong>{job.type}</strong><span class="badge"
                >{job.status} · attempt {job.attempt}</span
              >
            </div>
            <progress value={job.pct} max="100"></progress><small
              >{job.stage}</small
            >{#if job.error}<p class="error">
                {job.error}
              </p>{/if}{#if ['queued', 'claimed', 'running'].includes(job.status)}<button
                disabled={busy}
                onclick={() =>
                  action(() =>
                    api(
                      `/api/projects/${projectId}/jobs/${encodeURIComponent(job.id)}/cancel`,
                      {},
                    ),
                  )}>Cancel job</button
              >{/if}
          </article>{/each}
      </div>
      <pre class="live-logs">{logs
          .map((log) => `${new Date(log.at).toLocaleTimeString()} ${log.line}`)
          .join('\n')}</pre>
    {/if}
  {:else}<div class="empty">
      <h2>Start with a project</h2>
      <p>Create a project, then upload your drama script.</p>
    </div>{/if}
</div>
