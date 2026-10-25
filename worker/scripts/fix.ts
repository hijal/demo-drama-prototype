import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { fixScript } from '../src/llm/fixer'
import { ColabClient, type CompletionClient } from '../src/llm/colab'
import { parseScript } from '../src/script/parse'
import { serializeScript } from '../src/script/serialize'

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean' }, model: { type: 'string' }, episode: { type: 'string' },
      out: { type: 'string' }, overwrite: { type: 'boolean' }, 'list-models': { type: 'boolean' }, help: { type: 'boolean' },
    },
  })
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const vars = resolve(root, '.dev.vars')
  if (existsSync(vars)) process.loadEnvFile(vars)
  if (values.help) {
    console.log('Usage: npm --prefix worker run fix -- <script.txt> [--dry-run] [--episode 1] [--model org/name] [--out /private/tmp/review] [--overwrite]\nRun inside Colab. --list-models queries the local model server. No paid inference API is used.')
    return
  }
  if (values['list-models']) {
    const response = await fetch('http://127.0.0.1:8000/v1/models', { signal: AbortSignal.timeout(15000), redirect: 'error' })
    if (!response.ok) throw new Error(`Colab model list failed (HTTP ${response.status}).`)
    const body = await response.json() as { data?: Array<{ id: string }> }
    console.log((body.data ?? []).map(m => m.id).sort().join('\n'))
    return
  }
  if (positionals.length !== 1) throw new Error('Pass one input .txt file. Use --help for examples.')
  const input = resolve(positionals[0])
  let raw = await readFile(input, 'utf8')
  if (Buffer.byteLength(raw) > 1_000_000) throw new Error('Script exceeds 1 MB; split it into episodes first.')
  const ast = parseScript(raw)
  let selectedEpisode: number | null = null
  if (values.episode !== undefined) {
    const number = Number(values.episode)
    if (!Number.isInteger(number) || number < 1) throw new Error('--episode must be a positive integer.')
    const episode = ast.episodes.find(e => e.number === number)
    if (!episode) throw new Error(`Episode ${number} was not found.`)
    selectedEpisode = number
    // Preserve the shared cast bible; only the selected episode is sent to the local Colab model.
    raw = serializeScript({ ...ast, episodes: [episode] })
  } else if (ast.episodes.length > 1 && !values['dry-run']) {
    throw new Error('This is a series. Use --episode 1 (then 2, etc.) to keep model outputs within limits.')
  }
  const model = values.model ?? process.env.COLAB_LLM_MODEL ?? ''
  const client: CompletionClient = values['dry-run']
    ? { model: '', complete: async () => { throw new Error('Dry run must not contact a model server.') } }
    : new ColabClient({ token: process.env.COLAB_LLM_KEY, model })
  const suffix = selectedEpisode === null ? '' : `.episode-${String(selectedEpisode).padStart(2, '0')}`
  const stem = `${basename(input).replace(/\.txt$/i, '')}${suffix}`
  const outputDir = values.out ? resolve(values.out) : dirname(input)
  const fixedFile = resolve(outputDir, `${stem}.fixed.txt`)
  const reportFile = resolve(outputDir, `${stem}.report.json`)
  if (!values.overwrite && (existsSync(fixedFile) || existsSync(reportFile))) throw new Error('Output already exists. Choose a different --out directory or pass --overwrite.')
  const result = await fixScript(raw, client, { dryRun: values['dry-run'] })
  await mkdir(outputDir, { recursive: true })
  const flag = values.overwrite ? 'w' : 'wx'
  await writeFile(fixedFile, result.script, { flag })
  const { script: _script, ...report } = result
  await writeFile(reportFile, JSON.stringify({ input: basename(input), selectedEpisode, ...report }, null, 2) + '\n', { flag })
  console.log(`${values['dry-run'] ? 'Dry run' : 'Colab repair'}: ${result.valid ? 'validation passed' : 'needs repair/review'}; ${result.rounds} model rounds.`)
  console.log(`Script: ${fixedFile}\nReport: ${reportFile}`)
  for (const text of result.summary_bn) console.log(text)
  if (!result.valid) process.exitCode = 2
}

main().catch(error => {
  // Never print env variables, request bodies or stack traces containing scripts.
  console.error(error instanceof Error ? error.message : 'Script repair failed.')
  process.exitCode = 1
})
