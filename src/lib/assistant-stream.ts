'use client'

/**
 * Assistant stream engine (правка 31) — lives at MODULE scope, NOT in a
 * component, so an in-flight LLM reply SURVIVES AssistantView unmount.
 *
 * Why this exists: switching app tabs unmounts AssistantView (page.tsx uses
 * AnimatePresence). Previously the SSE read loop was a fire-and-forget
 * closure inside the component (`void runCompletion(...)`): after unmount its
 * state updates no-oped, its only strong references were gone, and the
 * re-mounted view never reattached to the in-flight stream — so the model
 * answered "into the void" and the user had to resend.
 *
 * Now:
 *  • the async fetch/reader loop runs here, at module level, and completes
 *    regardless of component lifecycle;
 *  • on completion the reply is committed to the persisted chats store —
 *    a (re)mounted view renders it because it derives messages from the
 *    store reactively;
 *  • while streaming, any mounted view reattaches by subscribing to the
 *    tiny `useAssistantStream` store below and renders the live tail.
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import { useAssistantChats, type AssistantChatMessage } from './assistant-chats-store'
import { useGenStore } from './gen-store'
import { H3_OFFICIAL_PROMPT_SPEC } from './h3-prompt-spec'

export interface LlmStatusResp {
  running: boolean
  starting: boolean
  gpuMode: 'gpu' | 'cpu' | null
  modelReady: boolean
  /** Активный ID модели LLM (зависит от выбранной квантизации). */
  modelId: string
  /** Ассистент сейчас стримит ответ (для блокировки генерации). */
  streaming: boolean
  /** Ассистент занят (грузится или отвечает). */
  assistantBusy: boolean
  /** Идёт генерация видео — чат заблокирован. */
  blockedByGeneration: boolean
}

/** Pre-cap on the wire; server does precise token-based trimming. */
const HISTORY_LIMIT = 60

/** System prompt: compact OFFICIAL H3 spec + live session context.
 * (правка 53) `videoVisionOn` — видит ли ассистент кадры видео-рефов (настройка
 * «Видение видео ассистентом», выкл по умолчанию). Без этого флага промпт
 * говорил модели «ты ВИДИШЬ кадры», хотя кадры не прикреплялись → выдумка.
 * (правка 150) Ассистент видит ТЕКУЩИЙ РЕЖИМ ГЕНЕРАЦИИ (t2v/flf/ref) из gen-store
 * и строит system-промпт с учётом режима: в t2v/flf запрещает метки <Picture N>,
 * <Video N>, <Subject N> (нода MiniMaxH3ReferenceToVideo не используется),
 * <Audio N> остаётся разрешённым для аудио-референсов. */
