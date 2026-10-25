/**
 * Central runtime app configuration, backed by config.ini next to the
 * project root. The backend folder (portable ComfyUI-Easy-Install root)
 * is user-configurable from the Settings dialog — all file routes read
 * it through getAppConfig() so a change applies without a restart.
 *
 * Precedence for the backend root:
 *   1. config.ini [comfy] comfy_dir
 *   2. env COMFY_ROOT
 *   3. ./ComfyUI-Easy-Install (default, next to the app)
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { join, resolve } from 'path'

const CONFIG_PATH = join((process.env.STUDIO_ROOT || process.cwd()), 'config', 'config.ini')

export interface AppConfig {
  reserveGb: number
  dynamicVram: boolean
  /** Root of the portable backend install (contains ComfyUI/ and python_embeded/). */
  comfyRoot: string
  /** ComfyUI output directory (gallery files). */
  outputDir: string
  /** ComfyUI input directory (reference uploads). */
  inputDir: string
  /** Embedded python executable for launching the backend. */
  pythonExe: string
  /** Custom diffusion model filename (empty = default). */
  diffusionModel: string
  /** Play notification sound when generation completes (default true). */
  soundOn: boolean
}

/* ────────────────────────── INI parsing ────────────────────────── */

function parseIni(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  let currentSection = ''
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1)
      continue
    }
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      result[`${currentSection}.${key}`] = value
      result[key] = value
    }
  }
  return result
}

/* ────────────────────────── Cached reads ────────────────────────── */

let cache: { mtimeMs: number; config: AppConfig } | null = null

export function getAppConfig(): AppConfig {
  let mtimeMs = 0
  try {
    mtimeMs = statSync(CONFIG_PATH).mtimeMs
  } catch {
    /* no config.ini yet — use defaults below */
  }
  if (cache && cache.mtimeMs === mtimeMs) return cache.config

  let ini: Record<string, string> = {}
  try {
    if (existsSync(CONFIG_PATH)) ini = parseIni(readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    /* unreadable config — fall back to defaults */
  }

  const rawRoot =
    (ini['comfy.comfy_dir'] ?? '').trim() ||
    (process.env.COMFY_ROOT || '').trim() ||
    join((process.env.STUDIO_ROOT || process.cwd()), 'ComfyUI-Easy-Install')
  const comfyRoot = resolve(rawRoot)

  const config: AppConfig = {
    reserveGb: parseFloat(ini['vram.reserve_gb'] ?? ini['reserve_gb'] ?? '3') || 3,
    // Canonical home is [vram]; [comfy]/bare kept as read fallbacks for
    // configs written by older versions.
    dynamicVram: (ini['vram.dynamic_vram'] ?? ini['comfy.dynamic_vram'] ?? ini['dynamic_vram'] ?? '1') !== '0',
    comfyRoot,
    outputDir: join(comfyRoot, 'ComfyUI', 'output'),
    inputDir: join(comfyRoot, 'ComfyUI', 'input'),
    pythonExe: join(comfyRoot, 'python_embeded', 'python.exe'),
    diffusionModel: (ini['comfy.diffusion_model'] ?? '').trim(),
    soundOn: ini['ui.sound_on'] !== '0',
  }
  cache = { mtimeMs, config }
  return config
}

/* ────────────────────────── Writing ────────────────────────── */

/**
 * Set a single `key = value` line inside an INI section, preserving the
 * rest of the file. Creates the section when missing. Resets the cache.
 */
export function setConfigValue(section: string, key: string, value: string): void {
  let content = ''
  try {
    content = readFileSync(CONFIG_PATH, 'utf-8')
  } catch {
    content = ''
  }
  // A newline inside a value would corrupt the INI layout — strip
  // line breaks and other control characters defensively.
  const safeValue = value.replace(/[\r\n\0]/g, ' ').trim()
  const lines = content.split(/\r?\n/)

  let inSection = false
  let sectionStart = -1
  let replaced = false
  let insertAt = -1

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t.startsWith('[') && t.endsWith(']')) {
      if (inSection) break // reached the next section
      inSection = t.slice(1, -1) === section
      if (inSection) sectionStart = i
      continue
    }
    if (inSection) {
      if (t.toLowerCase().startsWith(key.toLowerCase() + '=')) {
        lines[i] = `${key}=${safeValue}`
        replaced = true
        break
      }
      insertAt = i + 1 // after the last line inside the section
    }
  }

  if (!replaced) {
    if (sectionStart >= 0) {
      lines.splice(sectionStart + 1, 0, `${key}=${safeValue}`)
    } else {
      lines.push('', `[${section}]`, `${key}=${safeValue}`)
    }
  }

  writeFileSync(CONFIG_PATH, lines.join('\n'), 'utf-8')
  cache = null
}
