'use client'

/**
 * PromptGuide — sub-tab of the Learn section.
 * Based on the official MiniMax H3 prompt guide (v2).
 *
 * Sections:
 *   1. Technical specs & limits
 *   2. Mode selection (T2VA/I2VA/FL2VA/L2VA/Ref2VA)
 *   3. Prompt formula (3 blocks)
 *   4. Final structure (alignment + 3 fields)
 *   5. Writing the 3 core fields
 *   6. Camera movement (types, amplitude, speed)
 *   7. Speaking characters & dialogue
 *   8. On-screen text
 *   9. Soundscape & music
 *   10. Full examples (4 modes)
 *   11. Common mistakes (table)
 *   12. Ref2VA deep dive (6 sections, labels, rules)
 *   13. Checklist
 *   14. Built-in LLM assistant (Bonsai 2 27B по умолчанию / Gemma 4 12B / Qwen3.5 9B)
 *   15. History / favorites / examples
 *   16. Hover previews
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpenIcon,
  CopyIcon,
  CheckIcon,
  SparklesIcon,
  BotIcon,
  HistoryIcon,
  MousePointerClickIcon,
  CameraIcon,
  AlertTriangleIcon,
  ListOrderedIcon,
  TagIcon,
  MonitorPlayIcon,
  MessageSquareQuoteIcon,
  TypeIcon,
  MusicIcon,
  ClipboardCheckIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

/* ──────────────────── copy helper ──────────────────── */

async function copyText(text: string, okMsg: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(okMsg)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    toast.success(okMsg)
  }
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={async () => {
        await copyText(text, "Copied to clipboard")
        setDone(true)
        setTimeout(() => setDone(false), 2000)
      }}
    >
      {done ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
      {label}
    </Button>
  )
}

/* ──────────────────── building blocks ──────────────────── */

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center shrink-0 text-cyan-400">
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/** Renders a prompt string with highlighted tags — the SAME palette the
 *  editor, chat and hover previews use:
 *    <Picture N> purple · <Video N> cyan · <Audio N> emerald
 *    <Subject N> rose · <Scene N>/<Location N> sky · <d>…</d> amber.
 */
function PromptSample({ text, note }: { text: string; note?: string }) {
  const parts = text.split(/(<(?:Picture|Video|Audio|Subject) \d+>|<Scene \d+>|<Location \d+>|<d>[\s\S]*?<\/d>)/g)
  return (
    <div className="rounded-xl border border-border bg-[var(--surface-0)]/70 overflow-hidden">
      <div className="p-3.5 text-[13px] text-foreground/90 leading-relaxed">
        {parts.map((p, i) => {
          if (/^<(?:Picture|Video|Audio|Subject) \d+>$/.test(p)) {
            const isVideo = p.startsWith('<Video')
            const isAudio = p.startsWith('<Audio')
            const isSubject = p.startsWith('<Subject')
            const cls = isVideo
              ? 'bg-cyan-500/15 text-cyan-300'
              : isAudio
                ? 'bg-emerald-500/15 text-emerald-300'
                : isSubject
                  ? 'bg-pink-500/15 text-pink-300'
                  : 'bg-purple-500/15 text-purple-300'
            return (
              <span key={i} className={cn('px-1.5 py-0.5 rounded font-mono text-[11px] font-medium', cls)}>
                {p}
              </span>
            )
          }
          if (/^<(?:Scene|Location) \d+>$/.test(p)) {
            return (
              <span key={i} className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono text-[11px] font-medium">
                {p}
              </span>
            )
          }
          if (/^<d>[\s\S]*<\/d>$/.test(p)) {
            return (
              <span key={i} className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[11px]">
                {p}
              </span>
            )
          }
          return <span key={i}>{p}</span>
        })}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-[var(--surface-2)]/40 px-3.5 py-2">
        <p className="text-[11px] text-muted-foreground min-w-0">{note}</p>
        <CopyButton text={text} label="" />
      </div>
    </div>
  )
}

/* ──────────────────── examples ──────────────────── */

/** Ready-made example prompts — ENGLISH texts (the model follows English
 *  noticeably better); titles/notes are in English. Shared with the Generate
 *  tab "Примеры" menu. */
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

