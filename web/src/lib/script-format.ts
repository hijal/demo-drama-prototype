/**
 * Copyable instructions for an external AI chat (ChatGPT, Claude, Gemini…).
 * The owner pastes this, fills in the story idea, and the AI answers with a
 * script in the canonical format from docs/SCRIPT_FORMAT.md.
 *
 * The structure follows the owner's best single-film scripts (narrator
 * bookends, detailed cast, SHOT blocks). Runtime and scene count are chosen by
 * the owner; the 40 s / 6-scene example only shows the format. The example is
 * synthetic; the owner's own scripts must not be committed to this public repo.
 */
export const SINGLE_SCRIPT_PROMPT = `You are a screenwriter for an AI video pipeline (MiniMax H3). Write ONE short film script about the story idea below.

STORY IDEA: <write your idea here>
GENRE: <e.g. cozy comedy, family drama, thriller>
RUNTIME: <total seconds, e.g. 40s, 60s, 90s>
SCENES: <number of scenes, e.g. 6, or "you decide">
ASPECT: 16:9
LANGUAGE: English

Reply with ONLY the script as plain text inside one code block, in exactly the same format and level of detail as the EXAMPLE. No explanations before or after. The EXAMPLE is 6 scenes and 40 seconds only to show the format; follow the RUNTIME and SCENES above, not the example's length.

TIMING
- Scene durations must add up to RUNTIME (within 1 second). RUNTIME in the header must state that total.
- Each scene lasts 2.5–29.9 seconds; prefer 4–12 seconds. If SCENES is "you decide", pick a count that gives about 5–10 seconds per scene.
- Scenes longer than about 6 seconds should be split into 2–3 SHOT blocks (each shot 2–5 seconds).

STORY SHAPE (scale it to the number of scenes)
- First scene: setup — the main character with the key object, one narrator line. CLIP: still.
- Early scenes: the problem — something is missing or wrong.
- Middle scenes: trying harder and failing, or the conflict growing. Use as many as the length needs.
- Late scene: the twist — another character or event changes something.
- Second-to-last scene: the payoff — the main character discovers it is now right. CLIP: hero.
- Last scene: the ending — the characters together, the narrator echoes the first scene's line. CLIP: still, TRANSITION: fade 1s.
- Very short films may merge beats (e.g. 3 scenes: setup+problem, twist, payoff+ending).

HEADER
- First line: DRAMA SCRIPT. Then TITLE, LOGLINE, GENRE, LANGUAGE, ASPECT, ALT ASPECT, RESOLUTION, FPS, RUNTIME, STYLE, SETTING, STYLE PROMPT, NEGATIVE PROMPT.
- ASPECT 16:9 uses RESOLUTION 1920x1080; ASPECT 9:16 uses RESOLUTION 1080x1920.
- STYLE PROMPT: camera lens, depth of field, film grain, colour grade, food/material texture. NEGATIVE PROMPT: text, letters, watermark, logo, extra fingers, deformed hands, cartoon, oversaturated colours.
- A long value may continue on the next line, indented further than the field.

CAST, PROPS, LOCATION
- Give everything a unique lowercase ID (@name) and use exactly those IDs everywhere.
- Usually two human characters (add more only if the story needs them), each with ALL of: ROLE, AGE, GENDER, FACE, SKIN, EYES, HAIR, BUILD, OUTFIT, ACCESSORIES, PERSONALITY, VOICE, ACCENT. Give each face one distinctive mark (mole, scar, freckles, dimple) so it stays recognisable. Animal characters use SPECIES and LOOK instead of FACE/SKIN/HAIR.
- One narrator: CHARACTER @narrator | Narrator | voice_only, with only VOICE and ACCENT.
- 2–4 props, each with LOOK (colour, material, size) and RULE (stays identical every time). If a prop visibly changes, add VARIANT name | scene range | description (e.g. VARIANT stirred | 5-6 | ...), using real scene numbers from your script.
- Prefer one LOCATION with LOOK and LIGHT; add more only if the story really moves.
- Put characters under == CHARACTERS ==, props under == PROPS == and locations under == LOCATIONS ==, as in the EXAMPLE.
- == RULES == with RULE lines for continuity and this NOTE: Keep dialogue, narration, music and effects on separate audio tracks.

SCENES
- Scene header: SCENE n | Ns | Title, numbered 1, 2, 3… Scene fields are indented 2 spaces; SHOT fields 4 spaces.
- The first scene (and any scene in a new location) has AT: @location, time of day. Other scenes have AT: @location.
- CAST lists everyone visible or speaking. Mark partly visible people "(glimpsed)" and the narrator "@narrator (voice)".
- Every scene has MOOD. The first scene has the full MUSIC line: MUSIC: Description. | sound: instruments, tempo | fade_in: 0.5s | fade_out: 1s. Later scenes repeat MUSIC: Description. The payoff scene may say the music turns brighter.
- Scenes without shots need CLIP, LIPSYNC, VISUAL, KEYFRAME, CAMERA, FRAME. Each SHOT n | Ns | wide/close-up needs LIPSYNC, VISUAL, KEYFRAME, CAMERA, FRAME; mark the dialogue shot CLIP: hero.
- Shot durations must add up exactly to the scene duration.
- CLIP is still or hero. LIPSYNC is required when a visible character speaks, otherwise none.
- VISUAL = the action in one sentence. KEYFRAME = the exact frozen image at the end (who, where, hands, eyes). CAMERA = shot size + movement (static, slow push-in, gentle drift left). FRAME = who is left/centre/right.
- SFX: Short description. | sound: precise sound | length: Ns | at: Ns
- Optional ACTION: description | at: Ns
- Dialogue: @id (emotion): "line" | at: Ns, narrator: @narrator [VO]: "line" | at: Ns
- At most ONE spoken line per scene or shot, 2–7 words, so it fits the time. Every speaker must be in CAST. Every at: time + length must stay inside its scene/shot (shot times are relative to the shot).
- The first and last scenes have TRANSITION (cut, fade 1s); a scene before a location or time jump may also use fade 1s. Use no other syntax and no EPISODE blocks.

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

== PROPS ==

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

== LOCATIONS ==

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

/**
 * Series version of the prompt. A long series does not fit in one AI reply,
 * so the AI writes the shared header and cast with Episode 01, then one
 * episode per "next". The owner pastes the replies one after another into a
 * single .txt file. The example is synthetic.
 */
export const SERIES_SCRIPT_PROMPT = `You are a screenwriter for an AI video pipeline (MiniMax H3). Write an EPISODE SERIES script about the story idea below.