function buildSystemMessage(videoVisionOn: boolean, chatMessageCount = 0): string {
  const v = useGenStore.getState().video
  const mode = v.mode // (правка 150) 'ref' | 't2v' | 'flf'
  const refs = v.refs
  // (правка 138) дефолт 124 → 60: минимум 2.5 с (60 кадров при 24 fps)
  const seconds = Math.max(2.5, Math.round((v.videoLength || 60) / 24))

  // (правка 150) В t2v/flf из рефов уходят ТОЛЬКО аудио (картинки/видео не используются нодой).
  // Ассистенту показываем только аудио-рефы, чтобы LLM не вписывала <Picture N>/<Video N>.
  // (правка 166) В НОВОМ чате (0–1 сообщение) НЕ показываем черновик промпта из формы
  // генерации и НЕ используем глобальные рефы/кадры из gen-store — это убирает
  // «перекрёстное поминание» между чатами: модель не видит чужой сессионный
  // контекст, если он не относится к этому чату.
  const isFreshChat = chatMessageCount <= 1
  const effectiveRefs = isFreshChat
    ? []
    : mode === 'ref' ? refs : refs.filter((r) => r.kind === 'audio')

  const images = effectiveRefs.filter((r) => r.kind === 'image')
  const videos = effectiveRefs.filter((r) => r.kind === 'video')
  const audios = effectiveRefs.filter((r) => r.kind === 'audio')

  // ── Explicit "attached references" block, numbered exactly like MiniMax ──
  // (images → <Picture N>, videos → <Video N>, audios → <Audio N>, each 1-based
  //  within its type — this is what MiniMax's ref_images/ref_videos/ref_audios expect)
  let attachedBlock: string

  // (правка 150) Режим-специфичный префикс для system-промпта
  const modeHint = mode === 't2v'
    ? "⚠️ CURRENT GENERATION MODE: “Text” (t2v). Tags <Picture N>, <Video N>, <Subject N> are PROHIBITED - picture and video references are not used. <Audio N> IS ONLY ALLOWED if audio refs are attached below. Format - FORMAT A."
    : mode === 'flf'
      ? "⚠️ CURRENT GENERATION MODE: “Frames” (flf, first/last frame → video). The tags <Picture N>, <Video N>, <Subject N> are PROHIBITED - frames are specified by form fields, not by references. <Audio N> IS ONLY ALLOWED if audio refs are attached below. Format - FORMAT A. Describe the movement/transition between the first and last frames."
      : "⚠️ CURRENT GENERATION MODE: “References” (ref, Ref2VA)."

  // (правка 151) В flf-режиме кадры (startFrame/endFrame) — это НЕ refs, но они
  // прикреплены к LLM как изображения. Поэтому условие «нет референсов» должно
  // учитывать кадры: если есть кадры или аудио → идём в ветку flf, не в «нет».
  // (правка 166) В новом чате кадры из формы не считаем (см. isFreshChat выше).
  const hasFlfFrames = !isFreshChat && mode === 'flf' && (!!v.startFrame?.path || !!v.endFrame?.path)

  if (effectiveRefs.length === 0 && !hasFlfFrames) {
    attachedBlock =
      modeHint + '\n' +
      "NO references attached → this is FORMAT A (text-to-video).\n" +
      "It is PROHIBITED to use any <Picture N>, <Video N>, <Audio N>, <Subject N> tags."
  } else if (mode === 'ref') {
    const lines: string[] = []
    // (правка 137) ЖЁСТКИЙ режим: референсы прикреплены → ТОЛЬКО FORMAT B
    // с метками. Модели регулярно «забывали» про референсы и выдавали
    // text-to-video промпт без единого тега — теперь это явно запрещено.
    lines.push("⚠️ GENERATION MODE: REFERENCES are attached → prompt ONLY in FORMAT B (Ref2VA).")
    lines.push("It is PROHIBITED to issue FORMAT A (text-to-video) or prompts without tags when references are attached.")
    lines.push("The first field of the fence is subject_definitions (NOT integrated_multimodal_description).")
    lines.push("Each ATTACHED IMAGE must be included in the prompt with its <Picture N> label: create <Subject N> in subject_definitions, link to <Picture N> and mention it in the frame description.")
    lines.push("<Video N> — put a mark if the frame uses movement/scene from the video reference; <Audio N> - if the voice/sound is from an audio reference (the character’s remarks are through it).")
    lines.push("PROMPT WITHOUT A SINGLE REFERENCE MARK with attached references = ERROR. Before issuing, check: each label from the list below is present in the prompt (or it is deliberately explained why the reference is not used).")
    lines.push('')
    if (images.length) {
      lines.push("IMAGES - you SEE them and describe them by the fact that on them:")
      images.forEach((r, i) => {
        lines.push(`  <Picture ${i + 1}> = ${r.name}${r.imageIntent ? ` (used as: ${r.imageIntent})` : ''}`)
      })
    }
    if (videos.length) {
      if (videoVisionOn) {
        lines.push("VIDEO - you SEE their FRAME (video is attached in full, in reduced resolution):")
        videos.forEach((r, i) => lines.push(`  <Video ${i + 1}> = ${r.name}${r.includeAudio ? " (there is a sound track - the model does NOT hear it, see the rule on AUDIO)" : ''}`))
        lines.push("  Describe the actual video: the scene, characters, MOVEMENT and camera behavior throughout the video, and not just the first frame. Don't invent details that are not in the frame.")
      } else {
        // (правка 53) видение видео выключено: кадры НЕ прикреплены — модель
        // знает только о НАЛИЧИИ видео. Строго запрещаем описывать/выдумывать.
        lines.push("VIDEO - attached ONLY as tags (frames are NOT attached: video vision by the assistant is turned off, saving context):")
        videos.forEach((r, i) => lines.push(`  <Video ${i + 1}> = ${r.name}${r.includeAudio ? " (there is a sound track - the model does NOT hear it, see the rule on AUDIO)" : ''}`))
        lines.push("  Refer to <Video N> as a tag when the user asks (for example, \"motion from <Video 1>\"). DO NOT describe, guess or invent what is happening inside the video - you DO NOT see it.")
      }
    }
    if (audios.length) {
      lines.push("AUDIO - attached as VOICE/sound references for MiniMax (ref_audios). The model CANNOT listen to them and does NOT know what the cues are:")
      audios.forEach((r, i) => lines.push(`  <Audio ${i + 1}> = ${r.name}${r.audioIntent ? ` (${r.audioIntent})` : ''}`))
      lines.push("  In the prompt, refer to <Audio N> as a voice/sound reference (MiniMax itself uses the file). Take a specific remark ONLY from the text of the user’s request - do not invent what is “heard” in the audio.")
    }
    const forbidden: string[] = []
    if (!videos.length) forbidden.push('<Video N>')
    if (!audios.length) forbidden.push('<Audio N>')
    lines.push('')
    if (forbidden.length) {
      lines.push(`⚠️ RULE: ONLY labels from the list above are ALLOWED in the prompt. Prohibited use ${forbidden.join(', ')} — there are NO such references in this session, don’t invent them.`)
    } else {
      lines.push("⚠️ RULE: in the prompt, use ONLY those labels that are listed above (for example, if there is only <Audio 1>, write <Audio 1>, not <Audio 2>).")
    }
    if (!audios.length) lines.push("Write voices and remarks in <d>...</d> WITHOUT reference to <Audio N> (audio is not attached). Don't describe the voice as \"referenced from <Audio N>\" / \"voice timbre from <Audio N>\" - just indicate the tone/gender/age in words.")
    if (!videos.length) lines.push("Describe the movement and camera in words, not as “from <Video N>” (video not attached).")
    attachedBlock = lines.join('\n')
  } else if (mode === 'flf') {
    // (правка 151) Режим «Кадры»: кадры (startFrame/endFrame) прикреплены как image-рефы —
    // LLM их ВИДИТ и описывает словами. <Picture N> ЗАПРЕЩЁН (кадры не являются ref2va-рефами).
    // Аудио-рефы также уходят (через MiniMaxH3AddGuide) — <Audio N> допустим.
    const lines: string[] = [modeHint, '']

    // (правка 151) Показываем кадры как «видимые изображения» (они прикреплены к LLM)
    const hasStartFrame = !!v.startFrame?.path
    const hasEndFrame = !!v.endFrame?.path
    if (hasStartFrame || hasEndFrame) {
      lines.push("FRAMEWORK (attached as images - you SEE them):")
      if (hasStartFrame) {
        lines.push(`  FIRST FRAME = ${v.startFrame!.name} is the starting point of the video. Describe its contents in words (scene, characters, composition, lighting).`)
      }
      if (hasEndFrame) {
        lines.push(`  LAST FRAME = ${v.endFrame!.name} - this is the final point of the video. Describe its contents in words.`)
      }
      lines.push("  ⚠️ It is PROHIBITED to use the <Picture N> tag for these frames - they are NOT ref2va references.")
      lines.push("  In the prompt, describe the movement/transition BETWEEN the first and last frames: what changes, how the camera moves, what actions take place.")
      lines.push("  If the user says “based on the ref” or “say what’s in the frame” - describe what you SEE in the attached images.")
      lines.push('')
    }

    if (audios.length) {
      lines.push("AUDIO REFERENCES (attached, <Audio N> ALLOWED):")
      audios.forEach((r, i) => lines.push(`  <Audio ${i + 1}> = ${r.name}${r.audioIntent ? ` (${r.audioIntent})` : ''}`))
      lines.push("  Refer to <Audio N> for voice/sound. Take a specific response ONLY from the text of the user's request.")
      lines.push('')
    }

    const forbidden = ['<Picture N>', '<Video N>', '<Subject N>']
    lines.push(`⚠️ IT IS PROHIBITED to use tags ${forbidden.join(', ')} — frames are specified by form fields, not by references. Format - FORMAT A.`)
    if (!audios.length) lines.push("Write voices and remarks in <d>...</d> WITHOUT reference to <Audio N> (audio is not attached).")
    // (правка 166) В новом чате кадры из формы генерации не учитываем — только то, что пользователь опишет словами.
    if (isFreshChat && (hasStartFrame || hasEndFrame)) {
      lines.push('')
      lines.push("ℹ️ (edit 166) There are NO frames from the generation form in this NEW chat. If the user has not described the scene in words, do not substitute the old session, but ask what needs to be shown at the beginning/end.")
    }
    attachedBlock = lines.join('\n')
  } else {
    // (правка 150) t2v: только аудио-рефы, формат A (кадров нет)
    const lines: string[] = [modeHint, '']
    if (audios.length) {
      lines.push("AUDIO REFERENCES (attached, <Audio N> ALLOWED):")
      audios.forEach((r, i) => lines.push(`  <Audio ${i + 1}> = ${r.name}${r.audioIntent ? ` (${r.audioIntent})` : ''}`))
      lines.push("  Refer to <Audio N> for voice/sound. Take a specific response ONLY from the text of the user's request.")
    }
    const forbidden = ['<Picture N>', '<Video N>', '<Subject N>']
    lines.push('')
    lines.push(`⚠️ IT IS PROHIBITED to use tags ${forbidden.join(', ')} — in this mode, image and video references are NOT USED. If the user asks for a reference, tell him that he needs to switch to the “References” mode. Format - FORMAT A.`)
    if (!audios.length) lines.push("Write voices and remarks in <d>...</d> WITHOUT reference to <Audio N> (audio is not attached).")
    // (правка 166) В новом чате аудио-рефы из формы генерации не учитываем — только то, что пользователь опишет словами.
    if (isFreshChat && audios.length) {
      lines.push('')
      lines.push("ℹ️ (edit 166) Audio refs from the generation form in this NEW chat are NOT attached. If the user did not mention audio, do not substitute the old session, but ask what kind of voice/sound is needed.")
    }
    attachedBlock = lines.join('\n')
  }

  // ── Visual anchor: lock characters/objects by what the model actually sees ──
  const anchorBlock = images.length
    ? "\n=== VISUAL ANCHOR - record what you SEE on the refs ===\n" +
      "You SEE the images attached. For EVERY character/object that should be in the frame:\n" +
      "1) Describe specifically based on the fact of the image: facial shape and features, eye color/shape, hair color/style/length, skin color, approximate age, physique, clothing (color, style, prints, details), characteristic features (scars, tattoos, glasses, hairstyle, jewelry).\n" +
      "2) Create a <Subject N> for it, link it to its <Picture N>, and in retention_analysis mark fully_preserved listing these details.\n" +
      "3) In detailed_description, refer to <Subject N> and repeat key details so that MiniMax reproduces exactly this character (face, hair, clothes), and does not invent another one.\n" +
      "If there is no character/person on the ref (only a location or style), an anchor is not needed, describe it to the point."
    : ''

  // ── Audio anchor: reference voice/tone for MiniMax (правки 36: модель НЕ слышит) ──
  // Аудио уходит в MiniMax как ref_audios (голос/звучание); LLM лишь расставляет
  // <Audio N> в тексте промпта. Модель НЕ МОЖЕТ прослушать аудио, поэтому
  // запрещаем «цитировать» его содержимое (это было источником выдумывания).
  const hasAudioRefs = audios.length > 0 || videos.some((r) => r.includeAudio)
  const audioAnchorBlock = hasAudioRefs
    ? "\n=== AUDIO-ANCHOR - voice/sound references (for MiniMax) ===\n" +
      "Audio references (and video audio tracks) are attached for MiniMax (ref_audios) - they set the VOICE/SOUND in the generation. BUT the model CANNOT listen to them and does NOT know their contents (what words/replicas are there). Therefore:\n" +
      "1) In a structured prompt, refer to <Audio N> (or audio track <Video N>) as a voice/sound reference - MiniMax uses the file itself.\n" +
      "2) Take a specific REPLICA/text ONLY from the text of the user’s request. If the user has not given the text of the line, DO NOT invent it: indicate what the character is saying and attach <Audio N>, but do not invent words.\n" +
      "3) Indicate the nature of the voice (tone, gender, age, emotion) IN WORDS only if the user described it or gave context; Otherwise, don't make it up.\n" +
      "4) STRICTLY: NEVER “quote” or describe lines/sounds “from the audio” - you didn’t hear them; any such wording = fiction."
    : ''

  // ── Anti-hallucination + «текущий набор рефов точен» (правки 36) ──
  // Фиксируем, что ТЕКУЩИЙ список рефов — единственный источник правды, и
  // запрещаем перетаскивать описания удалённых рефов из истории чата (баг #1)
  // и выдумывать несуществующие рефы/детали (баг #3).
  const truthRuleBlock =
    "\n=== STRICT RULE: HONESTY AND ACCURACY OF REFERENCES (edits 36) ===\n" +
    "1) THE CURRENT set of references is EXACTLY the one listed in the “ATTACHED REFERENCES” block above. No more, no less. Describe ONLY these references and ONLY what is real in them.\n" +
    "2) If previous remarks of THIS CHAT mentioned references that are NOT in the current list above - they NO LONGER EXIST: completely ignore all previous descriptions of them, do not transfer their details and do not mention them in a new prompt. The current list is the only source of truth about what referrals are available NOW.\n" +
    "3) NEVER make up the contents of a reference that is not in the current list, or make up a detail that you don’t see in the image/video. If you don’t see something or are not sure, directly say “I don’t see / not sure,” and don’t speculate.\n" +
    "4) AUDIO: you DO NOT hear its content. Do not “quote” or describe lines/sounds “from the audio” - this is fictitious. Refer as <Audio N> only; take cues from the user's text."

  // (правка 53) подсказка зависит от видения видео: при выключенном виде
  // модель не должна «смотреть» видео, а только ссылаться на тег <Video N>.
  const rescanHint = videoVisionOn
    ? 'look at images, watch videos'
    : 'look at images; videos are TAGS ONLY — you do NOT see their frames, so never describe, guess or invent their content'

  // (правка 108) Вложения из чата — изолированы от ген-рефов: существуют ТОЛЬКО
  // в чате, нужны ТОЛЬКО для описания/анализа. Модель не должна использовать их
  // как <Picture N>/<Video N>/<Audio N> — таких ген-рефов в сессии НЕТ.
  const chatAttachRule =
    "CHAT ATTACHMENTS: exist ONLY in chat and are needed ONLY to describe/analyze the content. "
    + "They are NOT included in the generation references - NEVER refer to them as <Picture N>, <Video N> or <Audio N> in the prompt: there are NO such gene references in this session. "
    + "If such an attachment should be included in the video, tell the user to add it to the references on the “Generate” tab. Describe the contents of the attachment in words."

  // (правка 166) Явное правило независимости чатов: модель НЕ видит сообщения других
  // чатов, и не должна переносить тему/контекст из прошлой сессии в новый чат.
  // Черновик промпта из формы генерации (Current prompt draft) и рефы gen-store —
  // это глобальное состояние вкладки «Генерация», а НЕ контекст конкретного чата.
  // В новом чате они вообще не подставляются (см. isFreshChat выше).
  const chatIndependenceRule =
    "\n=== INDEPENDENCE OF CHATS (edit 166) ===\n" +
    "1) This chat is an INDEPENDENT dialogue. Messages from other chats are NOT AVAILABLE to you - you don’t see them and don’t remember them.\n" +
    "2) If the user started a new topic in this chat, reply ONLY to it. Do not carry over theme, characters, scenes, prompts, or settings from any other session.\n" +
    "3) The fields of the generation form (Current prompt draft, references, frames, mode) are the state of the “Generate” tab, and NOT the context of this chat. Use them ONLY if the user directly references them (for example, “generate according to the current prompt”). If the user has asked a new question/topic, do not automatically enter the old form.\n" +
    "4) When switching mode or chat, the old topic/old refs/old draft WILL NOT BE CONSIDERED. The current regime and the list of references above are the only source of truth."

  // (правка 166) В новом чате черновик промпта из формы генерации НЕ показываем,
  // чтобы модель не «подцепляла» тему из прошлого чата. В остальных чатах показываем,
  // но с явной маркировкой: это НЕ часть этого чата, а состояние вкладки «Генерация».
  const promptDraftLine = isFreshChat
    ? "Current prompt draft: (hidden - new chat, do not drag up a topic from previous sessions; use ONLY if the user directly links to it)"
    : `Current prompt draft (state of the "Generation" tab, NOT part of this chat - use ONLY if the user directly links to it): ${v.prompt.trim() || "(empty)"}`

  return `${H3_OFFICIAL_PROMPT_SPEC}

=== SESSION CONTEXT ===
Clip duration: ~${seconds} s (shot timecodes must fit inside it).

=== ATTACHED REFERENCES (available references) ===
${attachedBlock}
${anchorBlock}
${audioAnchorBlock}
${truthRuleBlock}
${promptDraftLine}
${chatIndependenceRule}

Chat behaviour:
- Small talk / questions → brief English reply. Do NOT output the structured prompt.
- Format selection is NOT optional: references attached → FORMAT B ONLY, with
  the reference tags placed in the prompt (see “GENERATION MODE” above);
  no references → FORMAT A, tags forbidden.
- Before EVERY prompt: re-scan the CURRENT references above (${rescanHint}).
  Ignore references from earlier turns NOT in the current list.
  Audio: CANNOT hear it — only reference as <Audio N>.
- ${chatAttachRule}
- DURATION: use ~${seconds} s. Shot timecodes must fit within it. Last cut ≤ duration − 2 s.
  Do NOT ask about duration.
- Prompt → ONLY in \`\`\`text fence (first line = first field name, last line = closing fence).
  A short English note BEFORE the fence is OK. Never output prompt as plain text.`
}

