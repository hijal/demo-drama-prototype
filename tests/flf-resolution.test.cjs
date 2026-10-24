const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')

// Exercise the actual restore and submit functions without mounting React or
// contacting ComfyUI. Only browser APIs, hooks and stores are replaced.
function setup(meta = {}) {
  const storage = new Map()
  const submitted = []
  let video = {}
  const queue = {
    items: [],
    enqueue: () => 'queue-1',
    setPromptId() {},
    setStatus() {},
  }
  const progress = {
    video: { phase: 'idle' },
    beginVideoSubmit() {},
    startVideoGen() {},
  }
  const store = { get video() { return video }, patchVideo: patch => { video = { ...video, ...patch } } }
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  const toast = Object.fromEntries(['error', 'warning', 'info', 'success'].map(key => [key, (...args) => {
    if (key === 'error') throw new Error(args.join(' '))
  }]))
  const mocks = {
    react: { useCallback: fn => fn, useEffect() {}, useRef: current => ({ current }) },
    sonner: { toast },
    '@/lib/gen-progress-store': { useGenProgress: Object.assign(() => progress, { getState: () => progress }) },
    '@/lib/gen-queue-store': { useGenQueue: Object.assign(() => queue, { getState: () => queue }) },
    '@/lib/gen-duration-store': {},
    '@/lib/gen-store': { useGenStore: { getState: () => store } },
    '@/lib/sound': {},
    '@/components/h3/video-shared': {
      FALLBACK_H3_PRESETS: { '1080p': { landscape: '1920x1080', portrait: '1080x1920' } },
      collectResolutionValues: presets => Object.values(presets).flatMap(Object.values),
    },
  }
  mocks['./gen-store'] = mocks['@/lib/gen-store']
  mocks.zustand = require('zustand')
  const middleware = require('zustand/middleware')
  mocks['zustand/middleware'] = {
    ...middleware,
    persist: (config, options) => middleware.persist(config, {
      ...options, storage: middleware.createJSONStorage(() => localStorage),
    }),
  }
  const fetch = async (url, options) => {
    if (url === '/api/comfy/generate') {
      submitted.push(JSON.parse(options.body))
      return { ok: true, json: async () => ({ prompt_id: 'prompt-1' }) }
    }
    if (url.startsWith('/api/comfy/meta?')) return { ok: true, json: async () => meta }
    if (options?.method === 'HEAD') return { ok: true }
    throw new Error(`Unexpected request: ${url}`)
  }
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(path.resolve(__dirname, '..', file), 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    })
    const module = { exports: {} }
    const requireModule = id => {
      if (id in mocks) return mocks[id]
      if (id === '@/lib/comfy/minimax-h3-template') return load('src/lib/comfy/minimax-h3-template.ts')
      throw new Error(`Unexpected import: ${id}`)
    }
    const window = { localStorage, dispatchEvent() {} }
    new Function('require', 'module', 'exports', 'window', 'fetch', 'setInterval', 'CustomEvent', outputText)(
      requireModule, module, module.exports, window, fetch, () => 1, class CustomEvent {},
    )
    cache.set(file, module.exports)
    return module.exports
  }
  return {
    load, submitted, store,
    metadata: () => JSON.parse(storage.get('h3_gen_params_v1'))['prompt-1'],
  }
}

test('FLF server-side metadata without flf_resolution repeats exact dimensions', async () => {
  const env = setup({
    prompt: 'A scene', generation_mode: 'flf', resolution: '1620x1080',
    first_frame: 'frame.png', first_frame_width: 1500, first_frame_height: 1000,
  })
  await env.load('src/lib/restore-from-meta.ts').restoreFromMeta('clip.mp4')
  assert.deepEqual(env.store.video.targetDimensions, { width: 1620, height: 1080 })
  assert.equal(env.store.video.freeResolution, false)
})

