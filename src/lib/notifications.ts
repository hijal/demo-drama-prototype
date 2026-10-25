export interface Notice {
  id: number
  kind: string
  text: string
  description?: string
  duration?: number
}
let nextId = 0
function show(
  kind: string,
  text: string,
  options?: { description?: string; duration?: number },
) {
  if (typeof window !== 'undefined')
    window.dispatchEvent(
      new CustomEvent<Notice>('h3:notice', {
        detail: { id: ++nextId, kind, text, ...options },
      }),
    )
}
export const toast = Object.fromEntries(
  ['error', 'warning', 'info', 'success'].map((kind) => [
    kind,
    (text: string, options?: { description?: string; duration?: number }) =>
      show(kind, text, options),
  ]),
) as Record<
  'error' | 'warning' | 'info' | 'success',
  (text: string, options?: { description?: string; duration?: number }) => void
>
