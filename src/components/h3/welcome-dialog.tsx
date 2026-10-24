'use client'

/**
 * (правка 112) WelcomeDialog — всплывающее окно при первом запуске.
 * (правка 113) Галочка «Больше не показывать»: флаг пишется ТОЛЬКО если
 * галочка стоит; без галочки окно показывается при каждом запуске.
 * Окно сделано крупнее и красивее: градиентная шапка (aurora-bg),
 * карточки шагов, акцент приложения (gradient-creative).
 *
 * Краткая инструкция, как начать работать с программой:
 *   1. Настройки → «Общие» → скачать модели (единоразово);
 *   2. «Генерация» → промпт → «Сгенерировать видео»;
 *   3. Результат попадает в «Галерею», апскейл — в «Upscale».
 * Более детальная информация — на вкладке «Обучение» (кнопка-ссылка).
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { SparklesIcon, SettingsIcon, GraduationCapIcon, XIcon, ArrowRightIcon, AlertTriangleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WelcomeDialogProps {
  /**
   * Закрыть окно. dontShowAgain=true — пометить как «не показывать»
   * (флаг делает родитель); false — закрыть, но при следующем запуске
   * показать снова (правка 113).
   */
  onClose: (dontShowAgain: boolean) => void
  /** Закрыть окно и открыть диалог настроек (скачать модели). */
  onOpenSettings: (dontShowAgain: boolean) => void
  /** Закрыть окно и перейти на вкладку «Обучение». */
  onGoLearn: (dontShowAgain: boolean) => void
}

interface StepDef {
  title: string
  text: string
}

function Step({ n, title, text }: { n: number } & StepDef) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-[var(--surface-2)] px-3.5 py-3">
      <span className="w-7 h-7 rounded-lg gradient-creative text-white text-[13px] font-bold flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/20">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{text}</p>
      </div>
    </div>
  )
}

export function WelcomeDialog({ onClose, onOpenSettings, onGoLearn }: WelcomeDialogProps) {
  // (правка 113) «Больше не показывать» — по умолчанию снята:
  // без галочки окно будет появляться при каждом запуске.
  const [hideForever, setHideForever] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => onClose(hideForever)}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-lg max-h-[85vh] rounded-2xl border border-border bg-[var(--surface-3)] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Градиентная планка-акцент (идентичность H3 Studio) */}
        <div className="h-1.5 gradient-creative shrink-0" />

        {/* Header (правка 113 — крупнее, aurora-bg как в шапках вкладок) */}
        <div className="aurora-bg overflow-hidden flex items-center gap-3.5 px-5 pt-4 pb-3.5 border-b border-border shrink-0">
          <span className="w-12 h-12 rounded-2xl gradient-creative flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/25">
            <SparklesIcon className="w-6 h-6 text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground leading-tight">
              {"\n              Welcome to "}<span className="gradient-creative-text">MiniMax H3 Studio</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {"\n              Generate video with sound - directly on your video card\n            "}</p>
          </div>
          <button
            type="button"
            onClick={() => onClose(hideForever)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--surface-2)] transition-colors shrink-0"
            title={"Close"}
          >
            <XIcon className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Steps (краткая инструкция, правка 113 — карточки) */}
        <div className="px-5 py-4 space-y-2.5 overflow-y-auto">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium">
            {"\n            Three steps to get started\n          "}</p>
          <Step
            n={1}
            title={"Download models"}
            text={"Settings (gear at the bottom of the sidebar) → “General” → “Download all”. Download once; you can then work offline."}
          />
          <Step
            n={2}
            title={"Generate your first video"}
            text={"“Generate” tab: select the mode (Text / Frames / References), describe the scene (or ask the Assistant), select the resolution and duration - “Generate video”."}
          />
          <Step
            n={3}
            title={"See the result"}
            text={"Finished videos are saved in the “Gallery”; use the “Upscale” tab to enhance them."}
          />

          {/* (правка 132) Предупреждение про файл подкачки — частая причина ошибок */}
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3.5 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangleIcon className="w-4 h-4 text-amber-400" />
              </span>
              <p className="text-[13px] font-semibold text-amber-300">{"Important: increase the page file"}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {"\n              To run the program, you need a large swap file (virtual memory). If it is small, the program may display an “out of memory” error.\n            "}</p>
            <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[11px] text-foreground/80 leading-relaxed space-y-1">
              <p className="font-medium text-foreground">{"How to increase:"}</p>
              <p>1. Win + R → <code className="font-mono bg-[var(--surface-3)] px-1 rounded">sysdm.cpl</code> → Enter</p>
              <p>{"2. “Advanced” tab → “Performance” → “Options” → “Virtual memory” → “Change”"}</p>
              <p>{"3. Uncheck “Automatically detect”"}</p>
              <p>{"4. Select the disk, field “Maximum size (MB)” = 32768 (or more)"}</p>
              <p>{"5. “Install” → “OK” → "}<b>{"restart PC"}</b></p>
            </div>
          </div>

          {/* Ссылка на подробный тур (правка 113 — ярче) */}
          <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3.5 py-2.5 flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
              <GraduationCapIcon className="w-4 h-4 text-cyan-300" />
            </span>
            <p className="text-xs text-cyan-100/90 flex-1 min-w-0 leading-relaxed">
              {"\n              Detailed step-by-step tour with pictures - on the tab "}<span className="font-semibold text-cyan-100">{"“Learn”"}</span>
            </p>
            <button
              type="button"
              onClick={() => onGoLearn(hideForever)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-cyan-100 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 transition-colors"
            >
              {"\n              Open\n              "}<ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Footer (правка 113 — галочка «больше не показывать» + кнопки) */}
        <div className="border-t border-border bg-[var(--surface-2)]/40 px-5 py-3.5 space-y-3 shrink-0">
          <label className="flex items-center gap-2.5 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={hideForever}
              onChange={(e) => setHideForever(e.target.checked)}
              className="w-4 h-4 rounded accent-cyan-500 cursor-pointer shrink-0"
            />
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              {"\n              Don't show this window again\n            "}</span>
          </label>
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onOpenSettings(hideForever)}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              {"\n              Open settings\n            "}</Button>
            <Button size="sm" className="flex-1" onClick={() => onClose(hideForever)}>
              {"\n              Got it\n            "}</Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
