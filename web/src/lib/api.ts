export async function api<T = Record<string, any>>(
  url: string,
  body?: unknown,
  method = 'POST',
): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  )
  const data = await response.json()
  if (!response.ok || data.ok === false)
    throw new Error(
      data.error || data.detail || `Request failed (${response.status})`,
    )
  return data as T
}
export const inputUrl = (path: string) =>
  `/api/comfy/file?${new URLSearchParams({ filename: path, type: 'input' })}`
export function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
export const fileKey = (file: { filename: string; subfolder: string }) =>
  `${file.subfolder}/${file.filename}`
