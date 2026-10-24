/**
 * Папки галереи (правка 91) — подпапки каталога вывода ComfyUI.
 *
 * «Общая» папка = корень output (subfolder ''), она есть всегда. Любая
 * непустая/созданная подпапка первого уровня = проектная папка: генерацию
 * можно направить в неё (VHS filename_prefix «folder/Minimax_Studio»),
 * а галерея «Галерея» показывает все папки сразу.
 *
 * Один уровень вложенности: subfolder — всегда ОДНО имя (basename),
 * без слэшей — так проще гарантировать отсутствие path traversal.
 */
import { promises as fs } from 'fs'
import path from 'path'
import { getAppConfig } from './app-config'

/** Максимальная длина имени папки (защита от экзотики в URL/файловой системе). */
const MAX_NAME_LEN = 60

/** Санитизировать имя папки: один сегмент, без недопустимых символов.
 *  Имена, начинающиеся с точки ('.', '..', скрытые), отбрасываются —
 *  иначе '..' уводил путь из output в корень ComfyUI. */
export function sanitizeFolderName(name: string): string {
  const safe = path
    .basename(String(name ?? ''))
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LEN)
  return safe.startsWith('.') ? '' : safe
}

/** Путь к подпапке внутри output (гарантированно один уровень). */
export function folderPath(folder: string): string {
  const root = path.resolve(getAppConfig().outputDir)
  const safe = sanitizeFolderName(folder)
  if (!safe) return root
  const dir = path.resolve(root, safe)
  if (path.dirname(dir) !== root) throw new Error(`Folder path escapes output: ${folder}`)
  return dir
}

/** Список папок проекта (подпапки первого уровня в output). Отсортирован. */
export async function listGalleryFolders(): Promise<string[]> {
  const root = getAppConfig().outputDir
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'ru'))
  } catch {
    return []
  }
}

/** Создать папку. Возвращает ошибку для конфликтов/пустого имени. */
export async function createGalleryFolder(name: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const safe = sanitizeFolderName(name)
  if (!safe) return { ok: false, error: "Enter a folder name" }
  const dir = folderPath(safe)
  try {
    await fs.mkdir(dir, { recursive: false })
    return { ok: true, name: safe }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EEXIST') return { ok: false, error: `Folder "${safe}» already exists` }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** (правка 122) Переименовать папку. Файлы и .meta.json сайдкары
 *  остаются в папке (она просто сменит имя на диске). */
export async function renameGalleryFolder(
  oldName: string,
  newName: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const fromSafe = sanitizeFolderName(oldName)
  const toSafe = sanitizeFolderName(newName)
  if (!fromSafe) return { ok: false, error: "Invalid folder name" }
  if (!toSafe) return { ok: false, error: "Enter a new folder name" }
  if (fromSafe === toSafe) return { ok: true, name: toSafe }
  const srcDir = folderPath(fromSafe)
  const dstDir = folderPath(toSafe)
  try {
    await fs.access(dstDir)
    return { ok: false, error: `Folder "${toSafe}» already exists` }
  } catch { /* целевой папки нет — ок */ }
  try {
    await fs.rename(srcDir, dstDir)
    return { ok: true, name: toSafe }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { ok: false, error: `Folder "${fromSafe}» not found` }
    if (code === 'ENOTEMPTY' || code === 'EEXIST') {
      return { ok: false, error: `Folder "${toSafe}» already exists` }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Удалить папку (только пустую — видео не теряются молча). */
export async function deleteGalleryFolder(name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const safe = sanitizeFolderName(name)
  if (!safe) return { ok: false, error: "Invalid folder name" }
  const dir = folderPath(safe)
  try {
    const entries = await fs.readdir(dir)
    // Осиротевшие .meta.json-сайдкары (видео удалено внешне) не считаем
    // содержимым — папку с одними сайдкарами можно удалить.
    const visible = entries.filter((e) => !e.startsWith('.') && !e.endsWith('.meta.json'))
    if (visible.length > 0) {
      return { ok: false, error: `Folder "${safe}» is not empty (${visible.length} files). Move or delete them.` }
    }
    await fs.rm(dir, { recursive: true })
    return { ok: true }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { ok: true }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Переместить файл вывода (вместе с .meta.json сайдкаром и VHS-мусором)
 * между подпапками. from/to — имена папок ('' = общая).
 */
export async function moveOutputFile(
  filename: string,
  from: string,
  to: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const safeName = path.basename(String(filename ?? ''))
  if (!safeName || safeName.startsWith('.')) return { ok: false, error: "Invalid file name" }
  const fromSafe = sanitizeFolderName(from)
  const toSafe = sanitizeFolderName(to)
  if (fromSafe === toSafe) return { ok: true }

  const srcDir = folderPath(fromSafe)
  const dstDir = folderPath(toSafe)
  try {
    await fs.mkdir(dstDir, { recursive: true })
    for (const candidate of [safeName, `${safeName}.meta.json`]) {
      const src = path.join(srcDir, candidate)
      const dst = path.join(dstDir, candidate)
      try {
        await fs.rename(src, dst)
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code !== 'ENOENT') throw err // meta может отсутствовать — ок
      }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
