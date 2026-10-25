export interface LineChange { line: number; removed: string[]; added: string[] }

/** A line diff for review, bounded for large series to avoid quadratic memory growth. */
export function diffLines(before: string, after: string): LineChange[] {
  if (before === after) return []
  const a = before.trimEnd().split('\n'), b = after.trimEnd().split('\n')
  if (a.length * b.length > 4_000_000) return [{ line: 1, removed: a, added: b }]
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
  }
  const changes: LineChange[] = []
  let i = 0, j = 0, current: LineChange | undefined
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { current = undefined; i++; j++; continue }
    if (!current) { current = { line: i + 1, removed: [], added: [] }; changes.push(current) }
    if (j < b.length && (i === a.length || table[i * width + j + 1] >= table[(i + 1) * width + j])) current.added.push(b[j++])
    else current.removed.push(a[i++])
  }
  return changes
}
