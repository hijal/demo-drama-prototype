import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getAppConfig } from '@/lib/app-config'

/**
 * GET /api/comfy/meta?path=subfolder/filename.ext
 * Reads the .meta.json sidecar file from the ComfyUI output directory.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('path')
  const OUTPUT_DIR = getAppConfig().outputDir

  if (!filePath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 })
  }

  // Sanitize: prevent path traversal
  const safePath = filePath.replace(/^[\\/]+/, '').replace(/\.\.\//g, '')
  const metaFile = path.resolve(path.join(OUTPUT_DIR, safePath + '.meta.json'))

  // Ensure resolved path is within output dir
  if (!metaFile.startsWith(OUTPUT_DIR)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  try {
    if (!fs.existsSync(metaFile)) {
      return NextResponse.json({ error: 'Metadata file not found' }, { status: 404 })
    }
    const raw = fs.readFileSync(metaFile, 'utf-8')
    const data = JSON.parse(raw)
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read metadata' },
      { status: 500 },
    )
  }
}
