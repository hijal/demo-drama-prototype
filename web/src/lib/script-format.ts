/**
 * Copyable instructions for an external AI chat (ChatGPT, Claude, Gemini…).
 * The owner pastes this, fills in the story idea, and the AI answers with a
 * script in the canonical format from docs/SCRIPT_FORMAT.md.
 *
 * The structure follows the owner's best single-film scripts (40 s, 6 scenes,
 * narrator bookends, detailed cast, SHOT blocks). The example is synthetic;
 * the owner's own scripts must not be committed to this public repo.
 */
export const SINGLE_SCRIPT_PROMPT = `You are a screenwriter for an AI video pipeline (MiniMax H3). Write ONE short cozy film script about the story idea below.

STORY IDEA: <write your idea here>
RUNTIME: 40s (6 scenes)
ASPECT: 16:9
LANGUAGE: English

Reply with ONLY the script as plain text inside one code block, in exactly the same format and level of detail as the EXAMPLE. No explanations before or after.

STORY SHAPE (6 scenes, total 40 seconds)
- Scene 1 | 6s | Setup: the main character with the key object, one narrator line. CLIP: still.
- Scene 2 | 7s | Problem: something is missing or wrong. 2 shots (4s + 3s).
- Scene 3 | 8s | Trying harder: the character tries again and fails. 2 shots (4s + 4s).
- Scene 4 | 10s | Twist: a second character arrives and changes something. 3 shots (4s + 3s + 3s).
- Scene 5 | 5s | Payoff: the main character discovers it is now perfect. CLIP: hero.
- Scene 6 | 4s | Ending: both characters together, the narrator repeats/echoes the scene 1 line. CLIP: still, TRANSITION: fade 1s.

HEADER
- First line: DRAMA SCRIPT. Then TITLE, LOGLINE, GENRE, LANGUAGE, ASPECT, ALT ASPECT, RESOLUTION, FPS, RUNTIME, STYLE, SETTING, STYLE PROMPT, NEGATIVE PROMPT.
- ASPECT 16:9 uses RESOLUTION 1920x1080; ASPECT 9:16 uses RESOLUTION 1080x1920.
- STYLE PROMPT: camera lens, depth of field, film grain, colour grade, food/material texture. NEGATIVE PROMPT: text, letters, watermark, logo, extra fingers, deformed hands, cartoon, oversaturated colours.
- A long value may continue on the next line, indented further than the field.

CAST, PROPS, LOCATION
- Give everything a unique lowercase ID (@name) and use exactly those IDs everywhere.
- Two human characters, each with ALL of: ROLE, AGE, GENDER, FACE, SKIN, EYES, HAIR, BUILD, OUTFIT, ACCESSORIES, PERSONALITY, VOICE, ACCENT. Give each face one distinctive mark (mole, scar, freckles, dimple) so it stays recognisable.
- One narrator: CHARACTER @narrator | Narrator | voice_only, with only VOICE and ACCENT.
- 2–4 props, each with LOOK (colour, material, size) and RULE (stays identical every time). If a prop visibly changes, add VARIANT name | scene range | description (e.g. VARIANT stirred | 5-6 | ...).
- Exactly one LOCATION with LOOK and LIGHT.
- == RULES == with RULE lines for continuity and this NOTE: Keep dialogue, narration, music and effects on separate audio tracks.

SCENES
- Scene header: SCENE n | Ns | Title. Scene fields are indented 2 spaces; SHOT fields 4 spaces.
- Scene 1 has AT: @location, time of day. Later scenes have AT: @location.
- CAST lists everyone visible or speaking. Mark partly visible people "(glimpsed)" and the narrator "@narrator (voice)".
- Every scene has MOOD. Scene 1 has the full MUSIC line: MUSIC: Description. | sound: instruments, tempo | fade_in: 0.5s | fade_out: 1s. Later scenes repeat MUSIC: Description. Scene 5 may say the music turns brighter.
- Scenes without shots need CLIP, LIPSYNC, VISUAL, KEYFRAME, CAMERA, FRAME. Each SHOT n | Ns | wide/close-up needs LIPSYNC, VISUAL, KEYFRAME, CAMERA, FRAME; mark the dialogue shot CLIP: hero.
- Shot durations must add up exactly to the scene duration.
- CLIP is still or hero. LIPSYNC is required when a visible character speaks, otherwise none.
- VISUAL = the action in one sentence. KEYFRAME = the exact frozen image at the end (who, where, hands, eyes). CAMERA = shot size + movement (static, slow push-in, gentle drift left). FRAME = who is left/centre/right.
- SFX: Short description. | sound: precise sound | length: Ns | at: Ns
- Optional ACTION: description | at: Ns
- Dialogue: @id (emotion): "line" | at: Ns, narrator: @narrator [VO]: "line" | at: Ns
- At most ONE spoken line per scene or shot, 2–7 words, so it fits the time. Every speaker must be in CAST. Every at: time + length must stay inside its scene/shot (shot times are relative to the shot).
- Scenes 1 and 6 have TRANSITION (cut, fade 1s). Use no other syntax and no EPISODE blocks.

EXAMPLE
\`\`\`
DRAMA SCRIPT

TITLE: The Sunday Stack
LOGLINE: A father flips the perfect pancake stack every Sunday, until his daughter tops it with the one thing it lacked — a berry smile.
GENRE: Cozy comedy
LANGUAGE: English
ASPECT: 16:9
ALT ASPECT: 9:16
RESOLUTION: 1920x1080
FPS: 24
RUNTIME: 40s
STYLE: soft cinematic realism, sunny kitchen on a Sunday morning
SETTING: A small family kitchen. A father chases the perfect pancake stack.
STYLE PROMPT: cinematic film still, 35mm lens, shallow depth of field, soft film grain,
    warm golden morning colour grade, realistic food texture, soft steam in sunlight
NEGATIVE PROMPT: text, letters, watermark, logo, extra fingers, deformed hands, cartoon,
    oversaturated colours

== CHARACTERS ==

CHARACTER @omar | Omar Haddad | human
  ROLE: Sunday pancake cook
  AGE: 40
  GENDER: male
  FACE: oval face, short trimmed beard, small scar on the chin
  SKIN: light olive
  EYES: brown, focused
  HAIR: short wavy dark-brown hair, greying at the temples
  BUILD: tall, broad-shouldered
  OUTFIT: blue checked shirt with sleeves rolled up under a white apron
  ACCESSORIES: black-rimmed reading glasses pushed up on his head
  PERSONALITY: careful, proud, soft-hearted
  VOICE: deep, calm, warmer when amused
  ACCENT: neutral American

CHARACTER @lina | Lina Haddad | human
  ROLE: Omar's daughter
  AGE: 8
  GENDER: female
  FACE: round face, dimple in the right cheek, freckles across the nose
  SKIN: light olive
  EYES: brown, bright
  HAIR: two short dark-brown pigtails with yellow ties
  BUILD: small, slight
  OUTFIT: green pyjamas with white clouds
  ACCESSORIES: fuzzy yellow slippers
  PERSONALITY: playful, curious, confident
  VOICE: high, quick, cheerful
  ACCENT: neutral American

CHARACTER @narrator | Narrator | voice_only
  VOICE: warm, fond, unhurried
  ACCENT: neutral American

PROP @pancakes | Pancake stack
  LOOK: stack of four golden fluffy pancakes on a white round plate with a pat of butter on top
  RULE: same height, colour and plate every time
  VARIANT smiley | 5-6 | the same stack topped with a smiling face made of blueberries and strawberry slices

PROP @syrup | Maple syrup bottle
  LOOK: small glass bottle of amber maple syrup with a red cap
  RULE: same bottle shape and syrup colour every time

PROP @berries | Bowl of berries
  LOOK: small blue ceramic bowl of fresh blueberries and sliced strawberries
  RULE: same bowl and berry mix every time

LOCATION @kitchen | Family kitchen
  LOOK: small bright kitchen with white tiles, a wooden counter, a cast-iron pan on the stove,
      a window with yellow curtains
  LIGHT: warm morning sunlight through the window, soft fill from the left

== RULES ==

RULE: @pancakes stays plain until @lina tops it in scene 4.
NOTE: Keep dialogue, narration, music and effects on separate audio tracks.

== SCENES ==

SCENE 1 | 6s | The Perfect Stack
  AT: @kitchen, Sunday morning
  CAST: @omar, @narrator (voice)
  CLIP: still
  LIPSYNC: none
  MOOD: calm, proud
  VISUAL: @omar sets @pancakes on the counter in the sunlight and straightens the butter pat.
  KEYFRAME: @omar leans over @pancakes, one finger on the butter, the stack centred in sunlight.
  CAMERA: Medium close-up, slow push-in toward the stack.
  FRAME: @omar centred; @pancakes in the foreground
  MUSIC: Light ukulele. | sound: soft plucked ukulele, gentle tempo | fade_in: 0.5s | fade_out: 1s
  TRANSITION: cut

  @narrator [VO]: "Sunday. The perfect stack." | at: 1s

SCENE 2 | 7s | Something Missing
  AT: @kitchen
  CAST: @omar
  MOOD: puzzled
  MUSIC: Light ukulele.

  SHOT 1 | 4s | close-up
    LIPSYNC: none
    VISUAL: @omar cuts a small piece of @pancakes and tastes it slowly, his brow creasing.
    KEYFRAME: @omar holds a fork near his mouth, eyes half closed, tasting.
    CAMERA: Close-up on his face, static.
    FRAME: @omar centred; fork near his mouth
    SFX: A fork taps the plate. | sound: soft metal fork on ceramic | length: 0.5s | at: 0.5s

  SHOT 2 | 3s | close-up
    CLIP: hero
    LIPSYNC: required
    VISUAL: @omar puts the fork down and stares at @pancakes, frowning a little.
    KEYFRAME: @omar's hand rests beside the plate, eyes on @pancakes.
    CAMERA: Close-up on his face and the stack, gentle drift right.
    FRAME: @omar left; @pancakes right
    @omar (muttering): "It needs something." | at: 0.5s

SCENE 3 | 8s | More Syrup
  AT: @kitchen
  CAST: @omar
  MOOD: stubborn
  MUSIC: Light ukulele.

  SHOT 1 | 4s | close-up
    CLIP: hero
    LIPSYNC: none
    VISUAL: @omar pours a thick ribbon of @syrup over @pancakes from a height.
    KEYFRAME: @omar's hand tilts @syrup high above @pancakes, amber syrup mid-pour.
    CAMERA: Close-up on the stack, slight tilt down.
    FRAME: @pancakes centred; @syrup above
    SFX: Syrup drips. | sound: thick slow syrup dripping onto pancakes | length: 1s | at: 0.5s

  SHOT 2 | 4s | close-up
    CLIP: hero
    LIPSYNC: required
    VISUAL: @omar tastes again and his shoulders drop.
    KEYFRAME: @omar holds the fork at his mouth, eyes closed, mid-chew.
    CAMERA: Close-up on his face, static, hold.
    FRAME: @omar centred
    @omar (deflated): "Still not it." | at: 1s

SCENE 4 | 10s | The Berry Smile
  AT: @kitchen
  CAST: @omar, @lina
  MOOD: curious, then surprised
  MUSIC: Light ukulele.

  SHOT 1 | 4s | wide
    LIPSYNC: none
    VISUAL: @lina shuffles into the kitchen in slippers, carrying @berries, and stops beside @omar.
    KEYFRAME: @lina stands at the counter edge holding @berries, smiling up at @omar.
    CAMERA: Wide shot, static, hold.
    FRAME: @omar right; @lina centre-left at the counter
    SFX: Soft slipper steps. | sound: fuzzy slippers on a tile floor | length: 1.5s | at: 0s

  SHOT 2 | 3s | close-up
    LIPSYNC: none
    VISUAL: @lina places blueberries and strawberry slices on @pancakes to make a smiling face.
    KEYFRAME: @lina's small hand sets the last strawberry slice as the smile on @pancakes.
    CAMERA: Close-up on her hand and the stack, static.
    FRAME: @lina's hand above @pancakes; @pancakes centred

  SHOT 3 | 3s | close-up
    CLIP: hero
    LIPSYNC: required
    VISUAL: @omar starts to object, stops, and looks at the berry face.
    KEYFRAME: @omar's lips parted, one finger raised, eyes on @pancakes.
    CAMERA: Close-up on his face, gentle drift in.
    FRAME: @omar centred
    @omar (startled): "Lina, that's— oh." | at: 0.5s

SCENE 5 | 5s | The Perfect Bite
  AT: @kitchen
  CAST: @omar, @lina (glimpsed)
  CLIP: hero
  LIPSYNC: required
  MOOD: delighted, warm
  VISUAL: @omar tastes a bite with a berry, and a slow surprised smile spreads across his face.
  KEYFRAME: @omar holds the fork near his mouth, eyes wide open, smile beginning.
  CAMERA: Close-up on his face, static, hold.
  FRAME: @omar centred; @lina glimpsed at the right edge
  MUSIC: Light ukulele, brighter. | fade_in: 0.5s | fade_out: 1s

  @omar (delighted): "Now it's perfect." | at: 1s

SCENE 6 | 4s | Two Forks
  AT: @kitchen
  CAST: @omar, @lina, @narrator (voice)
  CLIP: still
  LIPSYNC: none
  MOOD: warm, easy
  VISUAL: @omar and @lina sit side by side at the counter, sharing @pancakes, both mid-bite.
  KEYFRAME: @omar and @lina shoulder to shoulder, forks raised, @pancakes centred between them.
  CAMERA: Medium two-shot, static.
  FRAME: @omar left; @lina right; @pancakes centred
  TRANSITION: fade 1s

  @narrator [VO]: "Sunday. The perfect stack." | at: 0.5s
\`\`\`
`;
