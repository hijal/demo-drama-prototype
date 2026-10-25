import { issue, type Asset, type Episode, type Event, type Fields, type Scene, type Script, type Segment } from './types'

const fields = (line: number): Fields => ({ fields: {}, fieldLines: {}, line })
const segment = (number: number, duration: number, title: string, line: number): Segment => ({
  ...fields(line), number, duration, title, dialogue: [], sfx: [], actions: [],
})
const slug = (text: string) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

function event(text: string, line: number): Event {
  const [description, ...attributes] = text.split(/\s*\|\s*/)
  const options: Record<string, string> = {}
  for (const attribute of attributes) {
    const match = attribute.match(/^([^:]+):\s*(.*)$/)
    if (match) options[match[1].trim().toLowerCase()] = match[2].trim()
  }
  return { text: description.trim(), options, line }
}

/** Parse canonical scripts and the legacy time-range format without inventing visual descriptions. */
export function parseScript(text: string): Script {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const canonical = lines.some(line => /^DRAMA SCRIPT\s*$/i.test(line.trim()))
  const ast: Script = {
    header: {}, headerLines: {}, characters: [], props: [], locations: [], rules: [], notes: [],
    episodes: [], issues: [], format: canonical ? 'canonical' : 'loose',
  }
  let episode: Episode | undefined
  let scene: Scene | undefined
  let shot: Segment | undefined
  let asset: Asset | undefined
  let lastField: { target: Record<string, string>; key: string; indent: number } | undefined
  let lastEvent: Event | undefined
  const unsupported = (line: number) => ast.issues.push(issue('E11', 'error', line,
    'Unrecognized or misplaced syntax; this line must be reviewed.', 'এই লাইনের format বোঝা যায়নি; ঠিক করে আবার দাও।'))
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index]
    const value = raw.trim()
    const line = index + 1
    const indent = raw.match(/^\s*/)?.[0].length ?? 0
    if (!value) continue
    if (/^DRAMA SCRIPT$/i.test(value) || /^=+$/.test(value)) continue
    if (/^==\s*(CHARACTERS|PROPS|LOCATIONS|RULES|SCENES)\s*==$/i.test(value)) {
      asset = undefined; shot = undefined; lastField = undefined; lastEvent = undefined
      continue
    }
    const ep = value.match(/^(?:==\s*)?EPISODE\s+(\d+)\s*(?:\||[—–-])\s*(.*?)(?:\s*==)?$/i)
    if (ep) {
      episode = { number: Number(ep[1]), title: ep[2].replace(/\s*\(\d+:\d+\)$/, ''), line, scenes: [] }
      ast.episodes.push(episode)
      scene = undefined; shot = undefined; asset = undefined; lastField = undefined; lastEvent = undefined
      continue
    }
    const sc = value.match(/^SCENE\s+(\d+)\s*\|\s*(.*)$/i)
    if (sc) {
      if (!episode) {
        episode = { number: 0, title: '', line, scenes: [] }
        ast.episodes.push(episode)
      }
      const parts = sc[2].split(/\s*\|\s*/)
      const duration = parts[0].match(/^(\d+(?:\.\d+)?)\s*s$/i) ?? parts[0].match(/\((\d+(?:\.\d+)?)\s*seconds?\)/i)
      scene = { ...segment(Number(sc[1]), duration ? Number(duration[1]) : NaN, parts.slice(1).join(' | '), line), shots: [] }
      episode.scenes.push(scene)
      shot = undefined; asset = undefined; lastField = undefined; lastEvent = undefined
      continue
    }
    const sh = value.match(/^SHOT\s+(\d+)\s*\|\s*([\d.]+)s\s*\|\s*(.*)$/i)
    if (sh) {
      if (!scene) { unsupported(line); continue }
      shot = segment(Number(sh[1]), Number(sh[2]), sh[3], line)
      scene.shots.push(shot); lastField = undefined; lastEvent = undefined
      continue
    }
    const declaration = value.match(/^(CHARACTER|PROP|LOCATION)\s+@([a-z0-9_-]+)\s*\|\s*([^|]+)(?:\|\s*(.+))?$/i)
    if (declaration) {
      const kind = declaration[1].toLowerCase() as Asset['kind']
      asset = { ...fields(line), kind, id: declaration[2].toLowerCase(), name: declaration[3].trim(),
        ...(kind === 'character' ? { characterType: declaration[4]?.trim() ?? 'human' } : {}), variants: [] }
      ast[kind === 'character' ? 'characters' : kind === 'prop' ? 'props' : 'locations'].push(asset)
      scene = undefined; shot = undefined; lastField = undefined; lastEvent = undefined
      continue
    }
    const variant = value.match(/^VARIANT\s+([^|]+)\|\s*([^|]+)\|\s*(.+)$/i)
    if (variant && asset?.kind === 'prop') {
      asset.variants.push({ name: variant[1].trim(), range: variant[2].trim(), look: variant[3].trim(), line })
      lastField = undefined; lastEvent = undefined
      continue
    }
    const target = shot ?? scene
    const spoken = value.match(/^@([a-z0-9_-]+)\s*(?:\(([^)]*)\))?\s*(\[VO\])?\s*:\s*["“](.*)["”]\s*(\|.*)?$/i)
    if (spoken && target) {
      const entry = { ...event(`dialogue${spoken[5] ?? ''}`, line), text: spoken[4] }
      target.dialogue.push({ ...entry, speaker: spoken[1].toLowerCase(), tone: spoken[2], voiceOver: !!spoken[3] })
      lastField = undefined; lastEvent = undefined
      continue
    }
    const legacyDialogue = value.match(/^DIALOGUE:\s*(.*)$/i)
    if (legacyDialogue && target && !canonical) {
      const expression = /([A-Z][A-Z\s]*?)(?:\s*\(([^)]*)\))?:\s*"([^"]*)"/g
      const matches = [...legacyDialogue[1].matchAll(expression)]
      if (!matches.length || legacyDialogue[1].replace(expression, '').trim()) unsupported(line)
      for (const match of matches) target.dialogue.push({ ...event('', line), text: match[3], speaker: slug(match[1]), tone: match[2], voiceOver: false })
      lastField = undefined; lastEvent = undefined
      continue
    }
    const field = value.match(/^([A-Z][A-Z0-9 /_-]*):\s*(.*)$/)
    if (field) {
      const key = field[1]
      if ((key === 'RULE' || key === 'NOTE') && !asset && !target) {
        ast[key === 'RULE' ? 'rules' : 'notes'].push({ text: field[2], line })
        lastField = undefined; lastEvent = undefined
      } else if (target && (key === 'SFX' || key === 'ACTION')) {
        const entry = event(field[2], line)
        target[key === 'SFX' ? 'sfx' : 'actions'].push(entry)
        lastEvent = entry; lastField = undefined
      } else {
        const scope = asset ?? target
        const record = scope?.fields ?? ast.header
        const sourceLines = scope?.fieldLines ?? ast.headerLines
        const normalized = !canonical && key === 'END FRAME' ? 'KEYFRAME' : key
        if (Object.hasOwn(record, normalized)) unsupported(line)
        record[normalized] = field[2]; sourceLines[normalized] = line
        lastField = { target: record, key: normalized, indent }; lastEvent = undefined
      }
      continue
    }
    if (lastField && indent > lastField.indent) {
      lastField.target[lastField.key] += ` ${value}`
      continue
    }
    if (lastEvent && indent > 0) { lastEvent.text += ` ${value}`; continue }
    if (!canonical && !scene && !asset && !episode) {
      if (!ast.header.TITLE) { ast.header.TITLE = value; ast.headerLines.TITLE = line }
      if (/9:16|16:9/.test(value)) { ast.header.ASPECT = value.includes('9:16') ? '9:16' : '16:9'; ast.headerLines.ASPECT = line }
      // Legacy summary lines are retained as production notes.
      else if (value !== ast.header.TITLE) ast.notes.push({ text: value, line })
      continue
    }
    unsupported(line)
  }
  if (!canonical) {
    const speakers = new Map<string, number>()
    for (const ep of ast.episodes) for (const sc of ep.scenes) {
      for (const item of [sc, ...sc.shots]) for (const d of item.dialogue) speakers.set(d.speaker, d.line)
    }
    for (const [id, line] of speakers) if (!ast.characters.some(c => c.id === id)) {
      ast.characters.push({ ...fields(line), id, name: id.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
        kind: 'character', characterType: 'human', variants: [], inferred: true })
    }
    for (const ep of ast.episodes) for (const sc of ep.scenes) {
      const content = [sc, ...sc.shots].flatMap(s => [Object.values(s.fields).join(' '), ...s.actions.map(e => e.text)]).join(' ')
      const cast = new Set(sc.dialogue.map(d => d.speaker))
      for (const c of ast.characters) if (new RegExp(`\\b${c.id.replace(/_/g, '\\s+')}\\b`, 'i').test(content)) cast.add(c.id)
      sc.fields.CAST = [...cast].map(id => `@${id}`).join(', ')
      sc.fieldLines.CAST = sc.line
    }
    ast.header.LANGUAGE ??= 'English'
  }
  ast.header.RESOLUTION ??= ast.header.ASPECT === '9:16' ? '1080x1920' : '1920x1080'
  ast.header.FPS ??= '24'
  return ast
}
