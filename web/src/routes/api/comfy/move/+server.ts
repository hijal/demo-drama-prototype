import type { RequestEvent } from '@sveltejs/kit'
import { moveOutputFile } from '@/lib/gallery-folders'

/**
 * POST /api/comfy/move — переместить файл вывода между папками галереи
 * (drag&drop в общей галерее, правка 91). Тело:
 *   { filename, from: string ('' = общая), to: string }
 * Вместе с файлом переезжает его .meta.json сайдкар.
 */

export async function POST({ request: req }: RequestEvent) {
  try {
    const body = await req.json()
    const r = await moveOutputFile(String(body?.filename ?? ''), String(body?.from ?? ''), String(body?.to ?? ''))
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
