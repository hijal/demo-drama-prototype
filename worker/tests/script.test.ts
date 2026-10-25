import { describe, expect, it } from 'vitest'
import { parseScript } from '../src/script/parse'
import { serializeScript } from '../src/script/serialize'
import { validateScript } from '../src/script/validate'
import { film, loose } from './fixtures'

const codes = (text: string) => validateScript(parseScript(text)).map(issue => issue.code)

describe('script parser and serializer', () => {
  it('parses one film as an implicit episode, preserving shots and spoken text', () => {
    const ast = parseScript(film)
    expect(ast.episodes.map(e => e.number)).toEqual([0])
    expect(ast.header['STYLE PROMPT']).toBe('warm afternoon light, gentle film grain')
    expect(ast.episodes[0].scenes[0].shots).toHaveLength(2)
    expect(ast.episodes[0].scenes[0].shots[1].dialogue[0].text).toBe("It's here: at last!")
    expect(validateScript(ast).filter(i => i.severity === 'error')).toEqual([])
  })
  it('round-trips structured content and does not invent episodes', () => {
    const canonical = serializeScript(parseScript(film))
    expect(canonical).not.toContain('== EPISODE')
    expect(serializeScript(parseScript(canonical))).toBe(canonical)
    expect(codes(canonical)).not.toContain('E11')
  })
  it('reads loose time ranges, multiple speakers, episodes and END FRAME', () => {
    const ast = parseScript(loose)
    expect(ast.episodes.map(e => e.number)).toEqual([1, 2])
    expect(ast.episodes[0].scenes[0].duration).toBe(10)
    expect(ast.episodes[0].scenes[0].dialogue.map(d => d.speaker)).toEqual(['pip', 'oak'])
    expect(ast.episodes[0].scenes[0].fields.KEYFRAME).toContain('raises')
    expect(codes(loose)).toContain('E05')
    expect(codes(loose)).toContain('W04')
    expect(serializeScript(parseScript(serializeScript(ast)))).toBe(serializeScript(ast))
  })
  it('does not ask for scene KEYFRAME/CAMERA when every shot has its own', () => {
    const shotsOnly = film.replace('  KEYFRAME: @ada holds @box.\n  CAMERA: medium shot\n', '')
    expect(shotsOnly).not.toBe(film)
    expect(codes(shotsOnly)).not.toContain('W04')
    expect(codes(shotsOnly.replace('    CAMERA: static\n', ''))).toContain('W04')
  })
  it('reports unsupported syntax instead of silently dropping content', () => {
    expect(codes(film + '\n  SURPRISE COMMAND without a colon')).toContain('E11')
  })
  it('preserves pipes inside quoted dialogue rather than treating them as options', () => {
    const ast = parseScript(film.replace("It's here: at last!", 'Left | right.'))
    const dialogue = ast.episodes[0].scenes[0].shots[1].dialogue[0]
    expect(dialogue.text).toBe('Left | right.')
    expect(dialogue.options.at).toBe('0.5s')
    expect(serializeScript(parseScript(serializeScript(ast)))).toBe(serializeScript(ast))
  })
  it('reads tone annotations in legacy dialogue without losing spoken lines', () => {
    const ast = parseScript(loose.replace('PIP: "For me?"', 'PIP (whisper): "For me?"'))
    expect(ast.issues.filter(i => i.code === 'E11')).toEqual([])
    const dialogue = ast.episodes[0].scenes[0].dialogue
    expect(dialogue).toHaveLength(2)
    expect(dialogue[0].tone).toBe('whisper')
    expect(dialogue[0].text).toBe('For me?')
  })
})

describe('validator', () => {
  it.each([
    ['E01', film.replace('TITLE: A Small Delivery\n', '')],
    ['E02', film.replace('ASPECT: 16:9', 'ASPECT: 4:3')],
    ['E03', film.replace('RULE: Keep @box blue.', 'RULE: Keep @unknown blue.')],
    ['E04', film.replace('PROP @box |', 'PROP @ada |')],
    ['E05', film.replace('  HAIR: short black hair\n', '')],
    ['E06', film.replace('SCENE 1 | 6s', 'SCENE 1 | 30s')],
    ['E07', film.replace('SHOT 1 | 3s', 'SHOT 1 | 2s')],
    ['E08', film.replace('length: 1s | at: 0.5s', 'length: 2s | at: 2s')],
    ['E09', film.replace('CAST: @ada, @narrator (voice)', 'CAST: @ada')],
    ['E10', film.replace('SCENE 1 |', 'SCENE 2 |')],
  ])('reports %s with a source line and both explanations', (code, input) => {
    const issues = validateScript(parseScript(input)).filter(i => i.code === code)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].line).toBeGreaterThan(0)
    expect(issues[0].message_en).toBeTruthy()
    expect(issues[0].message_bn).toBeTruthy()
  })
  it('recognizes grammatical prop plurals without allowing unknown references', () => {
    expect(codes(film.replace('hands on @box', 'hands on @boxs'))).not.toContain('E03')
  })
  it('checks overlapping and nonexistent variant ranges', () => {
    expect(codes(film.replace('  VARIANT open | 1-1 | lid open', '  VARIANT open | 1-2 | lid open\n  VARIANT torn | 1-1 | torn lid'))).toContain('W05')
  })
})
