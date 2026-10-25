import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseScript } from '../src/script/parse'
import { serializeScript } from '../src/script/serialize'
import { validateScript } from '../src/script/validate'

const directory = process.env.PRIVATE_SCRIPT_DIR ?? join(homedir(), 'Downloads')
for (const [filename, episodes, scenes, draft] of [
  ['chicken_tacos_drama_script.txt', 1, 6, false],
  ['burrito_bowl_drama_script.txt', 1, 7, false],
  ['jungle_mayhem_drama_Script.txt', 20, 180, true],
] as const) {
  const file = join(directory, filename)
  test.skipIf(!existsSync(file))(`private input: ${filename} (contents never committed)`, () => {
    const raw = readFileSync(file, 'utf8')
    const ast = parseScript(raw)
    expect(ast.episodes).toHaveLength(episodes)
    expect(ast.episodes.flatMap(e => e.scenes)).toHaveLength(scenes)
    const issues = validateScript(ast)
    if (draft) {
      expect(issues.filter(i => i.code === 'E11').map(i => i.line)).toEqual([])
      const originalLineCount = raw.split('\n').filter(l => l.startsWith('DIALOGUE:')).flatMap(l => [...l.matchAll(/"[^"]*"/g)]).length
      expect(ast.episodes.flatMap(e => e.scenes).flatMap(s => [s, ...s.shots]).flatMap(s => s.dialogue)).toHaveLength(originalLineCount)
      expect(issues.some(i => i.code === 'E05')).toBe(true)
      expect(issues.some(i => i.code === 'W04')).toBe(true)
    } else {
      // Print issue codes/line numbers, never the private script text.
      expect(issues.filter(i => i.severity === 'error').map(i => [i.code, i.line])).toEqual([])
    }
    const canonical = serializeScript(ast)
    expect(serializeScript(parseScript(canonical)) === canonical).toBe(true)
  })
}
