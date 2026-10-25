import type { RequestEvent } from '@sveltejs/kit'
import { startDownload } from '@/lib/model-downloader'


export async function POST({ request: req }: RequestEvent) {
  const body = await req.json().catch(() => null)
  const modelId = body?.modelId as string | undefined

  if (!modelId) {
    return Response.json({ ok: false, error: 'modelId is required' }, { status: 400 })
  }

  const result = await startDownload(modelId)
  return Response.json(result)
}
