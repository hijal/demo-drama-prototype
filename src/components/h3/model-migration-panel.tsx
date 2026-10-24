'use client'

/**
 * Migration from an old version of the app: models + generated content +
 * assistant chats (правка 47, 64; правка 74).
 *
 * (правка 74) Все три категории переносятся одним способом: выбирается папка
 * старой версии, программа ищет внутри папку "models" (модели), папку "output"
 * (контент) и файл "assistant-chats.json" (чаты) и переносит их в текущую
 * установку. Экспорт/импорт чатов в JSON удалён — он больше не нужен.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  FolderOpenIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { reloadAssistantChats } from '@/lib/assistant-chats-sync'

interface CategoryResult {
  enabled: boolean
  found: boolean
  dir: string | null
  file?: string | null
  moved: number
  skipped: number
  errors: string[]
}

interface MigrateResult {
  models: CategoryResult
  content: CategoryResult
  chats: CategoryResult
}

export function ModelMigrationPanel() {
  const [expanded, setExpanded] = useState(false)
  const [sourceDir, setSourceDir] = useState('')
  const [migrating, setMigrating] = useState(false)
  // Выбор категорий переноса (правки 64/74)
  const [selModels, setSelModels] = useState(true)
  const [selContent, setSelContent] = useState(true)
  const [selChats, setSelChats] = useState(true)
  const [result, setResult] = useState<MigrateResult | null>(null)

  const nothingSelected = !selModels && !selContent && !selChats

  const handleMigrate = async () => {
    if (!sourceDir.trim()) {
      toast.error("Specify the path to the old version folder.")
      return
    }
    if (nothingSelected) {
      toast.error("Choose what to transfer: models, content and/or chats.")
      return
    }

    setMigrating(true)
    setResult(null)
    try {
      const res = await fetch('/api/models/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDir: sourceDir.trim(),
          items: { models: selModels, content: selContent, chats: selChats },
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Transfer error.")
      } else {
        setResult(data as MigrateResult)
        const parts: string[] = []
        for (const [cat, label] of [
          [data.models, "Models"],
          [data.content, "Content"],
          [data.chats, "Chats"],
        ] as const) {
          if (!cat.enabled) continue
          if (cat.found) {
            parts.push(`${label}: moved ${cat.moved}, missing (already exists) ${cat.skipped}`)
          } else {
            parts.push(`${label}: not found`)
          }
        }
        const errCount = data.models.errors.length + data.content.errors.length + data.chats.errors.length
        const allFound = [data.models, data.content, data.chats].every((c) => !c.enabled || c.found)
        const msg = parts.join(' · ')
        if (allFound && errCount === 0) {
          toast.success(msg)
        } else {
          toast.warning(msg + (errCount > 0 ? ` · Errors: ${errCount}` : ''))
        }

        // (правка 74) Чаты перенесены — подгружаем их в UI (вкладка «Ассистент»)
        if (data.chats.enabled && data.chats.found && data.chats.moved > 0) {
          await reloadAssistantChats()
        }
      }
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      {/* Toggle button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setExpanded((v) => !v)}
        disabled={migrating}
      >
        <FolderOpenIcon className="w-3.5 h-3.5" />
        {"\n        Transfer from the old version (models, content, chats)\n        "}{expanded ? (
          <span className="ml-auto text-xs text-muted-foreground">↑</span>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">↓</span>
        )}
      </Button>

      {/* Expanded form */}
      {expanded && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{"Old version folder"}</label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 justify-start text-left font-normal"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/dialog/folder', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title: "Select the folder with the old version of the program" }),
                    })
                    const data = await res.json()
                    if (!res.ok) {
                      toast.error(data.error || "Failed to open folder selection dialog.")
                      return
                    }
                    if (data.path) {
                      setSourceDir(data.path)
                    }
                  } catch {
                    toast.error("Failed to open folder selection dialog.")
                  }
                }}
                disabled={migrating}
              >
                <FolderOpenIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                <span className={cn('truncate', !sourceDir && 'text-muted-foreground/50')}>
                  {sourceDir || "Select folder..."}
                </span>
              </Button>
            </div>
          </div>

          {/* (правки 64/74) Выбор категорий переноса */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{"What to transfer"}</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selModels}
                  onChange={(e) => setSelModels(e.target.checked)}
                  disabled={migrating}
                />
                {"\n                Models\n              "}</label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selContent}
                  onChange={(e) => setSelContent(e.target.checked)}
                  disabled={migrating}
                />
                {"\n                Content (generated videos)\n              "}</label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selChats}
                  onChange={(e) => setSelChats(e.target.checked)}
                  disabled={migrating}
                />
                {"\n                Assistant chats\n              "}</label>
            </div>
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={handleMigrate}
            disabled={migrating || nothingSelected}
          >
            {migrating ? (
              <>
                <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                {"\n                Transfer...\n              "}</>
            ) : (
              <>
                <ArrowRightIcon className="w-3.5 h-3.5" />
                {"\n                Start transfer\n              "}</>
            )}
          </Button>

          <p className="text-[10px] text-muted-foreground/50">
            {"\n            The program will find in the selected folder the \"models\" folder, the \"output\" folder\n            (generated videos with metadata) and \"assistant-chats.json\" file\n            (assistant chats) - up to 3 levels of depth. All this will move to the current\n            installation. Already existing files and chats will be skipped, nothing\n            is overwritten.\n          "}</p>

          {/* Result panels — по одной карточке на категорию */}
          {result && (
            <div className="space-y-2">
              <CategoryCard label={"Models"} cat={result.models} unit={"files"} />
              <CategoryCard label={"Content"} cat={result.content} unit={"files"} />
              <CategoryCard label={"Assistant chats"} cat={result.chats} unit={"chats"} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Карточка результата переноса одной категории. */
function CategoryCard({ label, cat, unit = "files" }: { label: string; cat: CategoryResult; unit?: string }) {
  if (!cat.enabled) return null

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-sm">
        {cat.found ? (
          <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
        ) : (
          <AlertTriangleIcon className="w-4 h-4 text-amber-500" />
        )}
        <span className="font-medium">{label}</span>
        <span className={cn('ml-auto text-xs', cat.found ? 'text-emerald-500' : 'text-amber-500')}>
          {cat.found ? "Done" : "Not found"}
        </span>
      </div>

      {cat.found ? (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {(cat.file || cat.dir) && (
            <p className="break-all">
              {cat.file ? "File: " : "Folder: "}
              <code className="text-[11px]">{cat.file ?? cat.dir}</code>
            </p>
          )}
          <p>
            {"\n            Transferred "}{unit}: <span className="text-emerald-400 font-medium">{cat.moved}</span>
            {' · '}
            {"\n            Missed (already available): "}<span className="text-amber-400 font-medium">{cat.skipped}</span>
          </p>
          {cat.errors.length > 0 && (
            <>
              <p className="text-red-400">{"Errors: "}{cat.errors.length}</p>
              <ul className="list-disc pl-4 space-y-0.5 max-h-24 overflow-y-auto">
                {cat.errors.map((e, i) => (
                  <li key={i} className="text-red-300/80 text-[11px] break-all">{e}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        cat.errors.length > 0 && (
          <p className="text-xs text-amber-400">{cat.errors[0]}</p>
        )
      )}
    </div>
  )
}
