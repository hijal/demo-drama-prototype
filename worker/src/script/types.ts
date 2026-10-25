export interface Issue {
  code: string
  severity: 'error' | 'warning'
  line: number
  message_en: string
  message_bn: string
}

export interface Fields {
  fields: Record<string, string>
  fieldLines: Record<string, number>
  line: number
}

export interface Variant {
  name: string
  range: string
  look: string
  line: number
}

export interface Asset extends Fields {
  id: string
  name: string
  kind: 'character' | 'prop' | 'location'
  characterType?: string
  variants: Variant[]
  inferred?: boolean
}

export interface Event {
  text: string
  options: Record<string, string>
  line: number
}

export interface Dialogue extends Event {
  speaker: string
  tone?: string
  voiceOver: boolean
}

export interface Segment extends Fields {
  number: number
  duration: number
  title: string
  dialogue: Dialogue[]
  sfx: Event[]
  actions: Event[]
}

export interface Scene extends Segment {
  shots: Segment[]
}

export interface Episode {
  number: number
  title: string
  line: number
  scenes: Scene[]
}

export interface Script {
  header: Record<string, string>
  headerLines: Record<string, number>
  characters: Asset[]
  props: Asset[]
  locations: Asset[]
  rules: Array<{ text: string; line: number }>
  notes: Array<{ text: string; line: number }>
  episodes: Episode[]
  issues: Issue[]
  format: 'canonical' | 'loose'
}

export function issue(code: string, severity: Issue['severity'], line: number, message_en: string, message_bn: string): Issue {
  return { code, severity, line, message_en, message_bn }
}
