/** Ready-made MiniMax H3 prompt examples and camera vocabulary for the prompt editor. */

export const EXAMPLES: Array<{ title: string; note: string; text: string }> = [
  {
    title: "T2VA (text only)",
    note: "Pure text description - the model creates everything from scratch.",
    text: 'integrated_multimodal_description: [Shot 1] Live-action, cinematic, a medium-wide shot frames a baker opening the shutters of a small street bakery before sunrise. The camera pushes in with small amplitude at slow speed as the middle-aged baker with a calm, slightly raspy voice (S1) places a fresh loaf on the wooden counter and says: <d>[English] First batch of the morning.</d> [Shot 2] At 00:05.000, the camera cuts to a close-up of steam rising from the sliced bread while the baker\'s final words carry over from the previous shot.\n\noverall_soundscape: Wooden shutters scrape open over a quiet street as trays clink softly inside the bakery. The doorbell rings once, followed by light footsteps and the crisp sound of bread being sliced.\n\nnon_diegetic_music: A soft acoustic-guitar pattern at a moderate tempo, joined by sparse upright-bass notes and a gentle fade at the end.',
  },
  {
    title: "I2VA (initial frame)",
    note: "One image is the starting point, the scene moves forward.",
    text: 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] Live-action, cinematic, the young woman shown in <Picture 1> remains beside the rain-covered train window, preserving her appearance, clothing, seat position, and the carriage layout. The camera trucks right with small amplitude at slow speed as she lifts her gaze from the book in her lap to the window, rain streaking the glass, her reflection visible in the dark pane. She says softly: <d>[English] We\'re almost there.</d>\n\noverall_soundscape: The train wheels produce a steady metallic rhythm beneath a low ventilation hum. Rain ticks against the window while paper rustles softly in her hands.\n\nnon_diegetic_music: Sustained cello notes at a slow tempo with widely spaced piano tones, gradually decreasing in volume.',
  },
  {
    title: "FL2VA (first + last frame)",
    note: "Two images - the beginning and the end, we describe the path between them.",
    text: 'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 8.00-second mark of the target video.\n\nintegrated_multimodal_description: [Shot 1] Live-action, cinematic, a rain-soaked cyclist begins in the position and framing established by Picture 1, holding a closed black umbrella beside a silver bicycle. The camera pulls out with small amplitude at slow speed as she releases the bicycle handle, raises the umbrella, and opens it with a sharp snap. Water droplets fly in a radial burst as the canopy expands. By the final frame, she stands upright, fully covered, the bicycle parked at her side, matching Picture 2.\n\noverall_soundscape: Rain falls steadily on the pavement, followed by the metallic click of the umbrella runner and the soft snap of the canopy opening. Water drips from the bicycle frame as distant traffic passes.\n\nnon_diegetic_music: N/A',
  },
  {
    title: "Ref2VA (references + voice)",
    note: "Multimodal input: character, location, voice.",
    text: 'subject_definitions:\n<Subject 1> is the coffee-shop environment in <Picture 1>, featuring an exposed brick wall, an orange tufted sofa with patterned pillows, a neon sign, and a wooden coffee table.\n<Subject 2> is the fluffy white Samoyed in <Picture 2>, with thick white fur, pointed ears, and a curved tail.\n<Subject 3> is the young blonde woman in <Video 1>, with long blonde hair and a light-pink button-down shirt.\n<Audio 1> is the voice-timbre reference for <Subject 3> (S1), containing a spoken English vocal layer.\n\nsummary:\n[reference generation + audio reference] The target video shows <Subject 3> eating a cookie in <Subject 1>. <Subject 2> lunges toward the cookie. The exchange uses <Audio 1> as the voice-timbre reference for <Subject 3>.\n\nretention_analysis:\n<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - the exposed brick wall, orange sofa, and wooden table are retained.\n<Subject 3> (appears in [Shot 1], [Shot 2]): fully_preserved - her long blonde hair and light-pink shirt are retained.\n<Audio 1>: reference - its vocal timbre guides the dialogue delivery of <Subject 3> without copying the original signal.\n\ndetailed_description:\n[Shot 1] A medium shot establishes <Subject 1>, the coffee shop. <Subject 3> (S1), the young woman with long blonde hair, sits on the sofa holding a cookie. <Subject 2> lunges toward her hand. <Subject 3> (S1) jerks her hand back and, using the clear youthful voice timbre referenced from <Audio 1>, exclaims with light annoyance: <d>[English] Hey! Watch your dog!</d>\n\noverall_soundscape:\nSoft indoor coffee-shop room tone continues throughout the scene.\n\nnon_diegetic_music:\nN/A',
  },
]

export const CAMERA_WORDS = [
  'slow push-in on the face', 'smooth pan left to right', 'static shot, close-up',
  'camera pulls back', 'camera follows the character', 'subtle handheld shake',
  'low-angle shot', 'backlight / silhouette', 'warm side lighting', 'neon lighting',
  'soft morning light', 'atmospheric haze', 'shallow depth of field, blurred background',
  'Zoom In with small amplitude at slow speed',
  'Pan Left with large amplitude at fast speed',
  'Truck Right with small amplitude at moderate speed',
  'Tilt Up with large amplitude at slow speed',
  'Arc Shot around the subject',
  'Tracking Shot following the character',
  'Shake Slightly for a handheld feel',
  'POV — point of view',
  'Roll Clockwise for a disorienting effect',
]
