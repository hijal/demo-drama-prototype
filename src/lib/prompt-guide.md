| Reference type | What sets |
| --------------------------- | ---------------------------------------------------------------- |
| Picture(`<Picture N>`) | Appearance, composition, angle, lighting, style, props |
| Video (`<Video N>`) | Movement, camera path, scenes, rhythm, time structure |
| Audio (`<Audio N>`) | Voice timbre, dialogue/lyrics, sound effects, musical style |

### Six-section prompt structure (Ref2VA)

1. `subject_definitions` - reference assets and labels
2. `summary` - brief description of the task and connections
3. `retention_analysis` - what is saved / changed
4. `detailed_description` - frames in playback order
5. `overall_soundscape` - atmosphere and physical sounds
6. `non_diegetic_music` - background music (or "N/A")

> All sections are in English (except for dialogues in `<d>` and visible text).

### Reference tags

- `<Subject N>` - visible content abstracted from refs
- `<Picture N>` - anchor image (frame/composition/style)
- `<Video N>` - video as a source of motion/camera/editing
- `<Audio N>` - audio for voice/sound/music

**The “one role” rule:** each asset has one main task.

### Numbering rules

- `<Video N>` and `<Audio N>` are numbered **independently**.
- Image to identify the character → indicate inside `<Subject N>`, a separate line `<Picture N>` is not needed.

### Relationship markers

Visible: `fully_preserved` | `weak_reference`
Audio: `fully_copy` | `reference` | `weak_reference`

### Talking characters

- Global ID `(Sx)` on each vocal event.
- `<Audio N>` for speaker reuses the same `(Sx)`.
- Don't write `(Sx)` in `retention_analysis`.

### Structure example (Ref2VA) - real prompts should be much more detailed

References: 2 images + 1 audio.

```text
subject_definitions:
<Subject 1> is the coffee-shop interior in <Picture 1> — brick wall, orange sofa, neon sign.
<Subject 2> is the blonde woman in <Picture 2> — long blonde hair, pink shirt.
<Audio 1> is the voice-timbre reference for <Subject 2> (S1).

summary:
[reference generation] <Subject 2> eats a cookie in <Subject 1>, startled by a dog.

retention_analysis:
<Subject 1> ([Shot 1]): fully_preserved — brick wall, orange sofa, neon sign retained.
<Subject 2> ([Shot 1]): fully_preserved — blonde hair, pink shirt retained.
<Audio 1>: reference — vocal timbre guides <Subject 2>'s delivery.

detailed_description:
[Shot 1] Medium shot in <Subject 1>. <Subject 2> (S1) sits on the sofa holding a cookie. A Samoyed lunges at her hand. <Subject 2> (S1) says with light annoyance: <d>[English] Hey! Watch your dog!</d>

overall_soundscape:
Soft indoor coffee-shop room tone.

non_diegetic_music:
N/A
```