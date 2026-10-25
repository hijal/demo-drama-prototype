/** Shared contract for the fixer. Keep the owner-facing examples in docs/SCRIPT_FORMAT.md. */
export const SCRIPT_FORMAT = `DRAMA SCRIPT
TITLE: title
LOGLINE: one sentence
GENRE: genre
LANGUAGE: English
ASPECT: 16:9 or 9:16
RESOLUTION: 1920x1080 or 1080x1920 (match ASPECT)
FPS: 24
STYLE PROMPT: visual style
NEGATIVE PROMPT: things to avoid

== CHARACTERS ==
CHARACTER @id | Name | human (or animal, creature, voice_only)
  FACE: facial details (human)
  HAIR: hair or explicitly bald (human)
  OUTFIT: clothing (human)
  SPECIES: species (animal/creature)
  LOOK: appearance (animal/creature)
  VOICE: voice description
  ACCENT: accent
== PROPS ==
PROP @id | Name
  LOOK: appearance
  RULE: continuity
  VARIANT name | 1-2 (film), or E01S01-E01S02 (series) | description
== LOCATIONS ==
LOCATION @id | Name
  LOOK: appearance
  LIGHT: lighting
== RULES ==
RULE: continuity instruction
NOTE: production note
== SCENES ==
SCENE 1 | 6s | Title
  AT: @location, time of day
  CAST: @character, @narrator (voice)
  CLIP: still or hero
  LIPSYNC: none or required
  MOOD: emotion
  VISUAL: action
  KEYFRAME: precise composition to preserve
  CAMERA: shot and camera motion
  FRAME: subject placement
  MUSIC: cue | sound: description | fade_in: 0.5s | fade_out: 1s
  TRANSITION: cut (or fade 1s)
  SFX: effect | sound: description | length: 1s | at: 0.5s
  ACTION: @character acts. | at: 0.5s
  @character (tone): "Exact original dialogue." | at: 1s
  @narrator [VO]: "Exact original narration." | at: 0.5s
  SHOT 1 | 3s | wide
    VISUAL: sub-shot action
    KEYFRAME: composition
    CAMERA: motion

One field per line; continuation lines indented more than their field.
SHOTs are optional; their durations must sum to their scene within 0.5 seconds.
Scene duration: 2.5–29.9 seconds, prefer <=12. Dialogue and SFX must fit.
An episode header is OPTIONAL: == EPISODE 01 | Title ==
No episode in input means one film; NEVER invent episodes.
All @ids must have definitions; CAST must include each speaker.
voice_only needs VOICE, not a visual description. Every visible character needs its visual fields.
Use the same stable @id for each original named character across all episodes.
Propose missing character/location details for owner review; never claim they were in the original.`
