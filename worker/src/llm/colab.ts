export interface Message { role: 'system' | 'user' | 'assistant'; content: string }
export interface CompletionClient {
  model: string
  complete(messages: Message[], options?: { signal?: AbortSignal }): Promise<string>
}

interface ColabOptions {
  token?: string
  model: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  retries?: number
  timeoutMs?: number
  maxTokens?: number
}

/** Colab-local inference only. Cloudflare queues jobs; the GPU process runs this client. */
export class ColabClient implements CompletionClient {
  readonly model: string
  private readonly baseUrl: string
  constructor(private readonly options: ColabOptions) {
    if (!options.model.trim()) throw new Error('Set COLAB_LLM_MODEL or pass --model for the model loaded in Colab.')
    this.model = options.model
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:8000/v1').replace(/\/+$/, '')
    const url = new URL(this.baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error('Colab inference requires a loopback endpoint. Run the CLI inside the Colab runtime.')
  }

  async complete(messages: Message[], options: { signal?: AbortSignal } = {}): Promise<string> {
    const fetchImpl = this.options.fetchImpl ?? fetch
    const sleep = this.options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
    const retries = this.options.retries ?? 2
    for (let attempt = 0; attempt <= retries; attempt++) {
      options.signal?.throwIfAborted()
      const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 600_000)
      const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout
      let response: Response
      try {
        response = await fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: 'POST', signal, redirect: 'error',
          headers: { 'Content-Type': 'application/json', ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}) },
          body: JSON.stringify({ model: this.model, messages, stream: false, temperature: 0.2, max_tokens: this.options.maxTokens ?? 12000 }),
        })
      } catch {
        options.signal?.throwIfAborted()
        if (attempt === retries) throw new Error('Colab LLM connection failed or timed out. Check network access and retry.')
        await sleep(500 * 2 ** attempt)
        continue
      }
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after'))
        await response.body?.cancel()
        if ([408, 429, 500, 502, 503, 504].includes(response.status) && attempt < retries) {
          await sleep(Math.min(5000, Math.max(500 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0)))
          continue
        }
        // Response bodies may echo private scripts or credentials; never expose them.
        throw new Error(`Colab LLM request failed (HTTP ${response.status}). ${response.status === 401 || response.status === 403 ? 'Check token permissions.' : response.status === 402 ? 'Check local model server configuration.' : 'Check model availability and retry.'}`)
      }
      let data: { choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }> }
      try { data = await response.json() as typeof data } catch { throw new Error('Colab LLM returned invalid JSON.') }
      const choice = data.choices?.[0]
      if (choice?.finish_reason === 'length') throw new Error('Colab LLM output was truncated. Fix one episode at a time or increase the output token budget.')
      if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) throw new Error('Colab LLM returned no usable script text.')
      return choice.message.content
    }
    throw new Error('Colab LLM retries exhausted.')
  }
}
