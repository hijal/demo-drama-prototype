import { NextResponse } from 'next/server'
import { getAppConfig, setConfigValue } from '@/lib/app-config'

/**
 * GET /api/config — runtime app settings (config.ini).
 * POST /api/config — update settings: { reserve_gb?, dynamic_vram?, comfy_dir?, diffusion_model?, sound_on? }.
 *
 * comfy_dir is the root of the portable backend install (the folder that
 * contains ComfyUI/ and python_embeded/). Changing it re-points every
 * file route immediately — no restart needed.
 */
function configResponse() {
  const config = getAppConfig()
  return {
    reserve_gb: config.reserveGb,
    dynamic_vram: config.dynamicVram,
    comfy_dir: config.comfyRoot,
    diffusion_model: config.diffusionModel,
    sound_on: config.soundOn,
  }
}

export async function GET() {
  try {
    return NextResponse.json(configResponse())
  } catch {
    return NextResponse.json({ reserve_gb: 3, dynamic_vram: true, comfy_dir: '', diffusion_model: '', sound_on: true })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (body.reserve_gb !== undefined) {
      const reserveGb = Math.max(0, Math.min(16, parseFloat(body.reserve_gb) || 3))
      setConfigValue('vram', 'reserve_gb', String(reserveGb))
    }

    if (body.dynamic_vram !== undefined) {
      setConfigValue('vram', 'dynamic_vram', body.dynamic_vram ? '1' : '0')
    }

    if (typeof body.comfy_dir === 'string' && body.comfy_dir.trim()) {
      setConfigValue('comfy', 'comfy_dir', body.comfy_dir.trim())
    }

    if (typeof body.diffusion_model === 'string') {
      setConfigValue('comfy', 'diffusion_model', body.diffusion_model.trim())
    }

    if (typeof body.sound_on === 'boolean') {
      setConfigValue('ui', 'sound_on', body.sound_on ? '1' : '0')
    }

    return NextResponse.json({ ok: true, ...configResponse() })
  } catch {
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }
}
