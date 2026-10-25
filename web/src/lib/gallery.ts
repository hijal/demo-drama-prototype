import { writable } from 'svelte/store'
import { api } from './api'
import { useGenProgress } from '@/lib/gen-progress-store'
import { useGalleryRefresh } from '@/lib/gallery-refresh-store'
export interface GalleryFile {
  filename: string
  subfolder: string
  url: string
  mtime?: number
  generationTime?: number | null
}
export const gallery = writable<{
  files: GalleryFile[]
  folders: string[]
  loading: boolean
  error: string
}>({ files: [], folders: [], loading: true, error: '' })
let sequence = 0
export async function loadGallery() {
  const current = ++sequence
  try {
    const data = await api('/api/comfy/files?type=all')
    if (current !== sequence) return
    gallery.set({
      folders: Array.isArray(data.folders) ? data.folders : [],
      files: (data.files ?? [])
        .filter(
          (f: any) =>
            f.type?.startsWith('video') ||
            /\.(mp4|webm|mov|m4v)$/i.test(f.filename || f.name || ''),
        )
        .map((f: any) => ({
          ...f,
          filename: f.filename || f.name,
          subfolder: f.subfolder || '',
        })),
      loading: false,
      error: '',
    })
  } catch (error) {
    if (current === sequence)
      gallery.update((s) => ({
        ...s,
        loading: false,
        error: error instanceof Error ? error.message : 'Gallery unavailable',
      }))
  }
}
export function startGallery() {
  let disposed = false
  let inFlight = false
  const delayed = new Set<ReturnType<typeof setTimeout>>()
  const refresh = async () => {
    if (disposed || inFlight) return
    inFlight = true
    try {
      await loadGallery()
    } finally {
      inFlight = false
    }
  }
  void refresh()
  const timer = setInterval(() => {
    if (
      ['submitting', 'queued', 'running'].includes(
        useGenProgress.getState().video.phase,
      )
    )
      void refresh()
  }, 2500)
  const unsub = useGenProgress.subscribe((s, old) => {
    if (s.video.phase === 'done' && old.video.phase !== 'done')
      for (const delay of [500, 2000, 6000, 12000]) {
        const t = setTimeout(() => {
          delayed.delete(t)
          void refresh()
        }, delay)
        delayed.add(t)
      }
  })
  const unsubRefresh = useGalleryRefresh.subscribe(() => void refresh())
  return () => {
    disposed = true
    sequence++
    clearInterval(timer)
    delayed.forEach(clearTimeout)
    unsub()
    unsubRefresh()
  }
}