/** Ensure roles alternate: merge consecutive same-role, and ensure first is user.
 *  Merge, NOT replace: два подряд user-сообщения появляются, когда прошлый
 *  запрос упал без ответа (409/503/сеть) — при замене терялся первый вопрос
 *  вместе с его контекстом; модель видела только последний. */
function sanitizeRoles(msgs: AssistantChatMessage[]): AssistantChatMessage[] {
  const out: AssistantChatMessage[] = []
  for (const m of msgs) {
    if (out.length && out[out.length - 1].role === m.role) {
      const prev = out[out.length - 1]
      const merged = typeof prev.content === 'string' && typeof m.content === 'string'
        ? `${prev.content}\n\n${m.content}`
        : m.content
      out[out.length - 1] = { ...prev, content: merged }
    } else {
      out.push(m)
    }
  }
  // LLM requires the first non-system message to be 'user'
  while (out.length && out[0].role !== 'user') out.shift()
  return out
}

/**
 * Build the multimodal reference list for the LLM: images, videos AND audios.
 * - images  → sharp-resized 512px JPEG  ({"type":"image"})
 * - videos  → whole downscaled video + its audio track when includeAudio
 * - audios  → 16 kHz mono WAV           ({"type":"audio"})
 * The server prepares the media (see src/lib/llm-media.ts).
 */