STORY IDEA: <write your idea here>
GENRE: <e.g. kids comedy, family drama, adventure>
EPISODES: <number of episodes, e.g. 5, 10, 20>
SCENES PER EPISODE: <e.g. 9, or "you decide">
SCENE LENGTH: <seconds per scene, e.g. 10s, or "you decide">
ASPECT: 9:16
LANGUAGE: English

HOW TO REPLY
- A long series does not fit in one reply, so write it in parts. Each reply is ONLY script text inside one code block, no explanations.
- First reply: the header, == CHARACTERS ==, == PROPS ==, == LOCATIONS ==, == RULES == and == EPISODE 01 ==.
- When I write "next", reply with ONLY the next episode block (== EPISODE 02 == and its scenes, then 03, and so on). Never repeat the header or cast.
- The first reply must declare EVERY character, prop and location the whole series will use, including ones that appear only in later episodes. Later episodes must not introduce new IDs.
- Plan the whole series arc before the first reply so later episodes stay consistent.

TIMING
- Each scene lasts 2.5–29.9 seconds; prefer 4–12 seconds. Use SCENE LENGTH if given.
- Scenes longer than about 6 seconds should be split into 2–3 SHOT blocks (each shot 2–5 seconds). Shot durations must add up exactly to the scene duration.
- RUNTIME in the header is the total of all episodes; EPISODE RUNTIME is one episode.

