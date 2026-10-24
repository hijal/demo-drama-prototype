'use client'

/**
 * Settings Dialog — tabbed settings:
 *   • Общие        — ComfyUI-статус, модели
 *   • Внешний вид  — тема оформления, звук при завершении (правка 111)
 *   • LLM          — устройство, контекст, макс. длина ответа
 *   • Оптимизация  — VRAM-резерв, Dynamic VRAM
 *   • ComfyUI      — версия, Python, GPU, VRAM-разбивка
 */
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  ServerIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  Loader2Icon,
  CpuIcon,
  SunIcon,
  MoonIcon,
  SlidersHorizontalIcon,
  BotIcon,
  BoxIcon,
  LinkIcon,
  CopyIcon,
  FolderOpenIcon,
  AlertTriangleIcon,
  Trash2Icon,
  RotateCcwIcon,
  TrashIcon,
  MicIcon,
  PaletteIcon,
  SparklesIcon,
  ChevronDownIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ModelsPanel } from './models-panel'
import { LoraSettingsPanel } from './lora-settings-panel'
import { DiffusionModelSelector } from './diffusion-model-selector'
import { ModelMigrationPanel } from './model-migration-panel'
import { LlmModelSelector } from './llm-model-selector'
import { VoiceSettingsPanel } from './voice-settings-panel'
import { MODELS, MODEL_CATEGORIES } from '@/lib/models-config'
import { useGenStore, DEFAULT_VIDEO_STATE } from '@/lib/gen-store'
import { usePromptHistory } from '@/lib/prompt-history-store'
import { useGenDurations } from '@/lib/gen-duration-store'
import { useAssistantChats } from '@/lib/assistant-chats-store'
import { useGalleryRefresh } from '@/lib/gallery-refresh-store'
import { SettingSlider } from './setting-slider'

/* ─── Types ─── */

interface ComfyStats {
  system: {
    os: string
    comfyui_version: string
    python_version: string
    embedded_python: boolean
    args: Record<string, unknown>
  }
  devices: Array<{
    name: string
    type: string
    index: number
    vram_total?: number
    vram_free?: number
  }>
}

type TabId = 'general' | 'appearance' | 'llm' | 'voice' | 'optimization' | 'comfy' | 'links' | 'reset'

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'general', label: "General", icon: <BoxIcon className="w-4 h-4" /> },
  // (правка 111) Внешний вид: тема оформления и звук — вынесено из «Общих»
  { id: 'appearance', label: "Appearance", icon: <PaletteIcon className="w-4 h-4" /> },
  { id: 'llm', label: 'LLM', icon: <BotIcon className="w-4 h-4" /> },
  // (правка 65) Голосовой ввод (whisper STT, CPU)
  { id: 'voice', label: "Voice", icon: <MicIcon className="w-4 h-4" /> },
  { id: 'optimization', label: "Optimization", icon: <SlidersHorizontalIcon className="w-4 h-4" /> },
  { id: 'comfy', label: 'ComfyUI', icon: <ServerIcon className="w-4 h-4" /> },
  { id: 'links', label: "Links", icon: <LinkIcon className="w-4 h-4" /> },
  { id: 'reset', label: "Reset", icon: <AlertTriangleIcon className="w-4 h-4" /> },
]