function getReferences(): Array<{
  path: string
  trigger: string
  intent?: string
  kind: 'image' | 'video' | 'audio'
  includeAudio?: boolean
}> {
  const v = useGenStore.getState().video
  // (правка 150) В t2v из рефов уходят ТОЛЬКО аудио (картинки/видео не используются нодой).
  // (правка 151) В flf: кадры (startFrame/endFrame) прикрепляются как image-рефы,
  // чтобы LLM их ВИДЕЛА и описала словами (запрет <Picture N> — см. system-промпт).
  // Аудио-рефы также уходят в flf (через MiniMaxH3AddGuide).
  const refs = v.mode === 'ref' ? v.refs : v.refs.filter((r) => r.kind === 'audio')
  const out: Array<{
    path: string
    trigger: string
    intent?: string
    kind: 'image' | 'video' | 'audio'
    includeAudio?: boolean
  }> = []
  const counters: Record<'image' | 'video' | 'audio', number> = { image: 0, video: 0, audio: 0 }

  // (правка 151) В flf-режиме кадры идут ПЕРВЫМИ (они главные), затем аудио.
  // LLM должна их увидеть и описать словами; <Picture N> запрещён в system-промпте.
  if (v.mode === 'flf') {
    if (v.startFrame?.path) {
      out.push({ path: v.startFrame.path, trigger: "First frame", intent: 'first_frame', kind: 'image' })
      counters.image++
    }
    if (v.endFrame?.path) {
      out.push({ path: v.endFrame.path, trigger: "Last frame", intent: 'last_frame', kind: 'image' })
      counters.image++
    }
  }

  for (const r of refs) {
    if (r.kind === 'image') {
      out.push({ path: r.path, trigger: `Picture ${++counters.image}`, intent: r.imageIntent || 'identity', kind: 'image' })
    } else if (r.kind === 'video') {
      out.push({ path: r.path, trigger: `Video ${++counters.video}`, kind: 'video', includeAudio: r.includeAudio })
    } else if (r.kind === 'audio') {
      out.push({ path: r.path, trigger: `Audio ${++counters.audio}`, intent: r.audioIntent || 'voice', kind: 'audio' })
    }
  }
  return out
}