const DONT_LIST = [
  "“First show the street, then cut to a close-up” - the model does not do editing or gluing: it is one continuous take.",
  "List reference tags separately at the end of the prompt - the tag should appear where the reference is involved in the scene.",
  "Long monologues in <d>…</d> - the voice acting is designed for short remarks (up to ~10 words), long ones are distorted.",
  "“Make it beautiful like in a movie...” - name specific things: light, angle, camera movement, sound.",
  "Contradict the references (different clothes/hairstyle/place) - the model is guided by the picture/video.",
  "Without references, ask for a “familiar character” - describe the appearance in words, the model does not know anyone without a description.",
  "Too much action in 30 seconds - one continuous movement, not a script of 5 scenes.",
  "Mix first/last-frame roles with reference media roles - the API requires that families of roles do not overlap.",
  "Give audio as the only media reference for Ref2VA - be sure to include an image or video.",
]

/** Camera/light vocabulary — ENGLISH phrases inserted verbatim into the
 *  prompt (the model follows English noticeably better). Shared with the
 *  fullscreen prompt editor panel. */
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

/* ──────────────────── component ──────────────────── */

export function PromptGuide() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-8 pb-4"
    >
      {/* ── 1. Technical specs ── */}
      <Section
        icon={<MonitorPlayIcon className="w-4 h-4" />}
        title={"Specifications"}
        subtitle={"Limits and requirements of MiniMax H3"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-3">
              <p className="text-xs font-semibold text-foreground mb-2">{"Exit"}</p>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                <li>{"• Resolution: "}<span className="text-foreground/80 font-mono">480p / 720p / 1080p</span></li>
                <li>{"• Duration: "}<span className="text-foreground/80 font-mono">{"~2.5–30 sec"}</span> {" (alignment 17n+5 frames)"}</li>
                <li>{"• Aspect ratio: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9 + free resolution"}</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-3">
              <p className="text-xs font-semibold text-foreground mb-2">{"Login (references)"}</p>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                <li>{"• Images: up to "}<span className="text-foreground/80 font-mono">9</span></li>
                <li>{"• Video: before "}<span className="text-foreground/80 font-mono">3</span></li>
                <li>{"• Audio: up to "}<span className="text-foreground/80 font-mono">3</span></li>
                <li>{"• Mixed input: maximum "}<span className="text-foreground/80 font-mono">{"15 files"}</span> {" in total"}</li>
                <li>{"• Sum of video+audio duration: ≤ "}<span className="text-foreground/80 font-mono">{"15 sec"}</span></li>
              </ul>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {"\n            💡 All generations are running "}<span className="text-foreground/80">{"locally on your computer"}</span> {" via ComfyUI - no internet needed.\n          "}</p>
        </div>
      </Section>

      {/* ── 2. Mode selection ── */}
      <Section
        icon={<MonitorPlayIcon className="w-4 h-4" />}
        title={"Selecting the generation mode"}
        subtitle={"Determine what input data you have - don't select audio mode"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-[var(--surface-1)]/60">
                <th className="text-left px-3 py-2 font-semibold text-foreground">{"Mode"}</th>
                <th className="text-left px-3 py-2 font-semibold text-foreground">{"Login"}</th>
                <th className="text-left px-3 py-2 font-semibold text-foreground">{"Prompt task"}</th>
                <th className="text-left px-3 py-2 font-semibold text-foreground">{"Suitable for"}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['T2VA', "Text only", "Build a complete audiovisual timeline from scratch", "New idea from text"],
                ['I2VA', "One initial image", "Prompt body + instructions for the first frame + forward development", "Animation of the finished composition"],
                ['FL2VA', "First and last image", "Align both images and describe the path between them", "Control of the beginning and end of the transition"],
                ['L2VA', "One final image", "Construct a plausible previous sequence that ends on a given frame", "Revel or transformation “from the end”"],
                ['Ref2VA', "References (images/video/audio)", "Assign a role to each asset using the full reference format", "Control identity, style, motion, camera or sound across multiple sources"],
              ].map(([mode, input, task, use]) => (
                <tr key={mode} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 font-mono text-foreground">{mode}</td>
                  <td className="px-3 py-2 text-muted-foreground">{input}</td>
                  <td className="px-3 py-2 text-muted-foreground">{task}</td>
                  <td className="px-3 py-2 text-muted-foreground">{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── 3. Formula ── */}
      <Section
        icon={<SparklesIcon className="w-4 h-4" />}
        title={"Prompt formula"}
        subtitle={"Three blocks in strict order (official MiniMax manual)"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {[
              ["Notes on references", "what each file does (only for I2VA/FL2VA/L2VA/Ref2VA)"],
              ["Main idea", "subject, place, event, style"],
              ["Scene descriptions by frame", "movement in time, with timecodes"],
            ].map(([k, v], i) => (
              <div key={k} className="flex items-center gap-2">
                <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1.5">
                  <p className="text-[11px] font-semibold text-cyan-300">{k}</p>
                  <p className="text-[9px] text-muted-foreground">{v}</p>
                </div>
                {i < 2 && <span className="text-muted-foreground/50 text-xs">→</span>}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
            {"\n            The first block is skipped if no files are loaded (T2VA).\n          "}</p>
        </div>
      </Section>

      {/* ── 4. Final structure ── */}
      <Section
        icon={<ListOrderedIcon className="w-4 h-4" />}
        title={"Structure of the final prompt"}
        subtitle={"Two parts: alignment instruction + three main fields"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"Part 1 - Instructions (first line)"}</p>
            <ul className="space-y-1 text-[11px] text-muted-foreground leading-relaxed">
              <li>• <span className="text-foreground/80 font-mono">T2VA</span>{": no instructions, starts with three fields at once."}</li>
              <li>• <span className="text-foreground/80 font-mono">I2VA</span>: <span className="font-mono text-[10px]">For the target video, at 0.00 seconds into the target video, &lt;Picture 1&gt; (from [Shot 1]) is fully referenced.</span></li>
              <li>• <span className="text-foreground/80 font-mono">FL2VA</span>: <span className="font-mono text-[10px]">How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark...</span></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"Part 2 - Three Basic Fields"}</p>
            <div className="space-y-1.5">
              {[
                ['integrated_multimodal_description', "The main body of the prompt: visual, actions, shots, talking, dialogue, singing, synchronized sound along the timeline."],
                ['overall_soundscape', "Summary of atmospheric sound, physical action sounds, and non-verbal human sounds for the entire video."],
                ['non_diegetic_music', "Background music that only the audience can hear (the characters can't hear it)."],
              ].map(([field, desc]) => (
                <div key={field} className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-2.5">
                  <p className="font-mono text-[11px] text-foreground/90">{field}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── 5. Writing the 3 fields ── */}
      <Section
        icon={<BookOpenIcon className="w-4 h-4" />}
        title={"How to write three main fields"}
        subtitle={"Details for each field"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">5.1 integrated_multimodal_description</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {"\n              Develop the description along the timeline. Each element must correspond to something visible or audible: style, opening composition, appearance and position of the subject, scene and key props, actions and reactions, frame changes, language of speech, synchronized sound effect.\n            "}</p>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              {"\n              At the beginning "}<span className="font-mono text-[10px]">[Shot 1]</span> {" indicate the general style and initial composition. Common styles: "}<span className="text-foreground/80">Cinematic, live-action, 2D-animated, 3D CG, claymation, watercolor, vintage film</span>.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"5.2 Shot structure and sections"}</p>
            <ul className="space-y-1 text-[11px] text-muted-foreground leading-relaxed">
              <li>• <span className="text-foreground/80">{"Don't put timecode on the first frame."}</span></li>
              <li>{"• For subsequent frames, use numbering "}<span className="font-mono text-[10px]">[Shot 2]</span>, <span className="font-mono text-[10px]">[Shot 3]</span> {" etc., starting each with "}<span className="text-foreground/80">{"strictly increasing"}</span> {" cutting time within the video duration."}</li>
              <li>{"• For regular cuts use: "}<span className="font-mono text-[10px]">the camera cuts to</span>, <span className="font-mono text-[10px]">the shot cuts to</span>, <span className="font-mono text-[10px]">the shot transitions to</span>, <span className="font-mono text-[10px]">the shot changes to</span>, <span className="font-mono text-[10px]">the shot switches to</span>.</li>
              <li>{"• Cross-dissolve, fade and wipe are allowed only if explicitly requested by the user."}</li>
              <li>{"• The slice must introduce new information about the subject, space, state, point of view or time."}</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"5.3 Keyframes (I2VA / FL2VA / L2VA)"}</p>
            <ul className="space-y-1 text-[11px] text-muted-foreground leading-relaxed">
              <li>• <span className="text-foreground/80 font-mono">I2VA</span>{": describe the first image as a starting point "}<span className="font-mono text-[10px]">[Shot 1]</span>{", then tell how the scene moves forward. Pattern: "}<em>{"opening image → first movement → continuation of action → final reaction"}</em>.</li>
              <li>• <span className="text-foreground/80 font-mono">FL2VA</span>{": Don't describe both static images twice - describe "}<span className="text-foreground/80">{"movement"}</span>{"which connects them. Pattern: "}<em>{"initial state → intermediate physical changes → approach to final composition → final state"}</em>.</li>
              <li>• <span className="text-foreground/80 font-mono">L2VA</span>{": Construct a plausible previous sequence converging on a given final frame."}</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* ── 6. Camera movement ── */}
      <Section
        icon={<CameraIcon className="w-4 h-4" />}
        title={"Camera movement"}
        subtitle={"Three dimensions: type, amplitude, speed"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-4 space-y-3">
          <div className="grid sm:grid-cols-3 gap-2">
            {[
              ["Movement type", "how the camera moves"],
              ["Amplitude", 'small / large amplitude'],
              ["Speed", 'slow / moderate / fast speed'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-2.5">
                <p className="text-xs font-semibold text-foreground">{k}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{v}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border bg-[var(--surface-1)]/60">
                  <th className="text-left px-3 py-2 font-semibold text-foreground">{"Type"}</th>
                  <th className="text-left px-3 py-2 font-semibold text-foreground">{"Expression"}</th>
                  <th className="text-left px-3 py-2 font-semibold text-foreground">{"Description"}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Zoom In / Out', 'Zoom In, Zoom Out', "The focal length changes, the camera is stationary"],
                  ['Pan Left / Right', 'Pan Left, Pan Right', "The camera is in place, the lens rotates horizontally"],
                  ['Truck Left / Right', 'Truck Left, Truck Right', "Camera moves horizontally"],
                  ['Tilt Up / Down', 'Tilt Up, Tilt Down', "The camera is in place, the lens rotates vertically"],
                  ['Pedestal Up / Down', 'Pedestal Up, Pedestal Down', "The entire chamber rises/lowers"],
                  ['Arc Shot', 'Arc Shot', "The camera moves in an arc around the subject"],
                  ['Tracking Shot', 'Tracking Shot', "The camera follows a moving subject"],
                  ['Static Shot', 'Static Shot', "Camera position and lens are stationary"],
                  ['Shake', 'Shake Slightly / Shake Strongly', "Low/high camera shake"],
                  ['POV', 'POV', "Subject's point of view"],
                  ['Roll', 'Roll Clockwise / Counterclockwise', "The camera tilts around the lens axis"],
                ].map(([type, expr, desc]) => (
                  <tr key={type} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{type}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-foreground/80">{expr}</td>
                    <td className="px-3 py-2 text-muted-foreground">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {"\n            💡 The camera movement is described as natural English action within the frame:\n          "}</p>
          <div className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-3">
            <p className="text-[11px] font-mono text-foreground/90 leading-relaxed">
              The camera pushes in with small amplitude at slow speed toward the folded letter in her hands.<br/>
              The camera pans right with large amplitude at fast speed, revealing the open doorway.<br/>
              The camera holds a static shot as the runner exits the frame.
            </p>
          </div>
        </div>
      </Section>

      {/* ── 7. Speaking characters ── */}
      <Section
        icon={<MessageSquareQuoteIcon className="w-4 h-4" />}
        title={"Talking characters, dialogue and singing"}
        subtitle={"ID, voiceover, dialogue break"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-4 space-y-3">
          <ul className="space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
            <li>{"• Subjects who speak, sing or vocalize receive stable identifiers "}<span className="font-mono text-[10px]">(S1)</span>, <span className="font-mono text-[10px]">(S2)</span> {" etc. When several already numbered speakers speak/sing together - use a composite ID "}<span className="font-mono text-[10px]">(S1,S2)</span>.</li>
            <li>{"• The identifier is retained throughout the frames; characters who never speak receive "}<span className="text-foreground/80">{"no"}</span> ID.</li>
            <li>{"• When the speaker first appears, provide enough information for a stable identity: character type, age, gender, whether he is in frame, pitch, timbre, speed of speech, or accent."}</li>
          </ul>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"Dialogue line format"}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {"\n              Identification phrase, ID, action and submission are put "}<span className="text-foreground/80">{"outside"}</span> <span className="font-mono text-[10px]">&lt;d&gt;</span>{". Inside "}<span className="font-mono text-[10px]">&lt;d&gt;</span> {" - just the language tag and the actual spoken content. Keep every word and punctuation mark verbatim; do not translate or rewrite them.\n            "}</p>
          </div>
          <div className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-3">
            <p className="text-[11px] font-mono text-foreground/90 leading-relaxed">
              The young woman with a quiet, breathy voice (S1) says: &lt;d&gt;[English] I get off at the next station.&lt;/d&gt;<br/>
              The two children (S1,S2) shout together, &lt;d&gt;[English] Wait for us!&lt;/d&gt;
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"Off-screen voice acting (voiceover)"}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {"\n              Use the exact phrase "}<span className="font-mono text-[10px]">says in an off-screen voiceover</span>{". Immediately after each block "}<span className="font-mono text-[10px]">&lt;d&gt;</span> {" indicate that the corresponding on-screen character's lips remain closed:\n            "}</p>
          </div>
          <div className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-3">
            <p className="text-[11px] font-mono text-foreground/90 leading-relaxed">
              The man (S1) says in an off-screen voiceover: &lt;d&gt;[English] I still remember that road.&lt;/d&gt; while his lips remain completely closed.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"Break dialogue by frame"}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {"\n              If one line or verse crosses the cut, use "}<span className="font-mono text-[10px]">&lt;scenetrans&gt;</span> {" at the connecting points of both parts and explicitly indicate that the sound continues through the cut. To cut off the speech at the end of the video, use "}<span className="font-mono text-[10px]">&lt;cutoff&gt;</span>.
            </p>
          </div>
        </div>
      </Section>

      {/* ── 8. On-screen text ── */}
      <Section
        icon={<TypeIcon className="w-4 h-4" />}
        title={"Text on screen"}
        subtitle={"Banners, signs, captions, subtitles"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-4">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {"\n            Any banner, sign, signature, subtitle or neon text that is actually visible on the screen, please write to "}<span className="text-foreground/80">{"English double quotes"}</span>{", keeping the original text and punctuation verbatim, without translation:\n          "}</p>
          <div className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-3 mt-2">
            <p className="text-[11px] font-mono text-foreground/90 leading-relaxed">
              A red neon sign reading "营业中" glows above the doorway.
            </p>
          </div>
        </div>
      </Section>

      {/* ── 9. Soundscape & music ── */}
      <Section
        icon={<MusicIcon className="w-4 h-4" />}
        title={"Soundscape and music"}
        subtitle={"overall_soundscape and non_diegetic_music"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">overall_soundscape</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {"\n              Use "}<span className="text-foreground/80">{"1–4 sentences"}</span> {" in one continuous paragraph to summarize atmospheric sound, physical action sounds, and non-verbal human sounds throughout the entire video (wind, rain, traffic, footsteps, moving fabric, hitting, breathing, laughing, hoarseness).\n            "}</p>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              {"\n              ⚠️ Dialogues, singing and diet music already belong to "}<span className="font-mono text-[10px]">integrated_multimodal_description</span> {" and "}<span className="text-foreground/80">{"should not be repeated"}</span> {" here.\n            "}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">non_diegetic_music</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {"\n              Use "}<span className="text-foreground/80">{"1–3 sentences"}</span> {" to describe background music that is not heard by the characters but only by the viewer. Emphasize instrumentation, tempo, rhythm and changes in dynamics; "}<span className="text-foreground/80">{"do not use abstract mood words"}</span> {" and don't explain the emotional function of the soundtrack.\n            "}</p>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              {"\n              ⚠️Singing, instruments, radio, TV or phone music heard by characters are dietary events and must be kept in "}<span className="font-mono text-[10px]">integrated_multimodal_description</span>.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-3">
            <p className="text-[11px] font-mono text-foreground/90 leading-relaxed">
              overall_soundscape: Steady rain taps against the café windows while low room ambience continues underneath. The entrance bell rings once, followed by wet footsteps and the soft scrape of a chair.<br/><br/>
              non_diegetic_music: Sparse piano notes at a slow tempo, joined by sustained low strings that gradually increase in volume before fading out.
            </p>
          </div>
        </div>
      </Section>

      {/* ── 10. Examples ── */}
      <Section
        icon={<BookOpenIcon className="w-4 h-4" />}
        title={"Complete examples of prompts"}
        subtitle={"Four modes - can be copied and adapted"}
      >
        <div className="space-y-3">
          {EXAMPLES.map((ex) => (
            <div key={ex.title} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">{ex.title}</span>
                <span className="text-[10px] text-muted-foreground">— {ex.note}</span>
              </div>
              <PromptSample text={ex.text} note={"Click on the icon on the right to copy"} />
            </div>
          ))}
        </div>
      </Section>

      {/* ── 11. Common mistakes ── */}
      <Section
        icon={<AlertTriangleIcon className="w-4 h-4" />}
        title={"Common mistakes"}
        subtitle={"What reduces the quality of generation and how to fix it"}
      >
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-[var(--surface-1)]/60">
                <th className="text-left px-3 py-2 font-semibold text-foreground">{"Problem"}</th>
                <th className="text-left px-3 py-2 font-semibold text-foreground">{"Reason"}</th>
                <th className="text-left px-3 py-2 font-semibold text-foreground">{"Correction"}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["The wrong person is speaking", "IDs have been changed or the speaker has never been set", "Assign stable (S1) and (S2) the first time each voice appears, then reuse them"],
                ["The cue is repeated in the soundscape", "Spoken words copied into multiple fields", "Store the full replica only inside integrated_multimodal_description"],
                ["Wrong image opens/closes video", "The image was added as a reference instead of the exact first frame", "Use Start Frame and start the prompt with the official first frame alignment instruction"],
                ["Detailed cheat sheet is lost or leaked", "The prompt competes with the visual plan, or the duration is too short", "Give the cheat sheet one clear role, shorten the prompt, and choose a duration that suits the sequence"],
                ["The model ignores the reference", "The role is not obvious", "Name the exact subject, attribute, frame range and intended relationship"],
                ["Two sources conflict over one attribute", "Reference asset not selected", "Select the asset that controls the attribute, exclude the version of the other"],
              ].map(([problem, cause, fix]) => (
                <tr key={problem} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 text-foreground">{problem}</td>
                  <td className="px-3 py-2 text-muted-foreground">{cause}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── 12. Ref2VA deep dive ── */}
      <Section
        icon={<TagIcon className="w-4 h-4" />}
        title={"Reference mode (Ref2VA)"}
        subtitle={"Six-section structure, labels, rules"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"Six-section structure"}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                ['subject_definitions', "Who/what is: <Subject N>, link to <Picture N>, <Video N>, <Audio N>"],
                ['summary', "Briefly: task, target video, connections between references"],
                ['retention_analysis', "What is saved (fully_preserved) / transmitted (reference) / changed"],
                ['detailed_description', "Main body: shots [Shot 1], [Shot 2]… in order"],
                ['overall_soundscape', "Atmospheric and physical sounds"],
                ['non_diegetic_music', "Background music for the viewer (or N/A)"],
              ].map(([k, v], i) => (
                <div key={k} className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/15 text-cyan-300 text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="font-mono text-[10px] text-foreground/90">{k}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{v}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"Reference tags"}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                ['<Subject N>', "Visible content abstracted from reference assets; can be reused or modified in target video"],
                ['<Picture N>', "A reference image that itself serves as the first/last frame, key frame, or composition anchor"],
                ['<Video N>', "Reference video as a source for editing, continuation or entire time structure"],
                ['<Audio N>', "Audio signal that is copied or referenced"],
              ].map(([tag, desc]) => (
                <div key={tag} className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-2.5">
                  <p className="font-mono text-[11px] text-foreground/90">{tag}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"Numbering rules and independent tracks"}</p>
            <ul className="space-y-1 text-[11px] text-muted-foreground leading-relaxed">
              <li>• <span className="font-mono text-[10px]">&lt;Video N&gt;</span> {" and "}<span className="font-mono text-[10px]">&lt;Audio N&gt;</span> {" numbered "}<span className="text-foreground/80">{"independently"}</span> {" - indexes do not encode the pair between them."}</li>
              <li>{"• If the image is only being used to define the character/style, do not create a separate line "}<span className="font-mono text-[10px]">&lt;Picture N&gt;</span> {" - indicate the source within the corresponding "}<span className="font-mono text-[10px]">&lt;Subject N&gt;</span>.</li>
              <li>{"• If the asset "}<span className="font-mono text-[10px]">&lt;Picture N&gt;</span>/<span className="font-mono text-[10px]">&lt;Video N&gt;</span> {" only identifies another reference and is not analyzed separately, refer to it within the definition of that asset."}</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"Relationship markers"}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-2.5">
                <p className="text-[10px] font-semibold text-foreground mb-1">{"For visible content"}</p>
                <ul className="space-y-0.5 text-[10px] text-muted-foreground">
                  <li>• <span className="font-mono text-[9px]">fully_preserved</span> {" — geometry, colors, details are completely preserved"}</li>
                  <li>• <span className="font-mono text-[9px]">weak_reference</span> {" — only general similarity in category/atmosphere is maintained"}</li>
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-[var(--surface-1)]/60 p-2.5">
                <p className="text-[10px] font-semibold text-foreground mb-1">{"For audio"}</p>
                <ul className="space-y-0.5 text-[10px] text-muted-foreground">
                  <li>• <span className="font-mono text-[9px]">fully_copy</span> {" - the original audio is reused 1:1 as the final track"}</li>
                  <li>• <span className="font-mono text-[9px]">reference</span> {" - not copied verbatim; timbre, rhythm, style of music, content of dialogue are conveyed"}</li>
                  <li>• <span className="font-mono text-[9px]">weak_reference</span> {" — only broad similarities in category/atmosphere remain"}</li>
                </ul>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"Talking characters and IDs"}</p>
            <ul className="space-y-1 text-[11px] text-muted-foreground leading-relaxed">
              <li>{"• Reuse Global Speaker ID "}<span className="font-mono text-[10px]">(Sx)</span> {" at every real vocal event."}</li>
              <li>• <span className="font-mono text-[10px]">&lt;Audio N&gt;</span>{", bound to the target speaker, also reuses the same "}<span className="font-mono text-[10px]">(Sx)</span>{", but "}<span className="text-foreground/80">{"never"}</span> {" does not assign a new ID on its own."}</li>
              <li>{"• Don't write "}<span className="font-mono text-[10px]">(Sx)</span> {" in "}<span className="font-mono text-[10px]">retention_analysis</span>.</li>
              <li>{"• Voices physically produced by a specific person/character - use "}<span className="font-mono text-[10px]">(Sx)</span>{". Music or dialogue from a direct reuse of the soundtrack - refer to "}<span className="font-mono text-[10px]">&lt;Audio N&gt;</span>.</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">{"Important Warnings"}</p>
            <ul className="space-y-1 text-[11px] text-muted-foreground leading-relaxed">
              <li>• <span className="text-foreground/80">{"Don't mix"}</span> {" first/last-frame roles with reference media roles. The API requires that role families do not overlap in the same request."}</li>
              <li>{"• Reference audio "}<span className="text-foreground/80">{"can't be the only one"}</span> {" media reference for H3-Base-Ref2VA - be sure to attach an image or video."}</li>
              <li>{"• If only the timbre is being conveyed, do not copy the original dialogue verbatim into the entire video."}</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* ── 13. Checklist ── */}
      <Section
        icon={<ClipboardCheckIcon className="w-4 h-4" />}
        title={"Checklist before generation"}
        subtitle={"Check all items before shipping"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-4">
          <ul className="space-y-1.5">
            {[
              "The correct mode has been selected for the available input data.",
              "Any frame alignment instruction appears on the first line (for I2VA/FL2VA/L2VA).",
              "The time of the last frame is the same as the effective duration and has two decimal places.",
              "[Shot 1] without timecode; The cutting times of subsequent frames strictly increase and fit within the duration.",
              "The description of the same subject remains stable in all frames.",
              "Each speaker stores one ID (Sx).",
              "Each cue is saved with the exact language and wording inside the <d>.",
              "The visible text is in English double quotes.",
              "Physical sounds are in the timeline or overall_soundscape.",
              "Music for the audience is in non_diegetic_music, or N/A is indicated there.",
              "The requested actions are placed within the selected clip duration.",
              "Acceptance check calls out the most important things: identity, text on screen, transition, timing, sound or final frame.",
            ].map((item, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-muted-foreground leading-relaxed">
                <span className="text-cyan-400 shrink-0 mt-0.5">☐</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ── 14. LLM assistant ── */}
      <Section
        icon={<BotIcon className="w-4 h-4" />}
        title={"LLM assistant in the studio"}
        subtitle={"Built-in local assistant (Bonsai 2 27B by default / Gemma 4 12B / Qwen3.5 9B) - sees references and video frames, writes prompts itself"}
      >
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
              <BotIcon className="w-4 h-4 text-violet-300" />
            </span>
            <div className="space-y-1">
              <p className="text-xs text-foreground leading-relaxed">
                {"\n                Tab "}<span className="text-violet-300 font-medium">{"\"Assistant\""}</span> {" on the left is a local LLM (default Bonsai 2 27B, ternary, vision; alternatives: Gemma 4 12B, Qwen3.5 9B) that runs directly on your video card. She already knows the complete guide to MiniMax H3, "}<span className="text-violet-300 font-medium">{"sees attached pictures and video frames"}</span>{", so it can describe what’s on them and capture the characters in the prompt. The assistant knows the selected generation mode and will not add tags that are not supported (edit 150).\n              "}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {"\n                The assistant replies and writes finished prompts in English. If there are no references, it does not use tags; if there is - binds only existing ones "}<span className="font-mono text-[10px]">&lt;Picture N&gt;</span>, <span className="font-mono text-[10px]">&lt;Video N&gt;</span>, <span className="font-mono text-[10px]">&lt;Audio N&gt;</span>.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-2.5">
            {[
              ["Open the \"Assistant\" tab", "Describe your idea in English. The attached references are already visible to the model."],
              ["Or “Improve prompt”", "Button in the editor's header: sends the current draft to LLM and immediately switches to chat."],
              ["Insert a ready-made prompt", "You copy the assistant’s answer into the generation field - tags and characters are already linked to your refs."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-3">
                <p className="text-xs font-semibold text-violet-400">{t}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 15. History / favorites / examples ── */}
      <Section
        icon={<HistoryIcon className="w-4 h-4" />}
        title={"History, favorites and examples"}
        subtitle={"Your prompts are not lost - they are saved and available in one click"}
      >
        <div className="grid sm:grid-cols-3 gap-2.5">
          {[
            ["📜 History", "Each sent prompt is saved (up to 30). Click - put it back. Available in the editor (\"History\" tab) and in the \"History\" menu on the generation tab."],
            ["⭐ Favorites", "Secure successful prompts with an asterisk - they are always on top and are not deleted when the history is full (up to 20)."],
            ["📚 Examples", "Ready-made English prompts for different scenarios (T2VA, I2VA, FL2VA, Ref2VA). Available in the editor and in the Examples menu."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-3">
              <p className="text-xs font-semibold text-foreground">{t}</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 16. Hover previews ── */}
      <Section
        icon={<MousePointerClickIcon className="w-4 h-4" />}
        title={"Reference previews on hover"}
        subtitle={"Hover your cursor over a tag and see what file is behind it"}
      >
        <div className="rounded-xl border border-border bg-[var(--surface-2)]/40 p-4 flex items-start gap-3">
          <span className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center shrink-0">
            <MousePointerClickIcon className="w-4 h-4 text-cyan-400" />
          </span>
          <div className="space-y-1">
            <p className="text-xs text-foreground leading-relaxed">
              {"\n              In the prompt field, editor and chat with LLM, hover over the tag "}<span className="font-mono text-[10px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-300">&lt;Picture N&gt;</span> {" or "}<span className="font-mono text-[10px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-300">&lt;Video N&gt;</span> {" shows a floating preview: a picture or a video poster. This helps avoid confusing reference numbers in long prompts.\n            "}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {"\n              Audio references ("}<span className="font-mono text-[10px]">&lt;Audio N&gt;</span>{") previews are not shown - there is no visual representation for sound.\n            "}</p>
          </div>
        </div>
      </Section>

      {/* ── 17. Camera vocabulary (quick insert) ── */}
      <Section
        icon={<CameraIcon className="w-4 h-4" />}
        title={"Cinematic Dictionary (quick insert)"}
        subtitle={"Insert phrases that the model understands and likes into the prompt"}
      >
        <div className="flex flex-wrap gap-2">
          {CAMERA_WORDS.map((w) => (
            <span key={w} className="px-2.5 py-1 rounded-full border border-border bg-[var(--surface-2)]/60 text-[11px] text-foreground/80">
              {w}
            </span>
          ))}
        </div>
      </Section>

      {/* ── 18. Don'ts (summary) ── */}
      <Section
        icon={<AlertTriangleIcon className="w-4 h-4" />}
        title={"What NOT to do (briefly)"}
        subtitle={"Quick list of prohibited actions"}
      >
        <ul className="space-y-1.5">
          {DONT_LIST.map((t, i) => (
            <li key={i} className="flex gap-2.5 rounded-lg border border-border bg-[var(--surface-2)]/40 px-3 py-2">
              <span className="text-red-400 text-xs shrink-0 mt-0.5">✕</span>
              <p className="text-xs text-muted-foreground leading-relaxed">{t}</p>
            </li>
          ))}
        </ul>
      </Section>
    </motion.div>
  )
}
