import type { RequestEvent } from '@sveltejs/kit'
import {
  createGalleryFolder,
  deleteGalleryFolder,
  listGalleryFolders,
  renameGalleryFolder,
} from '@/lib/gallery-folders'

/**
 * Папки галереи (правка 91) — подпапки каталога вывода ComfyUI.
 * GET    → { folders: string[] }            (общая папка '' не входит)
 * POST   → { name } создать
 * PATCH  → { from, to } переименовать (правка 122)
 * DELETE → { name } удалить (только пустую)
 */

export async function GET() {
  return Response.json({ folders: await listGalleryFolders() })
}

export async function POST({ request: req }: RequestEvent) {
  try {
    const body = await req.json()
    const r = await createGalleryFolder(String(body?.name ?? ''))
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 })
    return Response.json({ ok: true, name: r.name, folders: await listGalleryFolders() })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function PATCH({ request: req }: RequestEvent) {
  try {
    const body = await req.json()
    const r = await renameGalleryFolder(String(body?.from ?? ''), String(body?.to ?? ''))
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 })
    return Response.json({ ok: true, name: r.name, folders: await listGalleryFolders() })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function DELETE({ request: req }: RequestEvent) {
  try {
    const body = await req.json()
    const r = await deleteGalleryFolder(String(body?.name ?? ''))
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 })
    return Response.json({ ok: true, folders: await listGalleryFolders() })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