/* ─── Component ─── */

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState<TabId>('general')
  const [stats, setStats] = useState<ComfyStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [reserveVram, setReserveVram] = useState(3)
  const [dynamicVram, setDynamicVram] = useState(true)
  const [llmDevice, setLlmDevice] = useState<'auto' | 'gpu' | 'cpu'>('auto')
  // (правка 119) дефолтный контекст — 25K токенов
  const [llmCtxSize, setLlmCtxSize] = useState(25600)
  const [llmMaxOut, setLlmMaxOut] = useState(4096)
  // (правка 53) Видение видео ассистентом — по умолчанию ВЫКЛ
  const [llmVideoVision, setLlmVideoVision] = useState(false)
  // (правка 109) Квантизация KV-кэша LLM; (правка 119) по умолчанию q4_0
  const [llmKvCache, setLlmKvCache] = useState<'off' | 'q8_0' | 'q5_1' | 'q4_0'>('q4_0')
  // (правка 140) Тонкая настройка сэмплинга УДАЛЕНА из UI: применяются
  // модель-осознанные значения из src/lib/llm-sampling.ts. Ручной escape-hatch
  // остался только через config.ini ([llm] sampling_override=1 + значения).
  // (правка 54) счётчик сбросов: после «Сброса настроек» селекторы моделей
  // перезагружают конфиг (они читают его только при монтировании).
  const [resetTick, setResetTick] = useState(0)
  const [saving, setSaving] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'reset' | 'clean' | 'delete' | 'factory' | null>(null)
  const [executing, setExecuting] = useState(false)
  const [soundOn, setSoundOn] = useState(true)

  /* VRAM-оптимизации генерации (Low VRAM / Chunk FF) — живут в том же
     zustand-сторе, что и раньше в «Доп. параметрах»; генерация читает их оттуда. */
  const video = useGenStore((s) => s.video)
  const patchVideo = useGenStore((s) => s.patchVideo)

  const checkConnection = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/comfy/health')
      if (res.ok) {
        const data = await res.json()
        setStats(data as ComfyStats)
        setConnected(true)
      } else {
        setConnected(false)
        setStats(null)
      }
    } catch {
      setConnected(false)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      checkConnection()
      fetch('/api/config')
        .then((r) => r.json())
        .then((d) => {
          // 0 — легальное значение (клампится на сервере до 0–16): `|| 3`
          // превращал сохранённый 0 в 3 при каждом открытии диалога
          setReserveVram(typeof d.reserve_gb === 'number' ? d.reserve_gb : 3)
          setDynamicVram(d.dynamic_vram !== false)
          if (['auto', 'gpu', 'cpu'].includes(d.llm_device)) setLlmDevice(d.llm_device)
          if (typeof d.llm_context_size === 'number') setLlmCtxSize(d.llm_context_size)
          if (typeof d.llm_max_output_tokens === 'number') setLlmMaxOut(d.llm_max_output_tokens)
          if (typeof d.llm_video_vision === 'boolean') setLlmVideoVision(d.llm_video_vision)
          // (правка 109)
          if (['off', 'q8_0', 'q5_1', 'q4_0'].includes(d.llm_kv_cache)) setLlmKvCache(d.llm_kv_cache)
          if (typeof d.sound_on === 'boolean') setSoundOn(d.sound_on)
        })
        .catch(() => {
          setReserveVram(3); setDynamicVram(true); setLlmDevice('auto')
          setLlmCtxSize(25600); setLlmMaxOut(4096); setLlmVideoVision(false)
          setLlmKvCache('q4_0')
        })
    }
  }, [open, checkConnection])

  /** Save LLM settings (applied at next model load). */
  const saveLlm = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llm_device: llmDevice,
          llm_context_size: llmCtxSize,
          llm_max_output_tokens: llmMaxOut,
          llm_video_vision: llmVideoVision,
          // (правка 109) квантизация KV-кэша
          llm_kv_cache: llmKvCache,
        }),
      })
      if (res.ok) {
        toast.success("LLM settings saved", {
          // (правка 54) точнее: устройство/контекст — при следующем запуске
          // модели, видение видео и макс. длина — сразу (per-request).
          description: "Device and context - the next time you run the model; the rest - immediately.",
        })
      } else {
        toast.error("Save error")
      }
    } catch {
      toast.error("Save error")
    } finally {
      setSaving(false)
    }
  }, [llmDevice, llmCtxSize, llmMaxOut, llmVideoVision, llmKvCache])

  /** Save optimization settings (applied at ComfyUI restart). */
  const saveOptimization = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reserve_gb: reserveVram,
          dynamic_vram: dynamicVram,
        }),
      })
      if (res.ok) {
        toast.success("Optimization saved", {
          description: "Will be applied when ComfyUI is restarted.",
        })
      } else {
        toast.error("Save error")
      }
    } catch {
      toast.error("Save error")
    } finally {
      setSaving(false)
    }
  }, [reserveVram, dynamicVram])

  /* ── Опасная зона: конфиг для подтверждения ── */
  const CONFIRM: Record<string, { title: string; desc: string; button: string }> = {
    reset: {
      title: "Reset settings?",
      // (правка 54) текст соответствует фактическому поведению: сбрасываются
      // ВСЕ параметры, включая выбор моделей (LLM-квант, базовая модель),
      // видение видео и звук.
      desc: "All parameters (VRAM, LLM, model selection, generation, resolution, steps, sound) will return to default values. The action is irreversible.",
      button: "Reset",
    },
    clean: {
      title: "Clear cache?",
      desc: "ALL files from the ComfyUI input folder (references, frames, downloads) will be deleted. The action is irreversible.",
      button: "Clear",
    },
    delete: {
      title: "Delete all content?",
      desc: "ALL generated videos, chat history with the assistant, history of prompts and the current prompt will be deleted. The action is irreversible.",
      button: "Delete",
    },
    factory: {
      title: "Factory reset?",
      // (правка 130) Полный сброс «как с завода»: настройки + LoRA + кэш +
      // контент + апскейл + чаты + промпты. Всё, что делает программу «твоей», чистится.
      desc: "ALL settings will be reset (VRAM, LLM, models, sound), LoRA settings (all disabled, triggers cleared), cache (input), content (output), upscale files (input and output), assistant chat history, prompt history and favorites, current prompt and all local browser data will be deleted. The program will return to its “out of the box” state. The action is irreversible.",
      button: "Reset everything",
    },
  }

  const executeAction = useCallback(async (action: 'reset' | 'clean' | 'delete' | 'factory') => {
    setExecuting(true)
    try {
      if (action === 'factory') {
        /* (правка 130) Заводской сброс: полный сброс «как с завода».
         * 1) Настройки → дефолты
         * 2) LoRA → все выключены, триггеры очищены
         * 3) Кэш (input) → удалён
         * 4) Контент (output) → удалён
         * 5) (правка 167) Файлы апскейла (input + output) → удалены
         * 6) Чаты ассистента → очищены
         * 7) Промпты (история + избранное) → очищены
         * 8) Текущий промпт + длительности → очищены
         * 9) Все localStorage-сторы → сброшены
         */
        // 1) Настройки
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reserve_gb: 3,
            dynamic_vram: true,
            llm_device: 'auto',
            llm_context_size: 25600,
            llm_max_output_tokens: 4096,
            llm_video_vision: false,
            llm_kv_cache: 'q4_0',
            // (правка 140) сэмплинг — всегда модель-осознанные значения
            llm_sampling_override: false,
            sound_on: true,
            llm_model: '',
            diffusion_model: '',
            stt_enabled: true,
            stt_dir: '',
            stt_model: '',
            stt_language: 'en',
            stt_threads: 0,
          }),
        })
        setReserveVram(3)
        setDynamicVram(true)
        setLlmDevice('auto')
        setLlmCtxSize(25600)
        setLlmMaxOut(4096)
        setLlmVideoVision(false)
        setLlmKvCache('q4_0')
        setSoundOn(true)
        setResetTick((t) => t + 1)

        // Серверные шаги проверяем: раньше любой 500/сетевой сбой молча
        // съедался, и тост «выполнен» врал про несделанное.
        const serverOk = async (r: Response): Promise<boolean> => r.ok

        // 2) LoRA → сброс к заводским
        const loraOk = await serverOk(await fetch('/api/loras/reset', { method: 'POST' }))

        // 3) Кэш (input)
        const cleanInOk = await serverOk(await fetch('/api/comfy/clean', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'input' }),
        }))
        useGenStore.getState().clearVideoRefs()
        useGenStore.setState((s) => ({
          video: { ...s.video, startFrame: null, endFrame: null },
        }))

        // 4) Контент (output)
        const cleanOutOk = await serverOk(await fetch('/api/comfy/clean', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'output' }),
        }))

        // 5) (правка 167) Файлы апскейла (входные + выходные) — полный сброс
        const cleanUpscaleOk = await serverOk(await fetch('/api/comfy/clean', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'upscale' }),
        }))

        // 6) Чаты ассистента
        useAssistantChats.getState().clearAll()

        // 7) Промпты (история + избранное)
        usePromptHistory.getState().clear()

        // 8) Текущий промпт + длительности
        useGenStore.setState((s) => ({ video: { ...s.video, prompt: '' } }))
        useGenDurations.getState().clear()

        // 9) Полный сброс localStorage-сторов (всё, что не задемо выше)
        //    — генерация, длительности, чаты, промпты, тема, и т.д.
        //    (Сброс localStorage для конкретных ключей, чтобы гарантировать
        //     чистоту даже если какие-то стоуры не покрыты явным clear.)
        const keysToClear = [
          'h3-prompt-history',
          'cb-gen-durations', // (факт-чек) стор длительностей живёт под ЭТИМ ключом
          'h3-assistant-chats',
          'h3-gen-store',
        ]
        for (const k of keysToClear) {
          try { localStorage.removeItem(k) } catch { /* noop */ }
        }

        // (правка 134) Галерея: сигнал на перечитывание — видео удалены на
        // бэкенде, галерея сразу опустеет (не дожидаясь переключения вкладок).
        useGalleryRefresh.getState().bump()

        if (loraOk && cleanInOk && cleanOutOk && cleanUpscaleOk) {
          toast.success("Factory reset completed. The program is in “out of the box” condition. Restart to completely reset ComfyUI.")
        } else {
          // Часть серверных шагов не удалась — говорим честно, что именно
          const failed = [
            !loraOk && "LoRA reset",
            !cleanInOk && "clearing input",
            !cleanOutOk && "cleaning output",
            !cleanUpscaleOk && "upscale cleaning",
          ].filter(Boolean).join(', ')
          toast.error("Factory reset partially completed", {
            description: `Failed: ${failed}. Check if the program is running and try again.`,
          })
        }
        return
      }

      if (action === 'reset') {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reserve_gb: 3,
            dynamic_vram: true,
            llm_device: 'auto',
            llm_context_size: 25600,       // (правка 119) дефолт контекста — 25K
            llm_max_output_tokens: 4096,
            // (правка 54) ранее эти параметры сброс НЕ трогал — теперь сбрасываем всё:
            llm_video_vision: false, // видение видео (правка 53) → выкл
            llm_kv_cache: 'q4_0',    // квантизация KV-кэша (правки 109/119) → q4_0
            // (правка 140) сэмплинг — всегда модель-осознанные значения
            llm_sampling_override: false,
            sound_on: true,          // звук → вкл
            llm_model: '',           // (правка 99) пустое = дефолт Qwen3.5 9B Q4_K_M
            diffusion_model: '',     // базовая модель → дефолтная
            // (правка 65) голосовой ввод → значения по умолчанию
            stt_enabled: true,
            stt_dir: '',
            stt_model: '',
            stt_language: 'en',
            stt_threads: 0,
          }),
        })
        useGenStore.setState({ video: { ...DEFAULT_VIDEO_STATE } })
        useGenDurations.getState().clear()
        setReserveVram(3)
        setDynamicVram(true)
        setLlmDevice('auto')
        setLlmCtxSize(25600)
        setLlmMaxOut(4096)
        setLlmVideoVision(false)
        setLlmKvCache('q4_0')
        setSoundOn(true)
        setResetTick((t) => t + 1) // (правка 54) селекторы моделей перечитают конфиг
        toast.success("Settings reset to default")
      } else if (action === 'clean') {
        const res = await fetch('/api/comfy/clean', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'input' }),
        })
        const data = await res.json()
        if (data.ok) {
          useGenStore.getState().clearVideoRefs()
          useGenStore.setState((s) => ({
            video: { ...s.video, startFrame: null, endFrame: null },
          }))
          toast.success(`Cache cleared (deleted: ${data.deleted})`)
        } else {
          toast.error(data.error || "Error clearing cache")
        }
      } else if (action === 'delete') {
        const res = await fetch('/api/comfy/clean', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'output' }),
        })
        const data = await res.json()
        if (data.ok) {
          useAssistantChats.getState().clearAll()
          useGenDurations.getState().clear()
          usePromptHistory.getState().clear()
          useGenStore.setState((s) => ({ video: { ...s.video, prompt: '' } }))
          // (правка 134) Галерея: сигнал на перечитывание — видео удалены на
          // бэкенде, галерея сразу опустеет (не дожидаясь переключения вкладок).
          useGalleryRefresh.getState().bump()
          toast.success(`Content removed (deleted: ${data.deleted})`)
        } else {
          toast.error(data.error || "Content deletion error")
        }
      }
    } catch (err) {
      console.error('Action failed:', err)
      toast.error("An error occurred while performing the action")
    } finally {
      setExecuting(false)
      setConfirmAction(null)
    }
  }, [])

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* FIXED size (never resizes between tabs) + internal scroll area —
          nothing sticks out past the side edges. */}
      <DialogContent className="w-[950px] max-w-[96vw] sm:max-w-[950px] h-[920px] max-h-[96vh] flex flex-col overflow-hidden gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ServerIcon className="w-5 h-5" />
            {"\n            Settings\n          "}</DialogTitle>
          <DialogDescription>
            {"\n            Connection, models, LLM, GPU memory, ComfyUI and manual download links\n          "}</DialogDescription>
        </DialogHeader>

        {/* Tab bar */}
        <div className="px-6 shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface-2)]/60 border border-border mb-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  // (правка 120) whitespace-nowrap: «Внешний вид» — двухсловное имя,
                  // без запрета переноса лезло в две строки (у остальных слов переноса нет)
                  'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                  tab === t.id
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                    : 'text-muted-foreground border border-transparent hover:text-foreground',
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable tab content — the ONLY scrolling region */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-5">
        {/* ─────────── General ─────────── */}
        {tab === 'general' && (
          <div className="space-y-4 py-2">
            {/* Connection status */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">ComfyUI:</span>
              {loading ? (
                <Badge variant="secondary" className="gap-1">
                  <Loader2Icon className="w-3 h-3 animate-spin" />
                  {"\n                  Checking...\n                "}</Badge>
              ) : connected ? (
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
                  <CheckCircleIcon className="w-3 h-3" />
                  {"\n                  Connected\n                "}</Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircleIcon className="w-3 h-3" />
                  {"\n                  Not available\n                "}</Badge>
              )}
            </div>
            {!connected && (
              <p className="text-xs text-muted-foreground">
                {"\n                Make sure ComfyUI is running on port 8188.\n              "}</p>
            )}

            {/* Model Migration (правка 47) — на самом верху */}
            <ModelMigrationPanel />

            {/* Models */}
            <div className="space-y-2 pt-2 border-t border-border">
              <ModelsPanel />
            </div>

            {/* Diffusion Model (правка 45); key — перечитывание после сброса (правка 54) */}
            <DiffusionModelSelector key={`dm-${resetTick}`} />

            {/* Custom LoRAs (правка 44; правка 95 — турбо-лора в общем списке) */}
            <LoraSettingsPanel />

            {/* (правка 111) Тема и звук вынесены во вкладку «Внешний вид» */}

            {/* (правка 116) Окно приветствия — вернуть, если галочка «Больше не показывать»
             * случайно попала под палец: сбрасываем флаг в localStorage браузера
             * (h3_welcome_seen_v1) и шлём событие h3:show-welcome — Home подхватывает
             * и открывает WelcomeDialog. Настройки при этом закрываем, чтобы окно
             * показывалось поверх приложения (у шаден-диалога outside-click закрыл бы
             * его при клике по чужому оверлею). */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div>
                <span className="text-xs text-muted-foreground">{"Startup greeting"}</span>
                <p className="text-[10px] text-muted-foreground/60">
                  {"\n                  Pop-up window with brief instructions. If you checked the box\n                  “Do not show again” - return it with this button.\n                "}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  try {
                    localStorage.removeItem('h3_welcome_seen_v1')
                  } catch { /* ignore */ }
                  window.dispatchEvent(new CustomEvent('h3:show-welcome'))
                  onOpenChange(false)
                }}
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                {"\n                Show welcome window\n              "}</Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={checkConnection}
              disabled={loading}
              className="w-full"
            >
              <RefreshCwIcon className={loading ? 'animate-spin' : ''} />
              {"\n              Double check\n            "}</Button>


          </div>
        )}

        {/* ─────────── Appearance (правка 111) ─────────── */}
        {tab === 'appearance' && (
          <div className="space-y-4 py-2">
            {/* (правка 111) Тема оформления — вынесено из «Общих» */}
            <ThemeSwitcher first />

            {/* (правка 111) Звук при завершении — вынесено из «Общих» */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <span className="text-xs text-muted-foreground">{"Completion sound"}</span>
                <p className="text-[10px] text-muted-foreground/60">
                  {"\n                  Short signal at the end of generation\n                "}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={soundOn}
                onClick={async () => {
                  const newVal = !soundOn
                  setSoundOn(newVal)
                  try {
                    await fetch('/api/config', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sound_on: newVal }),
                    })
                  } catch { /* ignore */ }
                }}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                  soundOn ? 'bg-cyan-600' : 'bg-muted-foreground/30',
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform',
                  soundOn ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          </div>
        )}

        {/* ─────────── LLM ─────────── */}
        {tab === 'llm' && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BotIcon className="w-4 h-4 text-cyan-400" />
              {"\n              LLM assistant\n            "}</div>
            <p className="text-[11px] text-muted-foreground/70 -mt-2">
              {"\n              The structure and context parameters of the chat model (Gemma 4 12B / Qwen3.5 9B).\n            "}</p>

            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground">{"Device"}</span>
                  <p className="text-[10px] text-muted-foreground/60">
                    {"\n                    Where is the chat model considered?\n                  "}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface-2)]/60 border border-border">
                {([
                  ['auto', "Auto", "GPU with free VRAM, otherwise CPU"],
                  ['gpu', 'GPU', "Fast (~40+ current/s), shares VRAM with generation"],
                  ['cpu', 'CPU', "Slower, but doesn't touch VRAM"],
                ] as const).map(([id, label, title]) => (
                  <button
                    key={id}
                    type="button"
                    title={title}
                    onClick={() => setLlmDevice(id)}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                      llmDevice === id
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                        : 'text-muted-foreground border border-transparent hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{"LLM context"}</span>
                <span className="text-xs font-mono text-cyan-300">
                  {(llmCtxSize / 1024).toFixed(llmCtxSize % 1024 === 0 ? 0 : 1)}{"K tokens\n                "}</span>
              </div>
              <input
                type="range"
                min={8192}
                max={102400}
                step={1024}
                value={llmCtxSize}
                onChange={(e) => setLlmCtxSize(parseInt(e.target.value, 10))}
                className="w-full h-2 cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground/50">
                <span>8K</span><span>100K</span>
              </div>
            </div>

            {/* (правка 109) Квантизация KV-кэша: экономит VRAM/RAM, качество чуть ниже */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">{"KV cache quantization"}</span>
              <p className="text-[10px] text-muted-foreground/60">
                {"\n                Compresses the chat model context cache (less memory for the same context).\n                By default, q4_0 is maximum savings (edit 119); q8_0 - almost without loss of quality; off - no compression.\n              "}</p>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface-2)]/60 border border-border">
                {([
                  ['off', "Off (fp16)", "Same as before: full precision, more memory"],
                  ['q8_0', 'Q8', "Recommended: almost no loss of quality"],
                  ['q5_1', 'Q5', "Moderate memory savings"],
                  ['q4_0', 'Q4', "Maximum memory savings"],
                ] as const).map(([id, label, title]) => (
                  <button
                    key={id}
                    type="button"
                    title={title}
                    onClick={() => setLlmKvCache(id)}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                      llmKvCache === id
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                        : 'text-muted-foreground border border-transparent hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* (правка 53) Видение видео ассистентом — по умолчанию ВЫКЛ */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-muted-foreground">{"Video vision by assistant"}</span>
                  <p className="text-[10px] text-muted-foreground/60">
                    {"\n                    On: the assistant watches frames of video refs (conspicuously eats the context).\n                    Off: the model only knows about the PRESENCE of the video and does not invent its content.\n                  "}</p>
                </div>
                <button
                  type="button"
                  title={llmVideoVision ? "Turn off video vision" : "Enable video vision"}
                  onClick={() => setLlmVideoVision(!llmVideoVision)}
                  className={cn(
                    'relative w-10 h-5.5 rounded-full transition-colors shrink-0',
                    llmVideoVision ? 'bg-cyan-500/70' : 'bg-[var(--surface-4)]',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform',
                      llmVideoVision && 'translate-x-[18px]',
                    )}
                  />
                </button>
              </div>
            </div>

            {/* LLM Model Selector (правка 48); key — перечитывание после сброса (правка 54) */}
            <LlmModelSelector key={`llm-${resetTick}`} />


            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              {"\n              Max. The response length is calculated automatically from the context.\n              Applies the next time the model is run.\n              When generating video, GPU mode automatically gives up memory.\n            "}</p>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveLlm()}
              disabled={saving}
              className="w-full"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}

        {/* ─────────── Voice input (правка 65) ─────────── */}
        {tab === 'voice' && <VoiceSettingsPanel />}

        {/* ─────────── Optimization ─────────── */}
        {tab === 'optimization' && (
          <div className="space-y-5 py-2">
            {/* ── ComfyUI GPU memory (config.ini, applied at restart) ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CpuIcon className="w-4 h-4 text-amber-400" />
                {"\n                GPU memory (ComfyUI)\n              "}</div>
              <p className="text-[11px] text-muted-foreground/70 -mt-1.5">
                {"\n                Reserve and dynamic management of VRAM ComfyUI. Applies on restart.\n              "}</p>

              <div className="space-y-1.5 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{"VRAM Reserve"}</span>
                  <span className="text-xs font-mono">{reserveVram} GB</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={0.5}
                  value={reserveVram}
                  onChange={(e) => setReserveVram(parseFloat(e.target.value))}
                  className="w-full h-2 cursor-pointer accent-amber-400"
                />
                {/* Позиции по реальной шкале 1–8: 4 GB стоит на ~43%, а не
                    в центре (justify-between его прижимал к 50% и врал) */}
                <div className="relative h-3 text-[9px] text-muted-foreground/50">
                  <span className="absolute left-0">1 GB</span>
                  <span className="absolute" style={{ left: '43%' }}>4 GB</span>
                  <span className="absolute right-0">8 GB</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground">Dynamic VRAM</span>
                    <p className="text-[10px] text-muted-foreground/60">
                      {"\n                      Dynamic VRAM management ComfyUI\n                    "}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDynamicVram(!dynamicVram)}
                    className={cn(
                      'relative w-10 h-5.5 rounded-full transition-colors shrink-0',
                      dynamicVram ? 'bg-emerald-500/70' : 'bg-[var(--surface-4)]',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform',
                        dynamicVram && 'translate-x-[18px]',
                      )}
                    />
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                {"\n                Applies when restarting ComfyUI - after saving, restart the studio (start.bat).\n              "}</p>
            </div>

            {/* ── Generation optimizations (per-generation workflow params, applied immediately) ── */}
            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex items-center gap-2 text-sm font-medium">
                <SlidersHorizontalIcon className="w-4 h-4 text-emerald-400" />
                {"\n                Generation Optimization (VRAM)\n              "}</div>
              <p className="text-[11px] text-muted-foreground/70 -mt-1.5">
                {"\n                Memory saving modes for generation nodes. Applies to all new\n                generations immediately - without restarting ComfyUI.\n              "}</p>

              {/* Low VRAM Attention */}
              <div className="space-y-1.5 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground">Low VRAM Attention</span>
                    <p className="text-[10px] text-muted-foreground/60">
                      {"\n                      Attention in chunks of 4 heads - saves video memory\n                    "}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={video.lowVramAttention}
                    onClick={() => patchVideo({ lowVramAttention: !video.lowVramAttention })}
                    className={cn(
                      'relative w-10 h-5.5 rounded-full transition-colors shrink-0',
                      video.lowVramAttention ? 'bg-emerald-500/70' : 'bg-[var(--surface-4)]',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform',
                        video.lowVramAttention && 'translate-x-[18px]',
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Chunk FeedForward + settings */}
              <div className="space-y-1.5 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground">Chunk FeedForward</span>
                    <p className="text-[10px] text-muted-foreground/60">
                      {"\n                      FeedForward in chunks on long sequences - saves VRAM\n                    "}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={video.chunkFeedForward}
                    onClick={() => patchVideo({ chunkFeedForward: !video.chunkFeedForward })}
                    className={cn(
                      'relative w-10 h-5.5 rounded-full transition-colors shrink-0',
                      video.chunkFeedForward ? 'bg-emerald-500/70' : 'bg-[var(--surface-4)]',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform',
                        video.chunkFeedForward && 'translate-x-[18px]',
                      )}
                    />
                  </button>
                </div>

                {video.chunkFeedForward && (
                  <div className="space-y-3 pl-3 border-l border-border/60">
                    <SettingSlider
                      label={"Chunk FF: number of chunks"}
                      value={typeof video.chunkFFChunks === 'number' ? video.chunkFFChunks : 2}
                      onChange={(v) => patchVideo({ chunkFFChunks: Math.round(v) })}
                      min={1}
                      max={8}
                      step={1}
                    />
                    <SettingSlider
                      label={"Chunk FF: length threshold"}
                      value={typeof video.chunkFFThreshold === 'number' ? video.chunkFFThreshold : 4096}
                      onChange={(v) => patchVideo({ chunkFFThreshold: Math.round(v) })}
                      min={1024}
                      max={16384}
                      step={512}
                    />
                  </div>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveOptimization()}
              disabled={saving}
              className="w-full"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}

        {/* ─────────── ComfyUI ─────────── */}
        {tab === 'comfy' && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ServerIcon className="w-4 h-4" />
              ComfyUI
            </div>
            <p className="text-[11px] text-muted-foreground/70 -mt-2">
              {"\n              Information about running ComfyUI and devices.\n            "}</p>

            <div className="space-y-2 pt-2 border-t border-border text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{"Status:"}</span>
                {connected ? (
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
                    <CheckCircleIcon className="w-3 h-3" />
                    {"\n                    Connected\n                  "}</Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircleIcon className="w-3 h-3" />
                    {"\n                    Not available\n                  "}</Badge>
                )}
              </div>
              {connected && stats && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{"ComfyUI version:"}</span>
                    <span>{stats.system?.comfyui_version || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Python:</span>
                    <span>{stats.system?.python_version || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{"Built-in Python:"}</span>
                    <span>{stats.system?.embedded_python ? "yes" : "no"}</span>
                  </div>
                  {stats.devices?.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GPU:</span>
                      <span>{stats.devices[0].name}</span>
                    </div>
                  )}
                  {stats.devices?.[0]?.vram_total && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">VRAM:</span>
                      <span>
                        {((stats.devices[0].vram_free || 0) / 1024 ** 3).toFixed(1)} / {(stats.devices[0].vram_total / 1024 ** 3).toFixed(1)} GB
                      </span>
                    </div>
                  )}
                </>
              )}
              {!connected && (
                <p className="text-xs text-muted-foreground">
                  {"\n                  Make sure ComfyUI is running on port 8188.\n                "}</p>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={checkConnection}
              disabled={loading}
              className="w-full"
            >
              <RefreshCwIcon className={loading ? 'animate-spin' : ''} />
              {"\n              Double check\n            "}</Button>
          </div>
        )}

        {/* ─────────── Manual download links ─────────── */}
        {tab === 'links' && <ManualDownloadPanel />}

        {/* ─────────── Reset (Опасная зона) ─────────── */}
        {tab === 'reset' && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium text-red-400">{"Danger zone"}</span>
            </div>
            <p className="text-[11px] text-muted-foreground/70 -mt-2">
              {"\n              Irreversible operations. Proceed with caution.\n            "}</p>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                  onClick={() => setConfirmAction('reset')}
                >
                  <RotateCcwIcon className="w-3.5 h-3.5" />
                  {"\n                  Reset settings\n                "}</Button>
                <p className="text-[11px] text-muted-foreground/60 pl-1">
                  {"\n                  All parameters (VRAM, LLM, model selection, generation, resolution, steps, sound) will return to default values.\n                "}</p>
              </div>

              <div className="space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                  onClick={() => setConfirmAction('clean')}
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                  {"\n                  Clear cache\n                "}</Button>
                <p className="text-[11px] text-muted-foreground/60 pl-1">
                  {"\n                  Will delete all files from the ComfyUI input folder (references, frames, temporary downloads).\n                "}</p>
              </div>

              <div className="space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-red-400 border-red-500/30 hover:bg-red-500/10"
                  onClick={() => setConfirmAction('delete')}
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  {"\n                  Delete content\n                "}</Button>
                <p className="text-[11px] text-muted-foreground/60 pl-1">
                  {"\n                  Will delete ALL generated videos (output folder), history\n                  assistant chats, history of prompts and CURRENT prompt in the generation field.\n                "}</p>
              </div>

              {/* (правка 130) Заводской сброс — полный сброс «как с завода» */}
              <div className="space-y-1.5 border-t border-border/40 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-red-500 border-red-500/50 bg-red-500/5 hover:bg-red-500/15 font-medium"
                  onClick={() => setConfirmAction('factory')}
                >
                  <SparklesIcon className="w-3.5 h-3.5" />
                  {"\n                  Factory reset (all)\n                "}</Button>
                <p className="text-[11px] text-muted-foreground/60 pl-1">
                  {"\n                  Full factory reset: settings, LoRA (all off, triggers cleared), cache, content, chats, prompts and all local data. To transfer the program to another person.\n                "}</p>
              </div>
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Confirmation dialog */}
    {confirmAction && CONFIRM[confirmAction] && (
      <Dialog open onOpenChange={(v) => { if (!v) setConfirmAction(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangleIcon className="w-5 h-5" />
              {CONFIRM[confirmAction].title}
            </DialogTitle>
            <DialogDescription>
              {CONFIRM[confirmAction].desc}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)} disabled={executing}>
              {"\n              Cancel\n            "}</Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => void executeAction(confirmAction)}
              disabled={executing}
            >
              {executing ? "In progress..." : CONFIRM[confirmAction].button}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  )
}

/* ─── Manual download links (all models: URLs + target paths) ─── */

function ManualDownloadPanel() {
  const [comfyDir, setComfyDir] = useState('')
  const [bonsaiDir, setBonsaiDir] = useState('')

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => {
        setComfyDir(d.comfy_dir || '')
        setBonsaiDir(d.llm_bonsai_dir || '')
      })
      .catch(() => {
        setComfyDir('')
        setBonsaiDir('')
      })
  }, [])

  const comfyModelsRoot = comfyDir ? `${comfyDir}\\ComfyUI\\models\\` : '<ComfyUI-Easy-Install>\\ComfyUI\\models\\'
  const bonsaiModelsRoot = bonsaiDir ? `${bonsaiDir}\\` : '<Bonsai_2_27B>\\'

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied`)
    } catch {
      toast.error("Failed to copy")
    }
  }

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <LinkIcon className="w-4 h-4 text-cyan-400" />
        {"\n        Manual loading of models\n      "}</div>
      <p className="text-[11px] text-muted-foreground/70 -mt-1 leading-relaxed">
        {"\n        If downloading from the application does not work (for example, huggingface.co is not available) -\n        download the files manually using direct links and place them in the specified paths.\n        The application will pick them up automatically.\n      "}</p>

      {/* Models root paths */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 p-2 rounded-md bg-[var(--surface-2)] border border-border">
          <FolderOpenIcon className="w-4 h-4 text-amber-400 shrink-0" />
          <code className="flex-1 min-w-0 text-[10px] font-mono text-foreground/80 break-all">
            ComfyUI: {comfyModelsRoot}
          </code>
          <button
            type="button"
            onClick={() => void copy(comfyModelsRoot, "Path")}
            className="p-1 rounded hover:bg-[var(--surface-3)] text-muted-foreground hover:text-foreground shrink-0"
            title={"Copy path"}
          >
            <CopyIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-md bg-[var(--surface-2)] border border-border">
          <FolderOpenIcon className="w-4 h-4 text-violet-400 shrink-0" />
          <code className="flex-1 min-w-0 text-[10px] font-mono text-foreground/80 break-all">
            Bonsai: {bonsaiModelsRoot}
          </code>
          <button
            type="button"
            onClick={() => void copy(bonsaiModelsRoot, "Path")}
            className="p-1 rounded hover:bg-[var(--surface-3)] text-muted-foreground hover:text-foreground shrink-0"
            title={"Copy path"}
          >
            <CopyIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {MODEL_CATEGORIES.map(({ key, label }) => {
        const models = MODELS.filter((m) => m.category === key)
        if (!models.length) return null
        return (
          <div key={key} className="space-y-1.5 pt-2 border-t border-border">
            <div className="text-[11px] font-medium text-foreground/80">{label}</div>
            {models.map((m) => {
              const isBonsai = m.target === 'bonsai'
              const fullRoot = isBonsai ? bonsaiModelsRoot : comfyModelsRoot
              const fullPath = fullRoot + m.relPath
              return (
              <div
                key={m.id}
                className="p-2 rounded-md bg-[var(--surface-2)]/60 border border-border space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-foreground/90 truncate" title={m.label}>
                    {m.label}
                  </span>
                  <Badge variant="secondary" className="text-[9px] shrink-0">{m.sizeLabel}</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 min-w-0 text-[10px] font-mono text-cyan-300/80 truncate" title={fullPath}>
                    {fullPath}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copy(fullPath, "Path")}
                    className="p-0.5 rounded hover:bg-[var(--surface-3)] text-muted-foreground hover:text-foreground shrink-0"
                    title={"Copy full path"}
                  >
                    <CopyIcon className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-w-0 text-[10px] text-muted-foreground hover:text-cyan-300 truncate underline decoration-dotted underline-offset-2"
                    title={m.url}
                  >
                    {m.url.replace('?download=true', '')}
                  </a>
                  <button
                    type="button"
                    onClick={() => void copy(m.url, 'URL')}
                    className="p-0.5 rounded hover:bg-[var(--surface-3)] text-muted-foreground hover:text-foreground shrink-0"
                    title={"Copy link"}
                  >
                    <CopyIcon className="w-3 h-3" />
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        )
      })}

      <p className="text-[10px] text-muted-foreground/60 leading-relaxed pt-1">
        {"\n        The file name must match exactly (the browser sometimes adds “(1)” - rename).\n        If huggingface.co does not open, replace the domain in the link with"}{' '}
        <code className="text-cyan-300/80">hf-mirror.com</code>{". After downloading\n        check the file size (see badge) - a smaller size means the download is interrupted.\n      "}</p>
    </div>
  )
}

/* ─── Theme Switcher ─── */

/** (правка 111) `first` — первый блок вкладки «Внешний вид»: без верхней границы. */
function ThemeSwitcher({ first = false }: { first?: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="h-10" />

  const btnBase = 'flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all'
  const btnActive = 'border-cyan-500/50 bg-cyan-500/10 text-foreground'
  const btnIdle = 'border-border text-muted-foreground hover:border-border/80'

  return (
    <div className={cn('space-y-2', !first && 'pt-2 border-t border-border')}>
      <div className="flex items-center gap-2">
        <SunIcon className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium">{"Theme"}</span>
      </div>
      {/* (правка 98) Светлая тема удалена — только тёмные (серая/чёрная). */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTheme('dark-gray')}
          className={cn(btnBase, theme === 'dark-gray' ? btnActive : btnIdle)}
        >
          <MoonIcon className="w-4 h-4" />
          {"\n          Gray\n        "}</button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          className={cn(btnBase, theme === 'dark' ? btnActive : btnIdle)}
        >
          <MoonIcon className="w-4 h-4" />
          {"\n          Black\n        "}</button>
      </div>
    </div>
  )
}
