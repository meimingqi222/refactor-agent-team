import { readdir, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { callLLM, type LLMConfig } from '../llm/client'
import { REVIEWER_PROMPT } from '../prompts/reviewer'

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'vendor'])
const SRC = new Set(['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java'])

async function collect(dir: string, focus?: string): Promise<string> {
  const parts: string[] = []

  async function walk(d: string, depth = 0) {
    if (depth > 3 || parts.length > 30) return
    let entries: string[]
    try { entries = await readdir(d) } catch { return }
    for (const entry of entries) {
      if (SKIP.has(entry) || entry.startsWith('.')) continue
      const full = d + '/' + entry
      let s
      try { s = await stat(full) } catch { continue }
      if (s.isDirectory()) await walk(full, depth + 1)
      else {
        const ext = extname(entry).toLowerCase()
        if (!SRC.has(ext)) continue
        if (focus && !full.toLowerCase().includes(focus.toLowerCase())) continue
        try {
          const content = await Bun.file(full).text()
          parts.push(`### ${full}\n\`\`\`${content}\n\`\`\``)
        } catch {}
      }
    }
  }
  await walk(dir)
  return parts.join('\n')
}

export async function review(projectDir: string, focus: string | undefined, llmCfg: LLMConfig): Promise<string> {
  const code = await collect(projectDir, focus)
  return callLLM(REVIEWER_PROMPT, code, llmCfg)
}