EPISODE SHAPE
- Every episode works on its own: a hook in scene 1, a problem that grows, and a payoff in the last scene.
- Most episodes end on a small cliffhanger or a funny button that leads into the next one. The last episode resolves the whole series.
- Scene 1 of each episode may have one narrator line that recalls or sets up the episode.

HEADER
- First line: DRAMA SCRIPT. Then TITLE, LOGLINE, GENRE, LANGUAGE, ASPECT, RESOLUTION, FPS, RUNTIME, EPISODE RUNTIME, STYLE, SETTING, STYLE PROMPT, NEGATIVE PROMPT.
- ASPECT 9:16 uses RESOLUTION 1080x1920; ASPECT 16:9 uses RESOLUTION 1920x1080.
- STYLE PROMPT: camera lens, depth of field, film grain, colour grade, material texture. NEGATIVE PROMPT: text, letters, watermark, logo, extra fingers, deformed hands, oversaturated colours.
- A long value may continue on the next line, indented further than the field.

CAST, PROPS, LOCATIONS
- Give everything a unique lowercase ID (@name) and use exactly those IDs everywhere, in every episode.
- Human characters need ALL of: ROLE, AGE, GENDER, FACE, SKIN, EYES, HAIR, BUILD, OUTFIT, ACCESSORIES, PERSONALITY, VOICE, ACCENT. Give each face one distinctive mark (mole, scar, freckles, dimple).
- Animal or creature characters use the type animal or creature and need ALL of: ROLE, SPECIES, LOOK (size, colours, markings, one distinctive mark), ACCESSORIES, PERSONALITY, VOICE, ACCENT.
- One narrator: CHARACTER @narrator | Narrator | voice_only, with only VOICE and ACCENT.
- Props have LOOK (colour, material, size) and RULE (stays identical every time). If a prop visibly changes, add VARIANT name | range | description, with series ranges like E02S02-E02S03 (episode and scene numbers that exist).
- Every LOCATION has LOOK and LIGHT. Reuse a few locations across the series instead of a new one per scene.
- Put characters under == CHARACTERS ==, props under == PROPS == and locations under == LOCATIONS ==.
- == RULES == with RULE lines for continuity and this NOTE: Keep dialogue, narration, music and effects on separate audio tracks.

EPISODES AND SCENES
- Episode header: == EPISODE 01 | Episode title ==, numbered 01, 02, 03…
- Scene numbers restart at 1 in every episode: SCENE n | Ns | Title. Scene fields are indented 2 spaces; SHOT fields 4 spaces.
- Every scene has AT: @location (add the time of day in scene 1 of each episode and on any location change).
- CAST lists everyone visible or speaking. Mark partly visible characters "(glimpsed)" and the narrator "@narrator (voice)".
- Every scene has MOOD. Scene 1 of each episode has the full MUSIC line: MUSIC: Description. | sound: instruments, tempo | fade_in: 0.5s | fade_out: 1s. Later scenes repeat MUSIC: Description.
- Scenes without shots need CLIP, LIPSYNC, VISUAL, KEYFRAME, CAMERA, FRAME. Each SHOT n | Ns | wide/close-up needs LIPSYNC, VISUAL, KEYFRAME, CAMERA, FRAME; mark the dialogue shot CLIP: hero.
- CLIP is still or hero. LIPSYNC is required when a visible character speaks, otherwise none.
- VISUAL = the action in one sentence. KEYFRAME = the exact frozen image at the end (who, where, paws/hands, eyes). CAMERA = shot size + movement. FRAME = who is left/centre/right.
- SFX: Short description. | sound: precise sound | length: Ns | at: Ns
- Optional ACTION: description | at: Ns
- Dialogue: @id (emotion): "line" | at: Ns, narrator: @narrator [VO]: "line" | at: Ns
- At most ONE spoken line per scene or shot, 2–7 words, so it fits the time. Every speaker must be in CAST. Every at: time + length must stay inside its scene/shot (shot times are relative to the shot).
- The first and last scene of each episode have TRANSITION (cut, fade 1s). Use no other syntax.

