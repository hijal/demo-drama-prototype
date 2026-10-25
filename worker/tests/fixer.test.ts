import { describe, expect, it, vi } from 'vitest'
import { ColabClient } from '../src/llm/colab'
import { fixScript } from '../src/llm/fixer'
import { film, loose } from './fixtures'
import { parseScript } from '../src/script/parse'
import { serializeScript } from '../src/script/serialize'

describe('Colab local client', () => {
  it('refuses remote endpoints before sending private script content', () => {
    for (const baseUrl of ['https://router.huggingface.co/v1', 'https://example.com/v1', 'http://127.0.0.1.evil.test/v1']) {
      const fetchImpl = vi.fn()
      expect(() => new ColabClient({ model: 'local/model', baseUrl, fetchImpl })).toThrow('loopback')
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })
  it('works without an HF token and refuses HTTP redirects', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: 'fixed' } }] }))
    await new ColabClient({ model: 'local/model', fetchImpl }).complete([])
    const init = fetchImpl.mock.calls[0][1]!
    expect(init.redirect).toBe('error')
    expect(init.headers).not.toHaveProperty('Authorization')
  })
  it('uses the compatible chat endpoint and retries transient failures', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: 'DRAMA SCRIPT' }, finish_reason: 'stop' }] }))
    const sleep = vi.fn(async () => {})
    const client = new ColabClient({ token: 'test-secret', model: 'test/model', fetchImpl, sleep })
    expect(await client.complete([{ role: 'user', content: 'fix this' }])).toBe('DRAMA SCRIPT')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:8000/v1/chat/completions')
    expect(sleep).toHaveBeenCalledOnce()
  })
  it('does not retry authentication failures or disclose the response body/token', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('test-secret private content', { status: 401 }))
    const client = new ColabClient({ token: 'test-secret', model: 'test/model', fetchImpl })
    await expect(client.complete([])).rejects.toThrow('401')
    expect(fetchImpl).toHaveBeenCalledOnce()
    await expect(client.complete([])).rejects.not.toThrow('test-secret')
  })
  it('rejects truncated and malformed model responses', async () => {
    for (const payload of [
      { choices: [{ message: { content: 'partial script' }, finish_reason: 'length' }] },
      { choices: [{ message: { content: null }, finish_reason: 'stop' }] },
    ]) {
      const client = new ColabClient({ token: 'test', model: 'test/model', fetchImpl: async () => Response.json(payload) })
      await expect(client.complete([])).rejects.toThrow()
    }
  })
})

describe('script fixer', () => {
  it('validates output, retries remaining issues, and returns a reviewable report', async () => {
    const complete = vi.fn().mockResolvedValueOnce(film.replace('  FACE: round face\n', '')).mockResolvedValueOnce(film)
    const result = await fixScript(film, { model: 'test/model', complete })
    expect(result.rounds).toBe(2)
    expect(result.issues.filter(i => i.severity === 'error')).toEqual([])
    expect(result.requiresApproval).toBe(true)
    expect(result.valid).toBe(true)
    expect(result.script).toBe(serializeScript(parseScript(film)))
  })
  it('rejects changed dialogue even when the replacement is structurally valid', async () => {
    const complete = vi.fn().mockResolvedValue(film.replace("It's here: at last!", 'The story has changed!'))
    const result = await fixScript(film, { model: 'test/model', complete }, { maxRounds: 2 })
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.code === 'E12')).toBe(true)
    expect(complete).toHaveBeenCalledTimes(2)
  })
  it('does not let a model invent episodes for a film', async () => {
    const complete = vi.fn().mockResolvedValue(film.replace('== SCENES ==', '== EPISODE 01 | Invented =='))
    const result = await fixScript(film, { model: 'test/model', complete }, { maxRounds: 1 })
    expect(result.issues.some(i => i.code === 'E12')).toBe(true)
  })
  it('makes dry-run output without a token, a model request or a false success', async () => {
    const complete = vi.fn()
    const result = await fixScript(loose, { model: 'test/model', complete }, { dryRun: true })
    expect(complete).not.toHaveBeenCalled()
    expect(result.rounds).toBe(0)
    expect(result.valid).toBe(false)
    expect(result.proposals).toEqual([])
    expect(result.issues.some(i => i.code === 'E05')).toBe(true)
  })
})
