import type { RequestEvent } from '@sveltejs/kit'
import { cancelPrompt } from '@/lib/comfy/minimax-h3-client'

/**
 * POST /api/comfy/cancel
 * Body: { prompt_id: string }
 */
export async function POST({ request: req }: RequestEvent) {
  try {
    const body = await req.json()
    const promptId = body.prompt_id as string
    if (!promptId) {
      return Response.json({ error: 'prompt_id required' }, { status: 400 })
    }
    await cancelPrompt(promptId)
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