/* ── Live stream state (subscribed by mounted views) ────────────────── */

interface StreamState {
  /** Chat id of the in-flight reply, or null when idle. */
  chatId: string | null
  /** Accumulated assistant text of the in-flight reply. */
  text: string
}

export const useAssistantStream = create<StreamState>(() => ({
  chatId: null,
  text: '',
}))

let activeAbort: AbortController | null = null
let running = false

/** True while a reply is in flight (for guards from non-reactive code). */
export function isStreamActive(): boolean {
  return useAssistantStream.getState().chatId !== null
}

/**
 * Send history[] to the LLM, stream the reply, commit to the store.
 * Module-level: keeps running after AssistantView unmounts.
 * No-op while another reply is already in flight (one at a time).
 */
/** (правка 86; обновлено правкой 108) Вложение к сообщению чата:
 *  изображение или видео. (правка 108) Хранится в изолированном каталоге
 *  data/chat-attachments/ — файл существует ТОЛЬКО в чате и используется
 *  ТОЛЬКО для LLM-анализа/описания. НЕ смешивается с референсами генерации
 *  (<Picture N>/<Video N>), не лежит в ComfyUI/input/, не попадает в галерею,
 *  upscale и «чистку input». */
export interface ChatAttachment {
  /** Имя файла в хранилище вложений (data/chat-attachments/, или legacy ComfyUI/input/). */
  path: string
  /** Изначальное имя файла (для отображения). */
  name: string
  /** Тип медиа. */
  kind: 'image' | 'video'
  /** (правка 108) Legacy-вложение (правки 86–87) лежит в ComfyUI/input/ —
   *  сервер читает его из input/, но оно ТОЖЕ не является ген-рефом. */
  legacyComfy?: boolean
}

