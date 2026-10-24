import { NextResponse } from 'next/server'
import { deleteModel } from '@/lib/model-downloader'
import { activeLlmModelId, llmBackend } from '@/lib/llm-runner'

export const dynamic = 'force-dynamic'

/**
 * POST /api/models/delete — удалить скачанные файлы модели (правка 139).
 *
 * Guards:
 *  • Активная LLM-квантизация (llm_assistant*, llm_assistant_qwen) — нельзя:
 *    сначала переключите модель ассистента в селекторе.
 *  • Bonsai выбрана ассистентом → основной квант PQ2_0, движок, mmproj —
 *    под замком (нужны запущенному бэкенду). Лёгкая optional PTQ1_0 —
 *    удаляется свободно: бэкенд подхватит её, только если PQ2_0 отсутствует.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const modelId: string = body.modelId || ''

    if (!modelId) {
      return NextResponse.json({ error: "Specify modelId" }, { status: 400 })
    }

    // (правка 164) Лёгкий квант Bonsai (optional) — не блокируем даже когда
    // Bonsai выбрана: бэкенд подхватит PTQ1_0, только если PQ2_0 отсутствует.
    // Удалять его — легитимное действие (освобождение места, когда PQ2_0 стоит).
    const isBonsaiLight = modelId === 'bonsai_model_light'

    // Основная модель Bonsai (PQ2_0), движок, mmproj — под замком, когда
    // Bonsai выбрана ассистентом: без них бэкенд не запустится.
    if (llmBackend() === 'bonsai' && modelId.startsWith('bonsai_') && !isBonsaiLight) {
      return NextResponse.json(
        { error: "Bonsai is now the chosen assistant model. First switch the assistant model (Settings → LLM), then delete." },
        { status: 409 },
      )
    }

    // Активная LLM-квантизация (Gemma/Qwen) — под замком.
    if (modelId === activeLlmModelId()) {
      return NextResponse.json(
        { error: "This model is now selected by the assistant. First switch the assistant model (Settings → LLM), then delete." },
        { status: 409 },
      )
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
