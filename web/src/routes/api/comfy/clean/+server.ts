import type { RequestEvent } from '@sveltejs/kit'
import { promises as fs } from 'fs'
import path from 'path'
import { getAppConfig } from '@/lib/app-config'

/**
 * POST /api/comfy/clean
 * Body: { target: 'input' | 'output' }
 *
 * Удаляет ВСЕ файлы и подкаталоги в указанной директории.
 * Сама директория сохраняется (удаляется только её содержимое).
 *
 * - target='input'   → очищает ComfyUI/input  (референсы, кадры, загрузки)
 * - target='output'  → очищает ComfyUI/output (сгенерированные видео + .meta.json)
 */

/** Рекурсивно очищает содержимое одной директории. Возвращает число удалённых элементов. */
async function cleanDirectory(dir: string): Promise<number> {
  try {
    await fs.stat(dir)
  } catch {
    return 0 // Директории нет — считаем, что она уже пуста
  }

  const entries = await fs.readdir(dir, { withFileTypes: true })
  let deleted = 0
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    try {
      if (entry.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true })
      } else {
        await fs.unlink(fullPath)
      }
      deleted++
    } catch {
      // Файл мог быть занят — пропускаем
    }
  }
  return deleted
}

export async function POST({ request: req }: RequestEvent) {
  try {
    const body = await req.json()
    const target: unknown = body.target

    if (target !== 'input' && target !== 'output') {
      return Response.json(
        { error: 'target must be "input" or "output"' },
        { status: 400 },
      )
    }

    const config = getAppConfig()
    const dir = target === 'input' ? config.inputDir : config.outputDir

    if (!dir) {
      return Response.json({ error: "The directory is not configured" }, { status: 400 })
    }

    const deleted = await cleanDirectory(dir)
    return Response.json({ ok: true, deleted })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to clear directory"
    return Response.json({ error: message }, { status: 500 })
  }
}
