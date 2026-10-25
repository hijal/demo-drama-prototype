import { expect, test, type Page } from '@playwright/test'

async function mockBackend(page: Page) {
  let config = {
    reserve_gb: 3,
    dynamic_vram: true,
    comfy_dir: '/tmp/studio',
    diffusion_model: '',
    sound_on: false,
  }
  const submissions: any[] = [],
    settings: any[] = [],
    deletions: any[] = []
  let videos = [
    {
      filename: 'scene.mp4',
      subfolder: 'Episode 1',
      url: '/api/comfy/file?filename=scene.mp4',
      type: 'video/mp4',
      mtime: 1,
      generationTime: 12,
    },
  ]
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      pathname = url.pathname
    const body = request.headers()['content-type']?.includes('application/json')
      ? request.postDataJSON()
      : null
    let data: any = {}
    if (pathname === '/api/comfy/health')
      data = { system: { os: 'linux', comfyui_version: 'test' }, devices: [] }
    else if (pathname === '/api/config') {
      if (body) {
        settings.push(body)
        config = { ...config, ...body }
      }
      data = config
    } else if (pathname === '/api/comfy/model-options')
      data = {
        fps: 24,
        frames_minimum: 60,
        frames_maximum: 719,
        frames_steps: 17,
      }
    else if (pathname === '/api/comfy/files')
      data = { files: videos, folders: ['Episode 1'] }
    else if (pathname === '/api/models/status') data = { models: [] }
    else if (pathname === '/api/loras') data = { loras: [] }
    else if (pathname === '/api/comfy/diffusion-models')
      data = {
        models: [],
        default: 'default.safetensors',
        current: 'default.safetensors',
      }
    else if (pathname === '/api/comfy/meta') {
      expect(url.searchParams.get('path')).toBe('Episode 1/scene.mp4')
      data = {
        prompt: 'Original frame scene',
        generation_mode: 'flf',
        seed: 42,
        resolution: '1620x1080',
        flf_resolution: '1620x1080',
        first_frame: 'frame.png',
        first_frame_width: 1500,
        first_frame_height: 1000,
      }
    } else if (pathname === '/api/comfy/upload') data = { name: 'input.png' }
    else if (pathname === '/api/comfy/generate') {
      submissions.push(body)
      data = { prompt_id: `prompt-${submissions.length}` }
    } else if (pathname === '/api/comfy/status') data = { status: 'queued' }
    else if (pathname === '/api/comfy/preview') data = { preview: null }
    else if (pathname === '/api/comfy/delete') {
      deletions.push(body)
      videos = videos.filter((f) => f.filename !== body.filename)
      data = { ok: true }
    } else if (pathname === '/api/comfy/file') {
      if (request.method() === 'HEAD') {
        await route.fulfill({ status: 200 })
        return
      }
      await route.fulfill({ status: 200, contentType: 'video/mp4', body: '' })
      return
    } else if (pathname === '/api/comfy/cancel') data = { ok: true }
    await route.fulfill({ json: data })
  })
  return { submissions, settings, deletions }
}

test('Svelte navigation preserves and reloads generation parameters', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await mockBackend(page)
  await page.goto('/')
  await page
    .getByLabel('Prompt', { exact: true })
    .fill('A quiet forest at dawn')
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.getByLabel('Resolution', { exact: true }).selectOption('1080x1920')
  await page.getByRole('button', { name: 'Gallery', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Gallery/ })).toBeVisible()
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(
    'A quiet forest at dawn',
  )
  await page.reload()
  await expect(page.getByLabel('Resolution', { exact: true })).toHaveValue(
    '1080x1920',
  )
  await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(
    'A quiet forest at dawn',
  )
  expect(errors).toEqual([])
  await page.screenshot({
    path: '/private/tmp/svelte-studio-desktop.png',
    fullPage: true,
  })
})

