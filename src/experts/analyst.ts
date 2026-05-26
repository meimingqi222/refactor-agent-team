import { readdir, stat as fsStat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { callLLM, type LLMConfig } from '../llm/client'
import { ANALYST_PROMPT } from '../prompts/analyst'

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__', '.cache', '.venv', 'venv', 'target', 'coverage', '.next', '.svelte-kit', 'out'])
const SRC_EXTS = new Set(['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.kt', '.swift', '.rb', '.php', '.c', '.cpp', '.cs', '.scala', '.zig', '.ex', '.exs'])

async function collect(dir: string, focus?: string, deep = false): Promise<string> {
  const tree: string[] = []
  const files: string[] = []

  async function walk(d: string, depth = 0) {
    if (!deep && depth > 2) return
    if (deep && depth > 4) return
    let entries: string[]
    try { entries = await readdir(d) } catch { return }
    for (const entry of entries.sort()) {
      if (SKIP.has(entry) || entry.startsWith('.')) continue
      const full = join(d, entry)
      let s: Stats | undefined
      try { s = await fsStat(full) } catch { continue }
      if (s.isDirectory()) {
        tree.push(`${'  '.repeat(depth)}📁 ${entry}/`)
        await walk(full, depth + 1)
      } else {
        tree.push(`${'  '.repeat(depth)}📄 ${entry}`)
        const ext = extname(entry).toLowerCase()
        if (!SRC_EXTS.has(ext)) continue
        if (focus && !full.toLowerCase().includes(focus.toLowerCase())) continue
        if (s.size > 100_000) continue // skip files > 100KB
        files.push(full)
      }
    }
  }
  await walk(dir)

  const sections: string[] = [`## 目录结构\n${tree.join('\n')}\n`]
  const sorted = files.sort((a, b) => {
    const prio = ['config', 'main.', 'app.', 'controller', 'service', 'repository', 'route', 'auth', 'payment', 'security', 'middleware', 'db', 'model']
    const ap = prio.some(p => a.toLowerCase().includes(p)) ? 0 : 1
    const bp = prio.some(p => b.toLowerCase().includes(p)) ? 0 : 1
    return ap - bp || a.localeCompare(b)
  })

  const maxFiles = deep ? 50 : 25
  for (const f of sorted.slice(0, maxFiles)) {
    try {
      const content = await Bun.file(f).text()
      const lines = content.split('\n')
      const rel = relative(dir, f)
      const display = lines.length > 150 ? lines.slice(0, 100).join('\n') + `\n... (${lines.length}行, 截取前100行)` : content
      sections.push(`### ${rel} (${lines.length}行)\n\`\`\`\n${display}\n\`\`\``)
    } catch {}
  }

  return sections.join('\n')
}

export async function analyze(
  projectDir: string,
  focus: string | undefined,
  llmCfg: LLMConfig,
  deep = false,
  _context = '',
): Promise<string> {
  const ctx = await collect(projectDir, focus, deep)
  const prefix = _context ? `## 已有上下文\n${_context}\n\n` : ''
  return callLLM(ANALYST_PROMPT, prefix + ctx, llmCfg)
}
