import type { Asset, Event, Script, Segment } from './types'

const eventText = (e: Event) => `${e.text}${Object.entries(e.options).map(([key, value]) => ` | ${key}: ${value}`).join('')}`

/** Canonical text is deterministic; source line numbers are deliberately regenerated on parse. */
export function serializeScript(script: Script): string {
  const lines = ['DRAMA SCRIPT', '']
  for (const [key, value] of Object.entries(script.header)) lines.push(`${key}: ${value}`)
  function assets(title: string, list: Asset[]) {
    lines.push('', `== ${title} ==`, '')
    for (const a of list) {
      lines.push(`${a.kind.toUpperCase()} @${a.id} | ${a.name}${a.kind === 'character' ? ` | ${a.characterType ?? 'human'}` : ''}`)
      for (const [key, value] of Object.entries(a.fields)) lines.push(`  ${key}: ${value}`)
      for (const v of a.variants) lines.push(`  VARIANT ${v.name} | ${v.range} | ${v.look}`)
      lines.push('')
    }
  }
  assets('CHARACTERS', script.characters)
  assets('PROPS', script.props)
  assets('LOCATIONS', script.locations)
  lines.push('== RULES ==', '')
  for (const rule of script.rules) lines.push(`RULE: ${rule.text}`)
  for (const note of script.notes) lines.push(`NOTE: ${note.text}`)
  function writeSegment(s: Segment, indent: string) {
    for (const [key, value] of Object.entries(s.fields)) lines.push(`${indent}${key}: ${value}`)
    const events = [
      ...s.dialogue.map(d => ({ line: d.line, value: `@${d.speaker}${d.tone ? ` (${d.tone})` : ''}${d.voiceOver ? ' [VO]' : ''}: "${d.text}"${Object.entries(d.options).map(([k, v]) => ` | ${k}: ${v}`).join('')}` })),
      ...s.sfx.map(e => ({ line: e.line, value: `SFX: ${eventText(e)}` })),
      ...s.actions.map(e => ({ line: e.line, value: `ACTION: ${eventText(e)}` })),
    ].sort((a, b) => a.line - b.line)
    for (const e of events) lines.push(`${indent}${e.value}`)
  }
  for (const episode of script.episodes) {
    lines.push('', episode.number === 0 ? '== SCENES ==' : `== EPISODE ${String(episode.number).padStart(2, '0')} | ${episode.title} ==`, '')
    for (const scene of episode.scenes) {
      lines.push(`SCENE ${scene.number} | ${Number.isFinite(scene.duration) ? scene.duration : '?'}s | ${scene.title}`)
      writeSegment(scene, '  ')
      for (const shot of scene.shots) {
        lines.push('', `  SHOT ${shot.number} | ${shot.duration}s | ${shot.title}`)
        writeSegment(shot, '    ')
      }
      lines.push('')
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