test('submits two tasks and cancels them while Gallery is open', async ({
  page,
}) => {
  const backend = await mockBackend(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.getByLabel('Prompt', { exact: true }).fill('A cinematic scene')
  await page.getByRole('button', { name: /Generate video/ }).click()
  await expect.poll(() => backend.submissions.length).toBe(1)
  await page.getByRole('button', { name: /Add to queue/ }).click()
  await expect.poll(() => backend.submissions.length).toBe(2)
  expect(backend.submissions[0]).toMatchObject({
    mode: 't2v',
    prompt: 'A cinematic scene',
  })
  await page.getByRole('button', { name: 'Gallery', exact: true }).click()
  await page.getByRole('button', { name: /^Queue/ }).click()
  await expect(
    page
      .getByRole('complementary', { name: 'Generation queue' })
      .getByText('A cinematic scene', { exact: true }),
  ).toHaveCount(2)
  await page
    .getByRole('button', { name: 'Cancel task', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('button', { name: 'Cancel task', exact: true }),
  ).toHaveCount(1)
})

test('gallery Repeat submits the exact restored FLF dimensions', async ({
  page,
}) => {
  const backend = await mockBackend(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Gallery', exact: true }).click()
  await page
    .getByRole('button', { name: /Repeat/, exact: false })
    .last()
    .click()
  await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(
    'Original frame scene',
  )
  await page.getByRole('button', { name: /Generate video/ }).click()
  await expect.poll(() => backend.submissions.length).toBe(1)
  expect(backend.submissions[0]).toMatchObject({
    mode: 'flf',
    targetDimensions: { width: 1620, height: 1080 },
    firstFrame: 'frame.png',
    seed: 42,
  })
})

test('settings persist optimization and native dialogs close with Escape', async ({
  page,
}) => {
  const backend = await mockBackend(page)
  await page.goto('/')
  await page.getByRole('button', { name: /Settings/, exact: false }).click()
  await page.getByRole('tab', { name: 'Optimization', exact: true }).click()
  await page.getByLabel('Reserved VRAM (GB)', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Save optimization' }).click()
  await expect.poll(() => backend.settings.length).toBe(1)
  expect(backend.settings[0]).toMatchObject({ reserve_gb: 5 })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: /Settings/ }).click()
  await expect(
    page.getByLabel('Reserved VRAM (GB)', { exact: true }),
  ).toHaveValue('5')
})

test('gallery deletion requires confirmation and refreshes results', async ({
  page,
}) => {
  const backend = await mockBackend(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Gallery', exact: true }).click()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  expect(backend.deletions).toHaveLength(0)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect.poll(() => backend.deletions.length).toBe(1)
  await expect(page.getByText('Your story begins here').last()).toBeVisible()
})

test('mobile Generate and Gallery fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBackend(page)
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /Generate video/ }),
  ).toBeVisible()
  await page.screenshot({
    path: '/private/tmp/svelte-studio-mobile.png',
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Gallery', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Gallery/ })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('reference and frame uploads reach their generation workflows', async ({
  page,
}) => {
  const backend = await mockBackend(page)
  await page.goto('/')
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 60
    canvas.getContext('2d')!.fillRect(0, 0, 80, 60)
    return canvas.toDataURL().split(',')[1]
  })
  const file = {
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  }
  await page.getByLabel('Upload references').setInputFiles(file)
  await expect(page.getByText('reference.png', { exact: true })).toBeVisible()
  await page
    .getByLabel('Prompt', { exact: true })
    .fill('Use <Picture 1> in a cinematic scene')
  await page.getByRole('button', { name: /Generate video/ }).click()
  await expect.poll(() => backend.submissions.length).toBe(1)
  expect(backend.submissions[0]).toMatchObject({
    mode: 'ref',
    refImages: ['input.png'],
  })
  await page.getByRole('button', { name: 'Frames', exact: true }).click()
  await page.getByLabel('First frame', { exact: true }).setInputFiles(file)
  await expect(
    page.getByRole('button', { name: 'Remove first frame' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Add to queue/ }).click()
  await expect.poll(() => backend.submissions.length).toBe(2)
  expect(backend.submissions[1]).toMatchObject({
    mode: 'flf',
    firstFrame: 'input.png',
    firstFrameWidth: 80,
    firstFrameHeight: 60,
  })
  expect(backend.submissions[1].prompt).not.toContain('<Picture 1>')
})

test('metadata uses the full folder path and playback opens a dialog', async ({
  page,
}) => {
  await mockBackend(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Gallery', exact: true }).click()
  await page.getByRole('button', { name: 'Info', exact: true }).click()
  await expect(
    page.getByRole('dialog').getByText(/Original frame scene/),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page
    .getByRole('button', { name: 'Play scene.mp4', exact: true })
    .click()
  await expect(page.getByRole('dialog').locator('video')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('active queue resumes polling after a page reload', async ({ page }) => {
  const backend = await mockBackend(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.getByLabel('Prompt', { exact: true }).fill('Resume this scene')
  await page.getByRole('button', { name: /Generate video/ }).click()
  await expect.poll(() => backend.submissions.length).toBe(1)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('h3-gen-queue') || '{}').state
            ?.items?.[0]?.promptId,
      ),
    )
    .toBe('prompt-1')
  await page.reload()
  await page.getByRole('button', { name: 'Gallery', exact: true }).click()
  await page.getByRole('button', { name: /^Queue/ }).click()
  const response = await page.waitForResponse((r) =>
    r.url().includes('/api/comfy/status?prompt_id=prompt-1'),
  )
  expect(response.ok()).toBe(true)
  await expect(
    page.getByRole('button', { name: 'Cancel task', exact: true }),
  ).toHaveCount(1)
  expect(backend.submissions).toHaveLength(1)
})
