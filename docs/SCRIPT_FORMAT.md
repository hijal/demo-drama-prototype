# Drama script format

Script `.txt` file হিসেবে দাও। Film হলে EPISODE block লাগবে না। Series হলে প্রতি episode-এর scene number আবার 1 থেকে শুরু হবে।

Use [short_film_template.txt](templates/short_film_template.txt) or [series_template.txt](templates/series_template.txt).

To write a new script with an AI chat, open **Format Script** in the studio sidebar, choose **Single** (one film) or **Episode** (series), copy the prompt and fill in the story idea. The Episode prompt has the AI write the header, the full cast and Episode 01 first, then one more episode each time you reply "next"; paste the replies one after another into a single `.txt` file.

## Header

Start with `DRAMA SCRIPT`, then one field per line:

```text
TITLE: Your title
LOGLINE: One sentence describing the story.
GENRE: Comedy
LANGUAGE: English
ASPECT: 16:9
RESOLUTION: 1920x1080
FPS: 24
STYLE PROMPT: cinematic lighting, soft film grain,
    natural colours
NEGATIVE PROMPT: watermark, unintended text
```

TITLE and ASPECT are required. ASPECT supports `16:9` and `9:16`; default resolution is respectively `1920x1080` or `1080x1920`. New fixer outputs use 1080p. Older 720p scripts remain readable. Existing fields such as SETTING, ALT ASPECT and RUNTIME are preserved. Indent a continuation line further than the field it continues.

## Characters, props and locations

Use stable lowercase IDs (`@ada`, `@parcel`, `@porch`) everywhere. Each ID must be unique across all asset types.

```text
== CHARACTERS ==
CHARACTER @ada | Ada | human
  FACE: oval face with freckles
  HAIR: short curly black hair
  OUTFIT: yellow raincoat
  VOICE: warm, clear
  ACCENT: neutral American
CHARACTER @owl | Owl | animal
  SPECIES: owl
  LOOK: small brown owl with amber eyes
  VOICE: deep and measured
CHARACTER @narrator | Narrator | voice_only
  VOICE: calm and gentle

== PROPS ==
PROP @parcel | Parcel
  LOOK: a blue cardboard box
  RULE: same size and colour in every scene
  VARIANT opened | 2-3 | the lid is open

== LOCATIONS ==
LOCATION @porch | Front porch
  LOOK: wooden steps and a green front door
  LIGHT: soft morning sunlight

== RULES ==
RULE: @parcel stays blue.
NOTE: Keep the story gentle.
```

Humans need FACE, HAIR (or an explicit bald description) and OUTFIT. Animals/creatures need SPECIES and LOOK. A `voice_only` character does not need visual fields. Other fields (AGE, ROLE, SKIN/FUR, EYES, BUILD, PERSONALITY, ACCESSORIES…) are retained.

PROP and LOCATION blocks may also follow CHARACTER blocks directly in older files. Use exact IDs; the reader accepts a grammatical `s` plural of a declared prop (`@parcels` for `@parcel`) for compatibility. It does not guess other undefined IDs.

For films or a single episode, variants use a scene range such as `2-3`. For a series use `E01S02-E01S03`. Ranges must exist and must not overlap for the same prop.

## Scenes and optional shots

```text
== SCENES ==
SCENE 1 | 6s | A delivery
  AT: @porch, morning
  CAST: @ada, @narrator (voice)
  CLIP: hero
  LIPSYNC: required
  MOOD: delighted
  VISUAL: @ada lifts @parcel.
  KEYFRAME: @ada's whole face and @parcel are inside frame.
  CAMERA: static medium shot
  FRAME: @ada on the left, @parcel at centre
  MUSIC: gentle piano | sound: soft piano | fade_in: 0.5s | fade_out: 1s
  TRANSITION: cut
  SFX: a bell | sound: doorbell | length: 1s | at: 0.5s
  ACTION: @ada opens @parcel. | at: 2s
  @ada (delighted): "It's here!" | at: 1s
  @narrator [VO]: "A little surprise." | at: 3s
```

Scene durations are **2.5–29.9 seconds**; prefer 12 seconds or less. H3 snaps output to its frame grid, so final assembly must use actual video durations, not these requested numbers.

