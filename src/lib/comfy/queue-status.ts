const COMFY_URL = (process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '')

/** True, когда в ComfyUI есть running/pending задачи (генерация «не закончилась»). */
export async function comfyBusy(): Promise<boolean> {
  try {
    const r = await fetch(`${COMFY_URL}/queue`, { signal: AbortSignal.timeout(4000) })
    if (!r.ok) return false
    const q = await r.json()
    return (q.queue_running?.length ?? 0) > 0 || (q.queue_pending?.length ?? 0) > 0
  } catch {
    return false // ComfyUI недоступен — ничего не может выполняться
  }
}
