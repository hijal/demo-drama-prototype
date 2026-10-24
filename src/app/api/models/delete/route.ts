import { NextResponse } from 'next/server'
import { deleteModel } from '@/lib/model-downloader'

export const dynamic = 'force-dynamic'

/** POST /api/models/delete — удалить скачанные файлы модели (правка 139). */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const modelId: string = body.modelId || ''

    if (!modelId) {
      return NextResponse.json({ error: "Specify modelId" }, { status: 400 })
    }

    const result = deleteModel(modelId)
    if (!result.ok) {
      return NextResponse.json(result, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
