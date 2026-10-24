'use client'

/**
 * ModelsWarningBanner — показывает предупреждение вверху контента,
 * если одна или несколько моделей не скачаны.
 *
 * - Загружает /api/models/status при монтировании.
 * - Собирает модели со статусом 'missing' или 'error' (не 'ready', не 'downloading').
 * - Если есть — показывает жёлтый баннер с кнопкой «Скачать в настройках».
 * - Скрывается крестиком (до перезагрузки страницы).
 */
import { useState, useEffect } from 'react'
import { AlertTriangleIcon, XIcon, DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ModelStatusItem {
  id: string
  label: string
  status: string
  relPath: string
  /** (правка 162) optional: true — модель не обязательна (баннер не требует) */
  optional?: boolean
}

interface ModelsWarningBannerProps {
  onOpenSettings: () => void
}

export function ModelsWarningBanner({ onOpenSettings }: ModelsWarningBannerProps) {
  const [missing, setMissing] = useState<ModelStatusItem[]>([])
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const check = () => {
      fetch('/api/models/status')
        .then((statusRes) => statusRes.json())
        .then((data) => {
          const notReady = (data.models ?? []).filter((m: ModelStatusItem) => {
            if (m.status === 'ready' || m.status === 'downloading') return false
            // (правка 162) Опциональные модели не требуются
            if (m.optional) return false
            return true
          })
          setMissing(notReady)
        })
        .catch(() => {
          /* API недоступен — не показываем баннер */
        })
        .finally(() => setLoading(false))
    }
    check()
    // Периодический перерасчёт: раньше баннер вычислялся один раз на маунте
    // и оставался устаревшим, когда пользователь менял/докачивал модели
    // в настройках (до перезагрузки страницы).
    const t = setInterval(check, 15_000)
    return () => clearInterval(t)
  }, [])

  if (loading || dismissed || missing.length === 0) return null

  const label =
    missing.length === 1
      ? `Model not downloaded: ${missing[0].label}`
      : missing.length === 2
        ? `Models not downloaded: ${missing.map((m) => m.label).join(', ')}`
        : `No models downloaded: ${missing.length}. Generation will not work correctly.`

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
      <AlertTriangleIcon className="w-4 h-4 text-amber-400 shrink-0" />
      <span className="text-xs text-amber-300 flex-1 min-w-0 truncate" title={label}>
        {label}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-[11px] text-amber-300 border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-200 shrink-0"
        onClick={onOpenSettings}
      >
        <DownloadIcon className="w-3 h-3" />
        {"\n        Download in settings\n      "}</Button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="p-1 rounded hover:bg-amber-500/20 text-amber-400/70 hover:text-amber-300 shrink-0"
        title={"Hide"}
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}