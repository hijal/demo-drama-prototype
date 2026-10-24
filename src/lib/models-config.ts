/**
 * Model registry — defines all required models with their download URLs
 * and target paths relative to the ComfyUI root.
 */

export interface ModelDef {
  id: string
  label: string
  /** Relative path from ComfyUI root (e.g. "diffusion_models/xxx.safetensors") */
  relPath: string
  /** Direct download URL */
  url: string
  /** Approximate file size in bytes (for display) */
  sizeBytes: number
  /** Human-readable size */
  sizeLabel: string
  /** Category for grouping in UI */
  category: 'diffusion' | 'text_encoder' | 'vae' | 'lora' | 'upscaler' | 'preview'
  /** (правка 138 / Bonsai) URL указывает на ZIP: после скачивания извлечь
   *  ТОЛЬКО эти файлы (рекурсивный поиск по архиву) в каталог relPath. */
  extractFiles?: string[]
  /** (правка 138) Опциональная модель: панель показывает, но «Скачать все»
   *  НЕ тянет (лишние гигабайты без ведома пользователя). */
  optional?: boolean
}

function gb(n: number): number {
  return Math.round(n * 1024 * 1024 * 1024)
}

export const MODELS: ModelDef[] = [
  {
    id: 'diffusion',
    // (правка 159) Основная модель — FastVideo VSA DataFree 1300-step 4-step int8 convrot
    // (Kijai/MiniMax-H3-experimental). Быстрая 4-шаговая генерация, ~22.9 ГБ.
    label: 'Diffusion Model (FastVideo VSA DataFree 1300-step 4-step int8 convrot)',
    relPath: 'diffusion_models/minimax_h3_fastvideo_vsa_datafree_1300step_4step_int8_convrot.safetensors',
    url: 'https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main/minimax_h3_fastvideo_vsa_datafree_1300step_4step_int8_convrot.safetensors?download=true',
    sizeBytes: gb(22.9),
    sizeLabel: '~22.9 GB',
    category: 'diffusion',
  },
  {
    id: 'text_encoder',
    label: 'Text Encoder (Qwen3VL 32B NVFP4)',
    relPath: 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
    url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors?download=true',
    sizeBytes: gb(15.7),
    sizeLabel: '~15.7 GB',
    category: 'text_encoder',
  },
  {
    id: 'vae_video',
    label: 'Video VAE (INT8 ConvRot)',
    relPath: 'vae/minimax_h3_video_vae_int8_convrot.safetensors',
    url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_int8_convrot.safetensors?download=true',
    sizeBytes: gb(2.6),
    sizeLabel: '~2.6 GB',
    category: 'vae',
  },
  {
    id: 'vae_audio',
    label: 'Audio VAE (FP32)',
    relPath: 'vae/minimax_h3_audio_vae_fp32.safetensors',
    url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors?download=true',
    sizeBytes: gb(0.6),
    sizeLabel: '~0.6 GB',
    category: 'vae',
  },
  {
    id: 'lora_turbo',
    label: 'Turbo LoRA (4-step v0.1)',
    relPath: 'loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors?download=true',
    sizeBytes: 1956193000,
    sizeLabel: '~1.9 GB',
    category: 'lora',
  },
  {
    id: 'upscaler',
    label: 'Latent Upscaler 3D (FP16)',
    relPath: 'latent_upscale_models/minimax_h3_latent_upscaler_3d_fp16.safetensors',
    url: 'https://huggingface.co/LBH-123-AI/Minimax_h3_latent_Upscaler/resolve/main/minimax_h3_latent_upscaler_3d_conv_v1/minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors?download=true',
    sizeBytes: 691 * 1024 * 1024,
    sizeLabel: '~691 MB',
    category: 'upscaler',
  },
  {
    id: 'tae_preview',
    label: 'TAE Preview Decoder (taeh3)',
    relPath: 'vae_approx/taeh3.safetensors',
    url: 'https://huggingface.co/Kijai/MiniMax-H3-TAE/resolve/main/vae_approx/taeh3.safetensors?download=true',
    sizeBytes: 9_790_000,
    sizeLabel: '~9.8 MB',
    category: 'preview',
  },
]

/** Group by category for UI display */
export const MODEL_CATEGORIES: { key: ModelDef['category']; label: string }[] = [
  { key: 'diffusion', label: 'Diffusion Model' },
  { key: 'text_encoder', label: 'Text Encoder' },
  { key: 'vae', label: 'VAE' },
  { key: 'lora', label: 'LoRA' },
  { key: 'upscaler', label: 'Upscaler' },
  { key: 'preview', label: 'Preview' },
]
