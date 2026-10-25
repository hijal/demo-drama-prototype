import type { RequestEvent } from '@sveltejs/kit'
import { writeMetaSidecar, clearPendingMeta } from '@/lib/pending-meta'

/**
 * POST /api/comfy/metadata
 * Body: { filename, subfolder, params: {...} }
 * Client fast path: saves a .meta.json sidecar next to the output file.
 * The server-side pending copy is cleared for this job so it never
 * overwrites the fresher client data.
 */

interface MetadataBody {
  filename: string
  subfolder?: string
  params: Record<string, unknown>
}

export async function POST({ request: req }: RequestEvent) {
  try {
    const body = (await req.json()) as MetadataBody

    if (!body.filename || !body.params) {
      return Response.json({ error: 'filename and params are required' }, { status: 400 })
    }

    const metaFile = writeMetaSidecar(body.filename, body.subfolder || '', body.params)
    if (!metaFile) {
      return Response.json({ error: 'Invalid path' }, { status: 400 })
    }

    // Drop the server-side pending copy (client data wins)
    if (typeof body.params.job_id === 'string') {
      clearPendingMeta(body.params.job_id)
    }

    return Response.json({ ok: true, path: metaFile })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to save metadata' },
      { status: 500 },
    )
  }
}