export function runAssistantCompletion(
  chatId: string,
  history: AssistantChatMessage[],
  attachments?: ChatAttachment[],
): void {
  if (running) return
  running = true
  const ac = new AbortController()
  activeAbort = ac
  useAssistantStream.setState({ chatId, text: '' })

  void (async () => {
    let final = ''
    // false = сервер ответил ошибкой на сам POST (409/503/...): показываем
    // ЭТУ ошибку; true = стрим начался и оборвался посередине
    let streamStarted = false
    // (клиентский idle-watchdog) объявлены ДО try: catch читает их даже если
    // throw случился до открытия стрима.
    let idleTimedOut = false
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    try {
      const refs = getReferences()
      // (правка 108) Вложения чата — ОТДЕЛЬНО от рефов генерации: они существуют
      // ТОЛЬКО в чате и нужны ТОЛЬКО для LLM-описания/анализа. В references
      // (<Picture N>/<Video N>) они НЕ попадают — сервер получает их отдельным
      // полем chatAttachments, прикрепляет как «Chat N» и запрещает тегирование
      // в промпте (раньше они пушались в refs → LLM вписывала <Picture N> →
      // MiniMax подтягивал файл из input/ в генерацию).
      const chatAttachments = attachments?.length
        ? attachments.map((a) => ({
            path: a.path,
            name: a.name,
            kind: a.kind,
            legacyComfy: a.legacyComfy === true,
          }))
        : undefined
      // (правка 53) Свежее значение «видение видео» из конфига — системный
      // промпт должен совпадать с тем, что сервер реально прикрепит.
      // Лёгкий локальный GET; при ошибке остаёмся по умолчанию (выкл).
      let videoVisionOn = false
      try {
        const cfgRes = await fetch('/api/config')
        if (cfgRes.ok) {
          const cfg = await cfgRes.json()
          videoVisionOn = cfg.llm_video_vision === true
        }
      } catch { /* ignore — default OFF */ }
      const res = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            // (правка 166) Передаём длину истории, чтобы в новом чате (0–1 сообщ.)
            // НЕ подставлялись черновик промпта и рефы gen-store — они глобальны
            // и «подтекали» в новый чат, создавая ощущение, что ассистент помнит
            // другие чаты. В старых чатах показываем, но с явной маркировкой.
            { role: 'system', content: buildSystemMessage(videoVisionOn, history.length) },
            // Replay the (capped) chat history so the model "remembers"
            ...sanitizeRoles(history.slice(-HISTORY_LIMIT)),
          ],
          // Send image references so the server can inject them as vision
          ...(refs.length > 0 ? { references: refs } : {}),
          // (правка 108) Вложения чата — отдельное поле (НЕ references):
          // сервер читает их из data/chat-attachments/ (или legacy input/)
          // и прикрепляет к LLM как «Chat N» с запретом тегов <Picture N>.
          ...(chatAttachments ? { chatAttachments } : {}),
        }),
        signal: ac.signal,
      })
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '')
        let msg = `HTTP ${res.status}`
        try {
          msg = (JSON.parse(errText) as { error?: string }).error || msg
        } catch {
          /* keep */
        }
        throw new Error(msg)
      }
      const reader = res.body.getReader()
      streamStarted = true
      const decoder = new TextDecoder()
      let buf = ''
      // (клиентский idle-watchdog) Half-open соединение (сон/гибернация ПК,
      // сдохший прокси) не разрешает reader.read() никогда — стрим висел
      // вечно, чат блокировался до перезагрузки страницы. Зеркалим серверный
      // сторож: 5 мин без единого чанка = принудительный abort с тостом.
      idleTimer = setTimeout(() => {
        idleTimedOut = true
        ac.abort()
      }, 5 * 60_000)
      const armIdle = () => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          idleTimedOut = true
          ac.abort()
        }, 5 * 60_000)
      }
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          armIdle()
          buf += decoder.decode(value, { stream: true })
        const events = buf.split('\n\n')
        buf = events.pop() ?? ''
        for (const ev of events) {
          const line = ev.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          // JSON.parse — в ОТДЕЛЬНОМ try: раньше фильтр «не JSON в сообщении»
          // глотал и payload.error, если текст ошибки сервера упоминал JSON
          // (например, исключения llama-cpp) — стрим «завершался» как успешный
          // с обрезанным ответом.
          let payload: { delta?: string; error?: string } | null = null
          try {
            payload = JSON.parse(line.slice(6))
          } catch {
            continue // битый/незавершённый чанк — ждём следующий
          }
          if (!payload) continue
          if (payload.error) throw new Error(payload.error)
          if (payload.delta) {
            final += payload.delta
            const s = useAssistantStream.getState()
            if (s.chatId === chatId) useAssistantStream.setState({ text: final })
          }
        }
        }
      } finally {
        if (idleTimer) clearTimeout(idleTimer)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError' || idleTimedOut) {
        // Ошибка ДО старта стрима = структурированный ответ сервера
        // (409 «идёт генерация», 503 «не освободил VRAM», ...) — показываем
        // её как есть, БЕЗ маскирующих «дружелюбных» подмен.
        // Обрыв уже начавшегося ответа — отдельный случай.
        let msg = err instanceof Error ? err.message : String(err)
        if (idleTimedOut) {
          msg = "The assistant's response is frozen (no data for 5 minutes) - the connection is interrupted. Send the message again."
        } else if (streamStarted) {
          try {
            const s = (await fetch('/api/llm/status').then((r) => r.json())) as LlmStatusResp
            if (s && !s.running) {
              msg = "The connection with the assistant was lost (the server stopped). Send the message again and the assistant will rise again."
            }
          } catch {
            /* status unavailable — показываем исходную ошибку */
          }
        }
        toast.error("Assistant", { description: msg })
        if (idleTimedOut) void fetch('/api/llm/abort', { method: 'POST' }).catch(() => {})
      }
    } finally {
      // Commit the finished assistant reply to the persisted chat. This runs
      // even when the view is UNMOUNTED — exactly what makes the answer
      // survive tab switches.
      if (final.trim()) {
        useAssistantChats.getState().appendMessage(chatId, { role: 'assistant', content: final })
      }
      running = false
      activeAbort = null
      // Reset the live store only if WE are still the active stream (a new
      // stream could have started in the meantime after an abort).
      if (useAssistantStream.getState().chatId === chatId) {
        useAssistantStream.setState({ chatId: null, text: '' })
      }
    }
  })()
}

/** Stop the in-flight reply (user pressed «Стоп»). */
export function stopAssistantStream(): void {
  activeAbort?.abort()
  void fetch('/api/llm/abort', { method: 'POST' }).catch(() => {})
}

/**
 * Stop the in-flight reply ONLY if it belongs to `chatId` (правка 32).
 *
 * Used when deleting the chat that owns the stream: the engine's `finally`
 * runs its `appendMessage` AFTER the chat is already gone, so the partial
 * reply is dropped (the store map finds no such chat) — exactly what we want
 * — and the model is freed via the abort POST. No-op when the stream is
 * owned by another chat or when idle.
 */
export function stopStreamForChat(chatId: string): void {
  if (useAssistantStream.getState().chatId !== chatId) return
  stopAssistantStream()
}
