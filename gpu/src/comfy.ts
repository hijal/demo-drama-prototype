import {
  buildMiniMaxH3Workflow,
  type MiniMaxH3Params,
} from '../../src/lib/comfy/minimax-h3-template'
import { readFile } from 'node:fs/promises'
import { download, probe } from './io'
import { join } from 'node:path'
const base = (process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(
  /\/$/,
  '',
)
export const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const done = () => {
        signal?.removeEventListener('abort', cancel)
        resolve()
      },
      timer = setTimeout(done, ms)
    const cancel = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', cancel, { once: true })
  })
export async function comfy(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal || AbortSignal.timeout(30000),
  })
  if (!r.ok)
    throw new Error(`ComfyUI ${path.split('?')[0]} failed (${r.status})`)
  return r.json() as Promise<any>
}
export async function waitIdle(signal: AbortSignal) {
  for (let i = 0; i < 720; i++) {
    const queue = await comfy('/queue', undefined, signal)
    if (!queue.queue_running?.length && !queue.queue_pending?.length) return
    await delay(5000, signal)
  }
  throw new Error('ComfyUI did not become idle')
}
export async function releaseComfy(signal: AbortSignal) {
  await waitIdle(signal)
  await comfy('/free', { unload_models: true, free_memory: true }, signal)
}
export async function upload(path: string, signal: AbortSignal) {
  const bytes = await readFile(path),
    form = new FormData()
  form.append('image', new Blob([bytes]), path.split('/').pop()!)
  form.append('type', 'input')
  const r = await fetch(base + '/upload/image', {
    method: 'POST',
    body: form,
    signal,
  })
  if (!r.ok) throw new Error('ComfyUI reference upload failed')
  return ((await r.json()) as { name: string }).name
}
export async function render(
  params: MiniMaxH3Params,
  folder: string,
  signal: AbortSignal,
  onProgress: (pct: number, stage: string) => Promise<void>,
) {
  const clientId = crypto.randomUUID(),
    data = await comfy(
      '/prompt',
      {
        prompt: buildMiniMaxH3Workflow(params),
        client_id: clientId,
        extra_data: {
          extra_pnginfo: {
            workflow: {
              extra: { VHS_MetadataImage: false, VHS_KeepIntermediate: false },
            },
          },
        },
      },
      signal,
    )
  if (!data.prompt_id) throw new Error('ComfyUI did not return a prompt ID')
  const cancel = () => {
    void (async () => {
      const q = await comfy('/queue')
      if (q.queue_running?.some((entry: any[]) => entry[1] === data.prompt_id))
        await comfy('/interrupt', {})
      await comfy('/queue', { delete: [data.prompt_id] })
    })().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    for (let i = 0; i < 3600; i++) {
      signal.throwIfAborted()
      const history = await comfy(
          `/history/${encodeURIComponent(data.prompt_id)}`,
          undefined,
          signal,
        ),
        entry = history[data.prompt_id]
      if (entry?.status?.status_str === 'error')
        throw new Error('ComfyUI workflow execution failed')
      if (entry?.status?.completed) {
        const outputs = Object.values(entry.outputs || {})
          .flatMap((node: any) =>
            Object.values(node).filter(Array.isArray).flat(),
          )
          .filter(
            (f: any) =>
              f &&
              typeof f.filename === 'string' &&
              /\.(mp4|webm|mov)$/i.test(f.filename),
          ) as Array<{ filename: string; subfolder?: string; type?: string }>
        for (let n = 0; n < outputs.length; n++) {
          const file = outputs[n],
            path = join(folder, `render-${n}.mp4`)
          await download(
            `${base}/view?${new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || '', type: file.type || 'output' })}`,
            path,
            {},
            signal,
          )
          const details = await probe(path, signal)
          if (details.audio) return { path, ...details }
        }
        throw new Error('ComfyUI returned no video with audio')
      }
      if (i % 15 === 0)
        await onProgress(Math.min(80, 10 + i / 10), 'Rendering H3 video')
      await delay(1000, signal)
    }
    throw new Error('H3 rendering exceeded one hour')
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}
