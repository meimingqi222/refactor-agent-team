import { readdir, stat } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import { callLLM, type LLMConfig } from '../llm/client'
import { ANALYST_PROMPT } from '../prompts/analyst'

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__', '.cache', '.venv', 'venv', 'target', 'coverage', '.next'])
const SRC = new Set(['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.kt', '.swift', '.rb', '.php', '.c', '.cpp', '.cs'])

async function collect(dir: string, focus?: string): Promise<string> {
  const tree: string[] = []
  const files: string[] = []

  async function walk(d: string, depth = 0) {
    if (depth > 2) return
    let entries: string[]
    try { entries = await readdir(d) } catch { return }
    for (const entry of entries.sort()) {
      if (SKIP.has(entry) || entry.startsWith('.')) continue
      const full = join(d, entry)
      let s
      try { s = await stat(full) } catch { continue }
      if (s.isDirectory()) {
        tree.push(`${'  '.repeat(depth)}📁 ${entry}/`)
        await walk(full, depth + 1)
      } else {
        tree.push(`${'  '.repeat(depth)}📄 ${entry}`)
        const ext = extname(entry).toLowerCase()
        if (!SRC.has(ext)) continue
        if (focus && !full.toLowerCase().includes(focus.toLowerCase())) continue
        if (s.size > 50000) return
        files.push(full)
      }
    }
  }
  await walk(dir)

  const sections = [`目录结构:\n${tree.join('\n')}\n`]
  const sorted = files.sort((a, b) => {
    const prio = ['config', 'main.', 'app.', 'controller', 'service', 'repository', 'route', 'auth', 'payment']
    const ap = prio.some(p => a.toLowerCase().includes(p)) ? 0 : 1
    const bp = prio.some(p => b.toLowerCase().includes(p)) ? 0 : 1
    return ap - bp || a.localeCompare(b)
  })

  for (const f of sorted.slice(0, 35)) {
    try {
      const content = await Bun.file(f).text()
      const lines = content.split('\n')
      const rel = relative(dir, f)
      sections.push(`### ${rel} (${lines.length}行)\n\`\`\`${lines.length > 120 ? lines.slice(0, 80).join('\n') + `\n...` : content}\n\`\`\``)
    } catch {}
  }

  return sections.join('\n')
}

export async function analyze(projectDir: string, focus: string | undefined, llmCfg: LLMConfig): Promise<string> {
  const ctx = await collect(projectDir, focus)
  return callLLM(ANALYST_PROMPT, ctx, llmCfg)
}
