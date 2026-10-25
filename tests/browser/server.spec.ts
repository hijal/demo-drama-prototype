import { expect, test } from '@playwright/test'

test('production serves the Svelte SPA/assets and keeps API routing separate', async ({
  request,
}) => {
  const home = await request.get('/')
  expect(home.status()).toBe(200)
  const html = await home.text()
  expect(html).toContain('<div id="app"></div>')
  expect(html).not.toContain('__next')
  const asset = html.match(/src="([^"]+\.js)"/)
  expect(asset).toBeTruthy()
  const js = await request.get(asset![1])
  expect(js.status()).toBe(200)
  expect(js.headers()['content-type']).toContain('javascript')
  expect((await request.get('/missing.js')).status()).toBe(404)
  expect((await request.get('/.dev.vars')).status()).toBe(404)
  expect((await request.post('/', { data: {} })).status()).toBe(405)
  const invalid = await request.post('/api/comfy/generate', { data: {} })
  expect(invalid.status()).toBe(400)
  expect(await invalid.json()).toEqual({ error: 'Prompt is required.' })
})
