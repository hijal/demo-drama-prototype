import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { fixScript } from '../src/llm/fixer'
import { ColabClient } from '../src/llm/colab'
import { parseScript } from '../src/script/parse'
import { serializeScript } from '../src/script/serialize'

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    models: { type: 'string' }, episode: { type: 'string', default: '1' }, out: { type: 'string' },
  } })
  if (positionals.length !== 1 || !values.models || !values.out) throw new Error('Usage: npm --prefix worker run compare -- script.txt --models org/a,org/b --episode 1 --out /private/tmp/model-review')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  if (existsSync(resolve(root, '.dev.vars'))) process.loadEnvFile(resolve(root, '.dev.vars'))
  const models = [...new Set(values.models.split(',').map(m => m.trim()).filter(Boolean))]
  if (models.length < 2 || models.length > 3) throw new Error('Compare two or three model IDs.')
  // The local server must support all requested models. Do not download/switch models here.
  const catalogue = await fetch('http://127.0.0.1:8000/v1/models', { signal: AbortSignal.timeout(15000), redirect: 'error' })
  if (!catalogue.ok) throw new Error(`Colab model list failed (HTTP ${catalogue.status}).`)
  const data = await catalogue.json() as { data: Array<{ id: string }> }
  const available = new Set(data.data.map(m => m.id))
  for (const model of models) if (!available.has(model)) throw new Error(`Candidate ${model} is not loaded in Colab. Run fix separately after switching the local model; do not load both models merely for comparison.`)
  const original = parseScript(await readFile(resolve(positionals[0]), 'utf8'))
  const selected = original.episodes.find(e => e.number === Number(values.episode))
  if (!selected) throw new Error('Requested episode was not found.')
  const input = serializeScript({ ...original, episodes: [selected] })
  const directory = resolve(values.out)
  await mkdir(directory, { recursive: true })
  const summary: Array<{ model: string; valid: boolean; rounds: number; errors: number; proposals: number; elapsedMs: number }> = []
  for (const model of models) {
    const started = Date.now()
    const result = await fixScript(input, new ColabClient({ token: process.env.COLAB_LLM_KEY, model }))
    const stem = model.replace(/[^a-z0-9_-]/gi, '_')
    await writeFile(resolve(directory, `${stem}.fixed.txt`), result.script, { flag: 'wx' })
    const { script: _script, ...report } = result
    await writeFile(resolve(directory, `${stem}.report.json`), JSON.stringify(report, null, 2), { flag: 'wx' })
    summary.push({ model, valid: result.valid, rounds: result.rounds, errors: result.issues.filter(i => i.severity === 'error').length, proposals: result.proposals.length, elapsedMs: Date.now() - started })
  }
  await writeFile(resolve(directory, 'comparison.json'), JSON.stringify({ episode: Number(values.episode), ownerApproved: false, results: summary }, null, 2), { flag: 'wx' })
  console.table(summary)
  console.log('No winner selected automatically. Review faithfulness and proposed descriptions before approving a model.')
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Model comparison failed.'); process.exitCode = 1 })
