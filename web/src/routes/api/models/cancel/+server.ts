import type { RequestEvent } from '@sveltejs/kit'
import { cancelDownload } from '@/lib/model-downloader'


export async function POST({ request: request }: RequestEvent) {
  try {
    const body = await request.json().catch(() => ({}))
    const modelId: string = body.modelId || ''

    if (!modelId) {
      return Response.json({ error: "Specify modelId" }, { status: 400 })
    }

    const result = cancelDownload(modelId)
    if (!result.ok) {
      return Response.json(result, { status: 404 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
