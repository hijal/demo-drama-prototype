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
  // A non-JSON body (proxy error page, Access login HTML) must not surface as
  // a cryptic "Unexpected token <" parse error.
  const data = await response.json().catch(() => ({}))
  if (response.status === 401) throw new ApiError(SIGN_IN_MESSAGE, 401)
  if (!response.ok || data.ok === false)
    throw new ApiError(
      data.error || data.detail || `Request failed (${response.status})`,
      response.status,
    )
  return data as T
}
export const SIGN_IN_MESSAGE =
  'Sign-in required. Reload the page to log in with your owner email.'
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}
export const inputUrl = (path: string) =>
  `/api/comfy/file?${new URLSearchParams({ filename: path, type: 'input' })}`
export function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
export const fileKey = (file: { filename: string; subfolder: string }) =>
  `${file.subfolder}/${file.filename}`
