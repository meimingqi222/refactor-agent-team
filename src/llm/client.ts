export interface LLMConfig {
  baseURL: string
  apiKey: string
  model: string
}

export async function callLLM(systemPrompt: string, userContent: string, cfg: LLMConfig): Promise<string> {
  if (!cfg.apiKey || !cfg.baseURL || !cfg.model) {
    throw new Error(
      'LLM not configured. Set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL\n' +
      'or pass { baseURL, apiKey, model } in tool args.'
    )
  }

  const res = await fetch(`${cfg.baseURL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 8192,
      temperature: 0.3,
    }),
  })

  if (!res.ok) throw new Error(`LLM API error (${res.status}): ${await res.text().catch(() => 'unknown')}`)
  return ((await res.json()) as any).choices?.[0]?.message?.content || ''
}
