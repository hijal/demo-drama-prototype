export interface Word {
  word: string
  start: number
  end: number
}
export interface Line {
  speaker: string
  text: string
  at: number
}
/** Reject impossible ASR output before it can drive retakes or subtitles. */
export function assessTranscript(words: unknown, duration: number) {
  if (!Array.isArray(words) || !Number.isFinite(duration) || duration <= 0)
    return { reliable: false, reason: 'Invalid speech timestamps' }
  let last = -1
  const tokens: string[] = []
  for (const word of words) {
    if (
      !word ||
      typeof word.word !== 'string' ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < 0 ||
      word.end < word.start ||
      word.end > duration + 0.25 ||
      word.start < last - 0.1
    )
      return {
        reliable: false,
        reason: 'Speech timestamps fall outside the clip or run backwards',
      }
    last = word.start
    tokens.push(...normalize(word.word))
  }
  if (tokens.length > Math.max(20, duration * 8))
    return {
      reliable: false,
      reason: 'ASR produced an implausible number of words',
    }
  let run = 0,
    previous = ''
  for (const token of tokens) {
    run = token === previous ? run + 1 : 1
    if (run >= 12)
      return {
        reliable: false,
        reason: 'ASR repeated the same word excessively',
      }
    previous = token
  }
  return { reliable: true, reason: '' }
}

export function evaluateQa(
  visual: number,
  wer: number,
  hasDialogue: boolean,
  reliable: boolean,
  voicePenalty: number,
  minimum: number,
) {
  const dialogue = Math.round(100 * (1 - Math.min(1, Math.max(0, wer))))
  const score = Math.max(
    0,
    Math.round(
      (hasDialogue ? visual * 0.8 + dialogue * 0.2 : visual) - voicePenalty,
    ),
  )
  return {
    score,
    pass: score >= minimum && reliable && (!hasDialogue || wer <= 0.25),
    needsOwnerReview: !reliable,
  }
}

/** Label samples with the relevant shot; do not require every actor in every close-up. */
export function framePlan(
  scene: import('../../worker/src/script/types').Scene,
  duration: number,
) {
  const segments = scene.shots.length ? scene.shots : [scene]
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    segments.some((s) => !Number.isFinite(s.duration) || s.duration <= 0)
  )
    throw new Error('QA needs positive finite scene and shot durations')
  const total = segments.reduce((sum, s) => sum + s.duration, 0)
  const budget = Math.max(3, Math.min(8, segments.length * 3))
  const plan: Array<{
    at: number
    shot: number | null
    cast: string
    camera: string
    keyframe: string
    visual: string
  }> = []
  let offset = 0
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const start = (offset / total) * duration
    const end = ((offset + segment.duration) / total) * duration
    const count =
      Math.floor(budget / segments.length) +
      (i < budget % segments.length ? 1 : 0)
    for (let n = 0; n < count; n++)
      plan.push({
        at: Math.max(
          0,
          Math.min(
            duration - 0.001,
            start + ((n + 0.5) / count) * (end - start),
          ),
        ),
        shot: scene.shots.length ? segment.number : null,
        cast: segment.fields.CAST || scene.fields.CAST || '',
        camera: segment.fields.CAMERA || scene.fields.CAMERA || '',
        keyframe: segment.fields.KEYFRAME || scene.fields.KEYFRAME || '',
        visual: segment.fields.VISUAL || scene.fields.VISUAL || '',
      })
    offset += segment.duration
  }
  return plan
}
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
// Collapse doubled letters ("ahh" → "ah", "paddy" → "pady") before comparing.
const squeeze = (word: string) => word.replace(/(.)\1+/g, '$1')
function oneEditApart(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0,
    j = 0,
    edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}
/**
 * Speech recognition mishears sound-alike words ("paddy" as "patty"). Treat a
 * one-letter slip in a word of four or more letters as the same word, so the
 * dialogue score reflects missing or wrong lines, not ASR spelling.
 */
export function sameWord(expected: string, heard: string) {
  if (expected === heard) return true
  const a = squeeze(expected),
    b = squeeze(heard)
  if (a === b) return true
  return Math.min(a.length, b.length) >= 4 && oneEditApart(a, b)
}
export function alignDialogue(lines: Line[], words: Word[]) {
  const expected = lines.flatMap((line, index) =>
    normalize(line.text).map((word) => ({ word, index })),
  )
  const spoken = words.flatMap((word, index) =>
    normalize(word.word).map((text) => ({ word: text, index })),
  )
  const table = Array.from(
    { length: expected.length + 1 },
    () => new Uint16Array(spoken.length + 1),
  )
  for (let i = 0; i <= expected.length; i++) table[i][0] = i
  for (let j = 0; j <= spoken.length; j++) table[0][j] = j
  for (let i = 1; i <= expected.length; i++)
    for (let j = 1; j <= spoken.length; j++)
      table[i][j] = Math.min(
        table[i - 1][j] + 1,
        table[i][j - 1] + 1,
        table[i - 1][j - 1] +
          (sameWord(expected[i - 1].word, spoken[j - 1].word) ? 0 : 1),
      )
  const matches = new Map<number, number[]>()
  let i = expected.length,
    j = spoken.length
  while (i > 0 && j > 0) {
    const equal = sameWord(expected[i - 1].word, spoken[j - 1].word)
    if (table[i][j] === table[i - 1][j - 1] + (equal ? 0 : 1)) {
      if (equal) {
        const line = expected[i - 1].index
        matches.set(line, [...(matches.get(line) || []), spoken[j - 1].index])
      }
      i--
      j--
    } else if (table[i][j] === table[i - 1][j] + 1) i--
    else j--
  }
  return {
    wer: table[expected.length][spoken.length] / Math.max(1, expected.length),
    lines: lines.map((line, index) => {
      const found = matches.get(index) || []
      return {
        ...line,
        start: found.length
          ? Math.min(...found.map((n) => words[n].start))
          : null,
        end: found.length ? Math.max(...found.map((n) => words[n].end)) : null,
        matched: found.length / Math.max(1, normalize(line.text).length),
      }
    }),
  }
}
export function srtTimestamp(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000))
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`
}
export function subtitles(
  clips: Array<{
    duration: number
    transition: number
    lines: Array<{
      text: string
      start: number | null
      end: number | null
      at: number
    }>
    noSpeech: boolean
  }>,
) {
  let offset = 0,
    index = 0
  const blocks: string[] = []
  for (const clip of clips) {
    for (const line of clip.lines) {
      const start = line.start ?? (clip.noSpeech ? line.at : null),
        end =
          line.end ??
          (clip.noSpeech ? Math.min(clip.duration, line.at + 3) : null)
      if (start === null || end === null) continue
      blocks.push(
        `${++index}\n${srtTimestamp(offset + start)} --> ${srtTimestamp(offset + Math.min(clip.duration, end))}\n${line.text.replace(/\r?\n/g, ' ')}\n`,
      )
    }
    offset += clip.duration - clip.transition
  }
  return blocks.join('\n')
}
