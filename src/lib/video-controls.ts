export interface ModelOptions {
  model_type: string
  architecture: string
  fps: number
  frames_minimum: number
  frames_steps: number
  frames_maximum: number | null
  /** Frame count must satisfy `steps*n + remainder`. */
  frameAlignment?: { modulus: number; remainder: number }
  omni_reference: boolean
  omni_reference_limits?: {
    image: number
    video: number
    audio: number
    total: number
  } | null
  omni_reference_detail_choices?: Array<[string, string]> | null
  omni_reference_detail_default?: string
  minimax_h3_text_encoder_choices?: Array<{
    value: string
    label: string
    size_hint?: string
    recommended?: boolean
  }> | null
  minimax_h3_text_encoder_default?: string | null
  minimax_h3_turbo?: {
    filename: string
    label?: string
    steps?: number
    weight?: number
    experimental?: boolean
    guide?: string
  } | null
  minimax_h3_runtime_advisory?: string | null
  resolution_presets?: Record<string, unknown> | null
  resolution_preset_order?: string[] | null
  supports_auto_aspect?: boolean
  no_negative_prompt?: boolean
  i2v_class?: boolean
  t2v_class?: boolean
  returns_audio?: boolean
  supports_end_frame?: boolean
  default_num_inference_steps?: number | null
  default_guidance_scale?: number | null
  [key: string]: unknown
}

/** Snap a frame count onto the model's alignment grid (min + k*step). */
export function alignFrames(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const s = step > 0 ? step : 1
  const snapped = min + Math.round((value - min) / s) * s
  return Math.max(min, Math.min(max, snapped))
}

/**
 * Fallback resolution presets for H3 while model-options is loading.
 * (правка 124) Значения = ТОЧНЫЕ номинальные (финальные) размеры видео:
 * короткая сторона = «p», длинная = короткая × (A:B) до чётного.
 * Генерация идёт чуть крупнее (кратное 32), в конце — кроп ровно до
 * номинала (16:9 1080p → 1920×1080). Не путать с gen-размером!
 */
export const FALLBACK_H3_PRESETS: Record<string, Record<string, string>> = {
  '480p': {
    '16:9': '854x480',
    '9:16': '480x854',
    '1:1': '480x480',
    '4:3': '640x480',
    '3:4': '480x640',
    '21:9': '1120x480',
  },
  '720p': {
    '16:9': '1280x720',
    '9:16': '720x1280',
    '1:1': '720x720',
    '4:3': '960x720',
    '3:4': '720x960',
    '21:9': '1680x720',
  },
  '1080p': {
    '16:9': '1920x1080',
    '9:16': '1080x1920',
    '1:1': '1080x1080',
    '21:9': '2520x1080',
  },
}

/** Derive (quality, aspect) from a nominal resolution string like "1280x720". (правка 124) */
export function parseResolution(
  res: string,
  presets: Record<string, Record<string, string>>,
): { quality: string; aspect: string } {
  for (const [quality, aspects] of Object.entries(presets)) {
    for (const [aspect, value] of Object.entries(aspects)) {
      if (value === res) return { quality, aspect }
    }
  }
  return { quality: '720p', aspect: '16:9' }
}

/** Resolve a resolution string from quality + aspect using presets. */
export function resolveResolution(
  quality: string,
  aspect: string,
  presets: Record<string, Record<string, string>>,
): string {
  const aspects = presets[quality]
  if (aspects) {
    if (aspects[aspect]) return aspects[aspect]
    if (aspects['auto']) return aspects['auto']
  }
  return '1280x720'
}

/** Extract resolution presets from model-options (with H3 fallback). */
export function buildPresets(
  options: ModelOptions | null,
  isH3: boolean,
): Record<string, Record<string, string>> {
  const raw = options?.resolution_presets as Record<string, unknown> | null
  if (raw && Object.keys(raw).length > 0) {
    // Sort tiers by numeric quality first ("480p" → 480) so the list always
    // reads ascending; backend order breaks ties for non-numeric names.
    const order = (options?.resolution_preset_order as string[] | null) ?? []
    const qualityNum = (g: string) => Number.parseInt(g, 10) || 0
    const orderIdx = (g: string) => {
      const i = order.indexOf(g)
      return i === -1 ? 99 : i
    }
    const groups = Object.keys(raw).sort(
      (a, b) => qualityNum(a) - qualityNum(b) || orderIdx(a) - orderIdx(b),
    )
    const out: Record<string, Record<string, string>> = {}
    for (const g of groups) {
      const entry = raw[g]
      // { label, values: { aspect: resolution } } shape
      if (
        entry &&
        typeof entry === 'object' &&
        'values' in (entry as Record<string, unknown>)
      ) {
        out[g] = { ...(entry as { values: Record<string, string> }).values }
      } else if (entry && typeof entry === 'object') {
        // Flat fallback: { aspect: resolution }
        out[g] = { ...(entry as Record<string, string>) }
      }
    }
    if (Object.keys(out).length > 0) return out
  }
  if (!isH3) return {}
  return JSON.parse(JSON.stringify(FALLBACK_H3_PRESETS)) as Record<
    string,
    Record<string, string>
  >
}

/** Flat list of all resolution values inside presets. */
export function collectResolutionValues(
  presets: Record<string, Record<string, string>>,
): string[] {
  const values: string[] = []
  for (const aspects of Object.values(presets))
    values.push(...Object.values(aspects))
  return values
}