SHOT blocks are optional. Indent shot fields one level deeper. Their durations must sum to the scene duration within 0.5 seconds. Shot `at:` values are relative to that shot; scene-level `at:` values are relative to the scene. A shot inherits CAST, KEYFRAME and CAMERA from its scene unless overridden.

```text
  SHOT 1 | 3s | wide
    VISUAL: @ada reaches for @parcel.
    KEYFRAME: hands on the box
    CAMERA: static wide shot
  SHOT 2 | 3s | close-up
    VISUAL: @ada smiles.
    KEYFRAME: her whole face is visible
    CAMERA: slow push-in
    @ada (warm): "A surprise!" | at: 0.5s
```

For series, replace `== SCENES ==` with `== EPISODE 01 | Episode title ==`, followed by SCENE blocks. Add the next episode header when needed. No EPISODE block means one film, never an automatically invented series.

## Validation and review

| Code | Meaning |
|---|---|
| E01–E02 | Missing title/aspect or unsupported aspect |
| E03–E05 | Undefined reference, duplicate ID, missing/invalid character description |
| E06–E07 | Invalid duration or shot totals/numbers |
| E08–E10 | Event outside its time window, speaker missing from CAST, scene numbering problem |
| E11 | Unrecognized syntax or no scenes; never silently discarded |
| E12 | Fixer changed spoken lines, character identity IDs, scene/episode boundaries |
| W01–W03 | Dialogue may not fit, more than 3 speakers, potentially more than 9 image references |
| W04–W06 | Missing camera/keyframe, invalid variant ranges, missing location |

Every issue has a source line and English/Bangla explanations. Warnings need review even when validation passes. Timing is checked locally per shot/scene, including the full SFX length.

The legacy time-range format (`SCENE 01 | 00:00–00:10 (10 seconds)`, ACTION, DIALOGUE, END FRAME, SFX) is readable. END FRAME becomes KEYFRAME. Named speakers become draft character entries with **no invented appearance**. The LLM fixer proposes missing descriptions/camera/location details. All proposals require owner approval.

Structural checks cannot prove visual/story faithfulness. Read the original/fixed diff before approving. A validation pass never approves a script or starts generation.

## Local checks

```sh
npm --prefix worker ci
npm run test:pipeline
npm run typecheck:pipeline
npm --prefix worker run fix -- /path/to/script.txt --dry-run --out /private/tmp/drama-review
```

Dry-run makes canonical text and a report **without calling any model server**. Exit code `0` means no validation errors, `2` means review/repair is still needed, and `1` means an execution/configuration failure. Output files are `<script>.fixed.txt` and `<script>.report.json`; existing files are protected unless `--overwrite` is supplied.

Live repair runs **inside Colab** against an OpenAI-compatible model server on `http://127.0.0.1:8000/v1`. The notebook now provides the local model server; a measured GPU evaluation remains pending; see [the Colab-only model decision](COLAB_LLM.md). There is no paid API fallback. HF_TOKEN, if present, is only for model downloads and is never forwarded by the inference client.

After the model is loaded locally, use Node 22.12+ (prefer Node 24):

```sh
npm --prefix worker run fix -- --list-models
npm --prefix worker run fix -- /path/to/script.txt --model Qwen/Qwen3.6-27B --episode 1 --out /content/private-review/27b
```

`COLAB_LLM_MODEL` can supply the model ID instead of `--model`. An optional `COLAB_LLM_KEY` authenticates the local server; keep it in ignored configuration. The adapter refuses remote endpoints and HTTP redirects. Colab compute units are consumed while its GPU runtime is allocated, including during model download/loading and idle time.

For comparison, run each model separately into different review folders, unloading the previous model before loading the next. Compare reports, diffs and timing before owner approval. `npm --prefix worker run compare -- ... --models model-a,model-b --episode 1 --out ...` requires candidates advertised by the local server. The bundled server loads each requested candidate on demand, releasing the previous model first. It never keeps both loaded.

Live series repair requires an explicit episode to avoid truncation; it keeps the shared character definitions. Review and carry approved shared descriptions forward between episodes. The comparison does not select a winner or approve outputs automatically.

Private script tests read the original three files from `~/Downloads` when present, or from `PRIVATE_SCRIPT_DIR`. They skip elsewhere; no private contents or generated outputs are checked into the repo.
