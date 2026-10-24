/**
 * Upload a reference file via /api/comfy/upload.
 * Returns the server-side filename. When ComfyUI is unreachable the file
 * is staged locally and `staged: true` is returned — it will be
 * transferred to ComfyUI automatically at generation time.
 */

export async function uploadInputFile(file: File): Promise<{ path: string; staged?: boolean }> {
  const form = new FormData()
  form.append('image', file)
  const res = await fetch('/api/comfy/upload', { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Upload failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  // Server returns { name: "filename", staged?: boolean }
  return { path: data.name as string, staged: data.staged === true }
}
