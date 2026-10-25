export interface Notice {
  id: number
  kind: string
  text: string
  description?: string
  duration?: number
  action?: { label: string; onClick: () => void }
}
type NoticeOptions = Pick<Notice, 'description' | 'duration' | 'action'>
let nextId = 0
function show(
  kind: string,
  text: string,
  options?: NoticeOptions,
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
    (text: string, options?: NoticeOptions) => show(kind, text, options),
  ]),
) as Record<
  'error' | 'warning' | 'info' | 'success',
  (text: string, options?: NoticeOptions) => void
>
