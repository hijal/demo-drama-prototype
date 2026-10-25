import { useModelUploadStore } from '@/lib/model-upload-store'
/** XHR lives outside dialogs so closing Settings cannot abort a large upload. */
export function uploadModel(
  file: File,
  target: 'diffusion' | 'lora',
): Promise<void> {
  if (useModelUploadStore.getState().active)
    return Promise.reject(new Error('A model upload is already in progress.'))
  useModelUploadStore.getState().start(target, file.name)
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(
      'POST',
      target === 'diffusion' ? '/api/comfy/diffusion-models' : '/api/loras',
    )
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        useModelUploadStore
          .getState()
          .setProgress((event.loaded / event.total) * 100)
    }
    xhr.onerror = () => reject(new Error('Model upload connection failed'))
    xhr.onabort = () => reject(new Error('Model upload cancelled'))
    xhr.onload = () => {
      let data: any
      try {
        data = JSON.parse(xhr.responseText)
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(data?.error || `Upload failed (${xhr.status})`))
    }
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  }).finally(() => useModelUploadStore.getState().done())
}
