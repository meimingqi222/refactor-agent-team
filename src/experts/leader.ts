import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { callLLM, type LLMConfig } from '../llm/client'
import { LEADER_PROMPT } from '../prompts/leader'

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__', '.cache', '.venv', 'venv', 'target'])

async function scout(dir: string): Promise<string> {
  const tree: string[] = []
  let hasTests = false, hasArchDoc = false, totalFiles = 0
  const exts = new Set<string>()

  try { await stat(join(dir, 'ARCHITECTURE.md')); hasArchDoc = true } catch {}

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
        if (/test|spec|__tests__/i.test(entry)) hasTests = true
        await walk(full, depth + 1)
      } else {
        if (depth === 0) tree.push(`${'  '.repeat(depth)}📄 ${entry}`)
        totalFiles++
        const i = entry.lastIndexOf('.'); if (i > 0) exts.add(entry.slice(i).toLowerCase())
      }
    }
  }
  await walk(dir)

  return `## 项目概况\n文件数: ~${totalFiles}\n类型: ${[...exts].filter(e => e !== '.lock').join(' ')}\n架构文档: ${hasArchDoc ? '有' : '无'}\n测试目录: ${hasTests ? '有' : '无'}\n\n## 目录结构\n${tree.join('\n')}`
}

export async function planRefactoring(projectDir: string, goal: string, llmCfg: LLMConfig): Promise<string> {
  const report = await scout(projectDir)
  return callLLM(LEADER_PROMPT, `${report}\n\n## 重构目标\n${goal}\n\n看看这项目该从哪里搞起。`, llmCfg)
}