EXAMPLE (two short episodes of three scenes, only to show the format; follow EPISODES, SCENES PER EPISODE and SCENE LENGTH above)
\`\`\`
DRAMA SCRIPT

TITLE: Pip and the Red Bucket
LOGLINE: A curious goat keeps stealing the farmer's red bucket, until she finds out why.
GENRE: Kids comedy
LANGUAGE: English
ASPECT: 9:16
RESOLUTION: 1080x1920
FPS: 24
RUNTIME: 48s
EPISODE RUNTIME: 24s
STYLE: bright cinematic realism, small family farm in spring
SETTING: A small farm with a red barn and an apple orchard.
STYLE PROMPT: cinematic film still, 35mm lens, shallow depth of field, soft film grain,
    fresh spring colour grade, realistic fur and wood texture
NEGATIVE PROMPT: text, letters, watermark, logo, extra fingers, deformed hands,
    oversaturated colours

== CHARACTERS ==

CHARACTER @rosa | Rosa Alvarez | human
  ROLE: farmer
  AGE: 52
  GENDER: female
  FACE: round face, laugh lines, small mole above the left lip
  SKIN: warm brown
  EYES: dark brown, kind
  HAIR: grey-streaked black hair in a low bun
  BUILD: short, sturdy
  OUTFIT: faded denim overalls over a white T-shirt, green rubber boots
  ACCESSORIES: wide straw hat
  PERSONALITY: patient, warm, a little stubborn
  VOICE: low, warm, slightly husky
  ACCENT: soft Mexican-American

CHARACTER @pip | Pip | animal
  ROLE: mischievous young goat
  SPECIES: goat
  LOOK: small white goat with a brown patch over the right eye, short curved horns, a tiny beard
  ACCESSORIES: red collar with a small brass bell
  PERSONALITY: curious, cheeky, loyal
  VOICE: bright, bleating, playful
  ACCENT: none

CHARACTER @narrator | Narrator | voice_only
  VOICE: friendly, playful storyteller
  ACCENT: neutral American

== PROPS ==

PROP @bucket | Red bucket
  LOOK: small round red metal bucket with a silver handle
  RULE: same colour, size and handle every time
  VARIANT apples | E02S02-E02S03 | the same bucket filled to the top with shiny red apples

== LOCATIONS ==

LOCATION @barn | Red barn yard
  LOOK: red wooden barn with white trim, a hay bale beside the open door, a muddy yard
  LIGHT: bright spring morning sun from the left

LOCATION @orchard | Apple orchard
  LOOK: rows of short apple trees heavy with red apples, green grass between them
  LIGHT: warm afternoon sun through the leaves

== RULES ==

RULE: @pip always wears the red collar with the bell.
RULE: @bucket stays empty until episode 2, scene 2.
NOTE: Keep dialogue, narration, music and effects on separate audio tracks.

== EPISODE 01 | The Missing Bucket ==

SCENE 1 | 8s | Morning Chores
  AT: @barn, morning
  CAST: @rosa, @narrator (voice)
  CLIP: still
  LIPSYNC: none
  MOOD: calm, busy
  VISUAL: @rosa sets @bucket down beside the hay bale and turns to open the barn door.
  KEYFRAME: @rosa at the barn door, @bucket on the ground beside the hay bale.
  CAMERA: Medium wide shot, static.
  FRAME: @rosa right at the door; @bucket left by the hay bale
  MUSIC: Playful banjo. | sound: light plucked banjo, bouncy tempo | fade_in: 0.5s | fade_out: 1s
  TRANSITION: cut
  SFX: A barn door creaks. | sound: old wooden door creak | length: 1.5s | at: 4s

  @narrator [VO]: "Every morning, the bucket waited." | at: 1s

SCENE 2 | 8s | Gone
  AT: @barn
  CAST: @rosa, @pip (glimpsed)
  MOOD: puzzled
  MUSIC: Playful banjo.

  SHOT 1 | 4s | wide
    LIPSYNC: none
    VISUAL: @pip trots past the hay bale with @bucket's handle in his mouth.
    KEYFRAME: @pip mid-trot, @bucket swinging from his mouth, bell on his collar.
    CAMERA: Wide shot, slow pan right.
    FRAME: @pip centre, moving right; hay bale left
    SFX: A collar bell jingles. | sound: small brass bell jingling | length: 1s | at: 0.5s

  SHOT 2 | 4s | close-up
    CLIP: hero
    LIPSYNC: required
    VISUAL: @rosa turns back and stares at the empty spot by the hay bale.
    KEYFRAME: @rosa's surprised face, eyebrows raised, looking down.
    CAMERA: Close-up on her face, static.
    FRAME: @rosa centred
    @rosa (puzzled): "Where did it go?" | at: 1s

SCENE 3 | 8s | Bell in the Trees
  AT: @orchard, afternoon
  CAST: @rosa
  CLIP: hero
  LIPSYNC: required
  MOOD: curious
  VISUAL: @rosa walks between the apple trees, listening, one hand on her straw hat.
  KEYFRAME: @rosa between two apple trees, head tilted, listening.
  CAMERA: Medium shot, slow push-in.
  FRAME: @rosa centred between the trees
  MUSIC: Playful banjo.
  TRANSITION: fade 1s
  SFX: A distant bell jingles. | sound: faint brass bell far away | length: 1s | at: 0.5s

  @rosa (whispering): "I hear you, Pip." | at: 3s

== EPISODE 02 | The Apple Gift ==

SCENE 1 | 8s | Found
  AT: @orchard, afternoon
  CAST: @rosa, @pip, @narrator (voice)
  CLIP: still
  LIPSYNC: none
  MOOD: tense, then surprised
  VISUAL: @rosa steps around a tree and finds @pip standing proudly beside @bucket.
  KEYFRAME: @pip beside @bucket under an apple tree, @rosa stopping in front of them.
  CAMERA: Medium wide shot, static.
  FRAME: @rosa left; @pip and @bucket right
  MUSIC: Playful banjo. | sound: light plucked banjo, bouncy tempo | fade_in: 0.5s | fade_out: 1s
  TRANSITION: cut

  @narrator [VO]: "Pip had a plan." | at: 1s

SCENE 2 | 8s | Full of Apples
  AT: @orchard
  CAST: @rosa, @pip
  MOOD: amazed
  MUSIC: Playful banjo, brighter.

  SHOT 1 | 4s | close-up
    LIPSYNC: none
    VISUAL: @pip nudges @bucket forward with his nose, showing it is full of apples.
    KEYFRAME: @bucket full of red apples, @pip's nose touching its rim.
    CAMERA: Close-up on the bucket, slight tilt down.
    FRAME: @bucket centred; @pip's head right
    SFX: Apples knock together. | sound: soft wooden thuds of apples | length: 1s | at: 1s

  SHOT 2 | 4s | close-up
    CLIP: hero
    LIPSYNC: required
    VISUAL: @rosa kneels down and laughs softly.
    KEYFRAME: @rosa kneeling, smiling, eyes on @pip.
    CAMERA: Close-up on her face, gentle drift in.
    FRAME: @rosa centred
    @rosa (laughing): "You picked these?" | at: 1s

SCENE 3 | 8s | Best Helper
  AT: @orchard
  CAST: @rosa, @pip, @narrator (voice)
  CLIP: still
  LIPSYNC: none
  MOOD: warm
  VISUAL: @rosa carries @bucket toward the barn while @pip trots proudly beside her.
  KEYFRAME: @rosa and @pip side by side walking away, @bucket full of apples in her hand.
  CAMERA: Wide shot from behind, static.
  FRAME: @rosa left; @pip right
  MUSIC: Playful banjo, brighter.
  TRANSITION: fade 1s

  @narrator [VO]: "Best helper on the farm." | at: 2s
\`\`\`
`;
