import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { afterAll, expect, test } from 'vitest'

const output = mkdtempSync(join(tmpdir(), 'drama-cli-test-'))
afterAll(() => rmSync(output, { recursive: true, force: true }))
const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/fix.ts', ...args], {
  cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8', timeout: 15000,
  env: { ...process.env, HF_TOKEN: '', COLAB_LLM_MODEL: '' },
})

test('CLI dry-run writes valid review files without contacting any model server', () => {
  const result = run('../docs/templates/short_film_template.txt', '--dry-run', '--out', output)
  expect(result.status, result.stderr).toBe(0)
  const report = JSON.parse(readFileSync(join(output, 'short_film_template.report.json'), 'utf8'))
  expect(report.valid).toBe(true)
  expect(report.rounds).toBe(0)
  expect(report.model).toBeNull()
  expect(report.requiresApproval).toBe(true)
})

test('CLI protects existing output files', () => {
  const args = ['../docs/templates/series_template.txt', '--dry-run', '--out', output]
  expect(run(...args).status).toBe(0)
  const file = join(output, 'series_template.fixed.txt')
  const original = readFileSync(file, 'utf8')
  expect(run(...args).status).toBe(1)
  expect(readFileSync(file, 'utf8')).toBe(original)
})

test('CLI rejects a nonexistent episode before writing output', () => {
  const result = run('../docs/templates/series_template.txt', '--episode', '99', '--dry-run', '--out', output)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('not found')
})
