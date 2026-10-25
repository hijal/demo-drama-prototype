// Synthetic examples only. The owner's scripts stay outside this public repo.
export const film = `DRAMA SCRIPT
TITLE: A Small Delivery
ASPECT: 16:9
LANGUAGE: English
STYLE PROMPT: warm afternoon light,
    gentle film grain

== CHARACTERS ==
CHARACTER @ada | Ada | human
  FACE: round face
  HAIR: short black hair
  OUTFIT: blue coat
CHARACTER @narrator | Narrator | voice_only
  VOICE: calm

== PROPS ==
PROP @box | Delivery box
  LOOK: small cardboard box
  VARIANT open | 1-1 | lid open

== LOCATIONS ==
LOCATION @porch | Porch
  LOOK: a wooden porch

== RULES ==
RULE: Keep @box blue.

== SCENES ==
SCENE 1 | 6s | Delivery
  AT: @porch, afternoon
  CAST: @ada, @narrator (voice)
  KEYFRAME: @ada holds @box.
  CAMERA: medium shot
  SHOT 1 | 3s | wide
    VISUAL: @ada picks up @box.
    KEYFRAME: hands on @box
    CAMERA: static
    SFX: cardboard creaks | length: 1s | at: 0.5s
  SHOT 2 | 3s | close-up
    KEYFRAME: @ada smiling
    CAMERA: gentle push-in
    @ada (pleased): "It's here: at last!" | at: 0.5s
    @narrator [VO]: "A little surprise." | at: 1s
`

export const loose = `FOREST DELIVERY — MICRO-DRAMA
2 EPISODES | 2 SCENES | 10 SECONDS EACH
9:16 VERTICAL
EPISODE 01 — THE PARCEL (00:10)
====================
SCENE 01 | 00:00–00:10 (10 seconds)
ACTION: Pip finds a parcel on the porch.
DIALOGUE: PIP: "For me?" OAK: "Of course!"
END FRAME: Pip raises the parcel.
SFX: A bell
EPISODE 02 — THE RIBBON (00:10)
====================
SCENE 01 | 00:00–00:10 (10 seconds)
ACTION: Oak unties a ribbon.
DIALOGUE: OAK: "A beautiful ribbon."
END FRAME: Oak holds the ribbon.
SFX: Rustling
`
