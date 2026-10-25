import { resetLorasToDefaults, loadLoras } from '@/lib/loras-config'

/**
 * POST /api/loras/reset — (правка 130) Заводской сброс настроек LoRA.
 *
 * Все лоры выключаются (enabled=false), сила сбрасывается к 1.0,
 * триггеры очищаются. Файл data/loras.json перезаписывается «чистым»
 * состоянием. Вызывается из «Заводской сброс» в настройках.
 */
export async function POST() {
  try {
    const defaults = resetLorasToDefaults()
    return Response.json({
      ok: true,
      count: defaults.length,
      message: `LoRA settings have been reset (LORA: ${defaults.length})`,
    })
  } catch (e) {
    console.error('[loras/reset] error:', e)
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "LoRA reset error" },
      { status: 500 },
    )
  }
}
