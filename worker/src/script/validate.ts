import { issue, type Asset, type Issue, type Script, type Segment } from './types'

const refs = (text: string) => [...text.matchAll(/@([a-z0-9_-]+)/gi)].map(m => m[1].toLowerCase())
const seconds = (value: string | undefined): number => value === undefined ? 0 : /^\d+(?:\.\d+)?s?$/.test(value) ? Number(value.replace(/s$/, '')) : NaN

export function validateScript(script: Script): Issue[] {
  const issues = [...script.issues]
  const add = (code: string, line: number, en: string, bn: string) => issues.push(issue(code, code.startsWith('E') ? 'error' : 'warning', line, en, bn))
  for (const key of ['TITLE', 'ASPECT']) if (!script.header[key]?.trim()) add('E01', 1, `Missing ${key}.`, `${key} দেওয়া হয়নি।`)
  if (script.header.ASPECT && !['16:9', '9:16'].includes(script.header.ASPECT)) add('E02', script.headerLines.ASPECT ?? 1, 'ASPECT must be 16:9 or 9:16.', 'ASPECT 16:9 অথবা 9:16 হতে হবে।')
  const assets = [...script.characters, ...script.props, ...script.locations]
  const defined = new Map<string, Asset>()
  for (const a of assets) {
    if (defined.has(a.id)) add('E04', a.line, `Duplicate asset @${a.id}.`, `@${a.id} একাধিকবার দেওয়া হয়েছে।`)
    defined.set(a.id, a)
  }
  // The owner's existing scripts use @tacos/@bowls grammatically for a prop.
  // Only a direct plural of a declared prop is an alias; unknown IDs stay errors.
  const resolveRef = (id: string) => defined.get(id) ?? (id.endsWith('s') && defined.get(id.slice(0, -1))?.kind === 'prop' ? defined.get(id.slice(0, -1)) : undefined)
  const checkRefs = (text: string, line: number) => {
    for (const id of new Set(refs(text))) if (!resolveRef(id)) add('E03', line, `Undefined reference @${id}.`, `@${id} আগে define করা হয়নি।`)
  }
  for (const [key, value] of Object.entries(script.header)) checkRefs(value, script.headerLines[key] ?? 1)
  for (const a of assets) {
    for (const [key, value] of Object.entries(a.fields)) checkRefs(value, a.fieldLines[key] ?? a.line)
    for (const v of a.variants) checkRefs(v.look, v.line)
  }
  for (const r of [...script.rules, ...script.notes]) checkRefs(r.text, r.line)
  for (const c of script.characters) {
    if (!['human', 'animal', 'creature', 'voice_only'].includes(c.characterType ?? '')) add('E05', c.line, `Unknown character type for @${c.id}.`, `@${c.id}-এর character type সঠিক নয়।`)
    if (c.characterType === 'voice_only') continue
    const required = c.characterType === 'animal' || c.characterType === 'creature' ? ['SPECIES', 'LOOK'] : ['FACE', 'HAIR', 'OUTFIT']
    if (required.some(key => !c.fields[key]?.trim())) add('E05', c.line, `@${c.id} needs ${required.join(', ')}.`, `@${c.id}-এর চেহারার বর্ণনা অসম্পূর্ণ (${required.join(', ')})।`)
  }
  if (!script.episodes.some(e => e.scenes.length)) add('E11', 1, 'The script has no scenes.', 'Script-এ কোনো scene নেই।')
  const episodeNumbers = new Set<number>()
  for (const ep of script.episodes) {
    if (episodeNumbers.has(ep.number)) add('E10', ep.line, 'Duplicate episode number.', 'Episode number একাধিকবার আছে।')
    episodeNumbers.add(ep.number)
    ep.scenes.forEach((scene, index) => {
      if (scene.number !== index + 1) add('E10', scene.line, 'Scenes must be numbered sequentially from 1 within each episode.', 'প্রতি episode-এ scene number 1 থেকে ধারাবাহিক হতে হবে।')
      if (!Number.isFinite(scene.duration) || scene.duration < 2.5 || scene.duration > 29.9) add('E06', scene.line, 'Scene duration must be between 2.5 and 29.9 seconds.', 'Scene-এর সময় 2.5 থেকে 29.9 সেকেন্ড হতে হবে।')
      if (scene.shots.length && Math.abs(scene.shots.reduce((sum, sh) => sum + sh.duration, 0) - scene.duration) > 0.5) add('E07', scene.line, 'SHOT durations must add up to SCENE duration (within 0.5 s).', 'Shot-গুলোর মোট সময় scene-এর সময়ের সমান হতে হবে (0.5s ছাড়)।')
      if (!script.locations.some(l => refs(scene.fields.AT ?? '').includes(l.id))) add('W06', scene.fieldLines.AT ?? scene.line, 'AT needs a defined location.', 'AT-এর location define করা নেই।')
      const cast = refs(scene.fields.CAST ?? '')
      if (/\bcartoon\b/i.test(script.header['NEGATIVE PROMPT'] || '') &&
          [scene, ...scene.shots].some(s => /\bcartoon\b/i.test(s.fields.VISUAL || ''))) {
        add('W07', scene.line, 'This scene requests a cartoon effect but NEGATIVE PROMPT forbids cartoon; clarify the intended effect before rendering.', 'এই scene-এ cartoon effect চাওয়া হয়েছে, কিন্তু NEGATIVE PROMPT-এ cartoon নিষেধ; render-এর আগে দ্বন্দ্বটি ঠিক করো।')
      }
      const allSpeakers = new Set([scene, ...scene.shots].flatMap(s => s.dialogue.map(d => d.speaker)))
      if (allSpeakers.size > 3) add('W02', scene.line, 'More than three speaking characters need separate voice-reference planning.', 'তিনজনের বেশি speaker; voice reference আলাদা করে পরিকল্পনা করো।')
      const visualAssets = new Set(refs([scene, ...scene.shots].flatMap(s => Object.values(s.fields)).join(' ')).filter(id => resolveRef(id)?.characterType !== 'voice_only'))
      if (visualAssets.size > 9) add('W03', scene.line, 'This scene may need more than nine image references.', 'এই scene-এ নয়টির বেশি image reference লাগতে পারে।')
      function checkSegment(s: Segment, shotIndex?: number) {
        if (shotIndex !== undefined && (s.number !== shotIndex + 1 || !Number.isFinite(s.duration) || s.duration <= 0)) add('E07', s.line, 'Shots need sequential numbers and positive durations.', 'Shot number ধারাবাহিক এবং সময় শূন্যের বেশি হতে হবে।')
        for (const [key, value] of Object.entries(s.fields)) checkRefs(value, s.fieldLines[key] ?? s.line)
        const segments = [...s.dialogue, ...s.sfx, ...s.actions]
        for (const e of segments) {
          checkRefs(e.text, e.line)
          const start = seconds(e.options.at)
          const length = seconds(e.options.length)
          if (!Number.isFinite(start) || !Number.isFinite(length) || start >= s.duration || start + length > s.duration) add('E08', e.line, 'Event timing falls outside its scene/shot or is invalid.', 'Dialogue/action/SFX-এর সময় scene বা shot-এর বাইরে গেছে।')
        }
        const scopeCast = s.fields.CAST ? refs(s.fields.CAST) : cast
        for (const d of s.dialogue) {
          checkRefs(`@${d.speaker}`, d.line)
          if (!scopeCast.includes(d.speaker)) add('E09', d.line, `Speaker @${d.speaker} is not in CAST.`, `Speaker @${d.speaker} CAST-এ নেই।`)
          const start = seconds(d.options.at)
          const next = s.dialogue.map(e => seconds(e.options.at)).filter(t => t > start).sort((a, b) => a - b)[0] ?? s.duration
          if (d.text.trim().split(/\s+/).length > (next - start) * 2.7) add('W01', d.line, 'Dialogue may be too long for its available window; split it or extend the scene.', 'এই সময়ের তুলনায় সংলাপ বড়; সময় বাড়াও বা ভাগ করো।')
        }
        // A scene with shots is framed by its shots; only rendered segments need KEYFRAME/CAMERA.
        const rendered = shotIndex !== undefined || !scene.shots.length
        if (rendered && !s.fields.KEYFRAME && !(shotIndex !== undefined && scene.fields.KEYFRAME)) add('W04', s.line, 'Missing KEYFRAME; the fixer should propose one.', 'KEYFRAME নেই; fixer একটি proposal দেবে।')
        if (rendered && !s.fields.CAMERA && !(shotIndex !== undefined && scene.fields.CAMERA)) add('W04', s.line, 'Missing CAMERA; the fixer should propose one.', 'CAMERA নেই; fixer একটি proposal দেবে।')
      }
      if (!scene.shots.length) checkSegment(scene)
      else {
        // Scene-level narration/effects still need validation even with shots.
        checkSegment(scene)
        scene.shots.forEach((s, i) => checkSegment(s, i))
      }
    })
  }
  for (const prop of script.props) {
    const covered = new Set<string>()
    for (const variant of prop.variants) {
      const match = variant.range.match(/^(\d+)-(\d+)$/) ?? variant.range.match(/^E(\d+)S(\d+)-E(\d+)S(\d+)$/i)
      let valid = !!match
      const keys: string[] = []
      if (match?.length === 3) {
        // Plain ranges refer to the film or the sole episode, not every episode.
        const ep = script.episodes.length === 1 ? script.episodes[0] : undefined
        if (!ep || Number(match[1]) > Number(match[2])) valid = false
        else for (let n = Number(match[1]); n <= Number(match[2]) && n <= 10000; n++) {
          if (!ep.scenes.some(s => s.number === n)) valid = false
          keys.push(`${ep.number}:${n}`)
        }
      } else if (match) {
        const start = Number(match[1]) * 10000 + Number(match[2])
        const end = Number(match[3]) * 10000 + Number(match[4])
        const scenes = script.episodes.flatMap(e => e.scenes.map(s => ({ key: `${e.number}:${s.number}`, n: e.number * 10000 + s.number })))
        if (start > end || !scenes.some(s => s.n === start) || !scenes.some(s => s.n === end)) valid = false
        keys.push(...scenes.filter(s => s.n >= start && s.n <= end).map(s => s.key))
      }
      if (!valid || keys.some(k => covered.has(k))) add('W05', variant.line, 'Variant range is invalid, out of range, ambiguous, or overlaps another variant.', 'Prop variant-এর scene range ভুল, অস্পষ্ট বা অন্য variant-এর সঙ্গে overlap করেছে।')
      for (const key of keys) covered.add(key)
    }
  }
  return issues
}
