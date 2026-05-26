/**
 * LLM client — calls any OpenAI-compatible API with retry logic.
 *
 * Design: thin wrapper. No streaming (tools wait for final result).
 * Retry on 429/5xx with exponential backoff.
 */

export interface LLMConfig {
  baseURL: string
  apiKey: string
  model: string
}

export interface LLMResponse {
  content: string
  model: string
  usage: { prompt: number; completion: number; total: number }
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function callLLM(
  systemPrompt: string,
  userContent: string,
  cfg: LLMConfig,
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  if (!cfg.apiKey || !cfg.baseURL || !cfg.model) {
    throw new Error(
      'LLM not configured. Set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL\n' +
      'or pass { baseURL, apiKey, model } in tool args.',
    )
  }

  const url = `${cfg.baseURL.replace(/\/+$/, '')}/chat/completions`
  const maxRetries = 2

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          max_tokens: options?.maxTokens ?? 8192,
          temperature: options?.temperature ?? 0.3,
        }),
        signal: AbortSignal.timeout(120_000), // 2min timeout
      })

      if (!res.ok) {
        const text = await res.text().catch(() => 'unknown')
        // Retry on 429 (rate limit) or 5xx (server error)
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
          const wait = Math.pow(2, attempt + 1) * 1_000
          await sleep(wait)
          continue
        }
        throw new Error(`LLM API error (${res.status}): ${text}`)
      }

      const data = (await res.json()) as any
      const content = data?.choices?.[0]?.message?.content
      if (content === undefined || content === null) {
        throw new Error('LLM returned empty response — model may not support this format')
      }
      return content
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new Error(`LLM request timed out after 120s (model: ${cfg.model})`)
      }
      if (attempt < maxRetries) {
        const wait = Math.pow(2, attempt + 1) * 1_000
        await sleep(wait)
        continue
      }
      throw err
    }
  }

  throw new Error('LLM request failed after retries')
}