test('FLF free-resolution output repeats without reinterpreting its aligned pixels', async () => {
  const original = setup()
  await original.load('src/hooks/use-video-gen.ts').useVideoGen().generate({
    modelType: 'minimax_h3', mode: 'flf', prompt: 'A scene', resolution: '1920x1080',
    firstFrame: 'frame.png', firstFrameWidth: 1920, firstFrameHeight: 1080, finalResolution: 0.7,
  })
  const originalWorkflow = original.load('src/lib/comfy/minimax-h3-template.ts').buildMiniMaxH3Workflow(original.submitted[0])
  const expected = outputSize(originalWorkflow)
  assert.equal(original.metadata().resolution, expected)
  assert.equal(original.metadata().flf_resolution, expected)
  const repeated = setup(original.metadata())
  await repeated.load('src/lib/restore-from-meta.ts').restoreFromMeta('clip.mp4')
  const v = repeated.store.video
  await repeated.load('src/hooks/use-video-gen.ts').useVideoGen().generate({
    ...v, modelType: 'minimax_h3', firstFrame: v.startFrame.path,
    firstFrameWidth: v.startFrame.width, firstFrameHeight: v.startFrame.height,
  })
  assert.equal(outputSize(repeated.load('src/lib/comfy/minimax-h3-template.ts').buildMiniMaxH3Workflow(repeated.submitted[0])), expected)
})

test('editing sizing inputs clears restored dimensions, while prompt edits keep them', () => {
  const env = setup()
  const store = env.load('src/lib/gen-store.ts').useGenStore
  const exact = { width: 1620, height: 1080 }
  const restore = () => store.getState().patchVideo({
    mode: 'flf', resolution: '1620x1080', targetDimensions: exact,
    startFrame: { path: 'frame.png', name: 'frame.png', previewUrl: '' },
  })
  restore()
  store.getState().setVideoPrompt('New prompt')
  assert.deepEqual(store.getState().video.targetDimensions, exact)
  store.getState().setVideoResolution('1280x720')
  assert.equal(store.getState().video.targetDimensions, null)
  restore()
  store.getState().setVideoStartFrame({ path: 'other.png', name: 'other.png', previewUrl: '' })
  assert.equal(store.getState().video.targetDimensions, null)
  restore()
  store.getState().patchVideo({ mode: 'ref' })
  assert.equal(store.getState().video.targetDimensions, null)
  restore()
  store.getState().patchVideo({ finalResolution: 0.7 })
  assert.equal(store.getState().video.targetDimensions, null)
})

function outputSize(workflow) {
  const crop = Object.values(workflow).find(node => node.class_type === 'ImageCrop')
  if (crop) return `${crop.inputs.width}x${crop.inputs.height}`
  const upscale = workflow['46:26'].inputs
  return `${upscale['mode.width']}x${upscale['mode.height']}`
}

for (const [resolution, width, height] of [
  ['1920x1080', 1920, 1080],
  ['1080x1920', 1080, 1920],
  ['1620x1080', 1500, 1000],
  // An aligned output from an older free-resolution FLF generation must
  // remain exact even when its aspect differs slightly from the source frame.
  ['1152x640', 1920, 1080],
]) {
  const meta = {
    prompt: 'A cinematic scene', generation_mode: 'flf', seed: 42,
    resolution, flf_resolution: resolution,
    first_frame: 'frame.png', first_frame_width: width, first_frame_height: height,
  }
  test(`FLF submit metadata matches cropped output at ${resolution}`, async () => {
    const env = setup()
    await env.load('src/hooks/use-video-gen.ts').useVideoGen().generate({
      modelType: 'minimax_h3', mode: 'flf', prompt: meta.prompt, resolution,
      firstFrame: 'frame.png', firstFrameWidth: width, firstFrameHeight: height,
      ...(resolution === '1152x640' ? { targetDimensions: { width: 1152, height: 640 } } : {}),
    })
    const workflow = env.load('src/lib/comfy/minimax-h3-template.ts').buildMiniMaxH3Workflow(env.submitted[0])
    assert.equal(outputSize(workflow), resolution)
    assert.equal(env.metadata().resolution, resolution)
  })
  test(`FLF restore and repeat keeps ${resolution}`, async () => {
    const env = setup(meta)
    assert.equal(await env.load('src/lib/restore-from-meta.ts').restoreFromMeta('clip.mp4'), true)
    const restored = env.store.video
    await env.load('src/hooks/use-video-gen.ts').useVideoGen().generate({
      ...restored, modelType: 'minimax_h3',
      firstFrame: restored.startFrame.path,
      firstFrameWidth: restored.startFrame.width, firstFrameHeight: restored.startFrame.height,
    })
    const workflow = env.load('src/lib/comfy/minimax-h3-template.ts').buildMiniMaxH3Workflow(env.submitted[0])
    assert.equal(outputSize(workflow), resolution)
    assert.equal(env.metadata().resolution, resolution)
  })
}
