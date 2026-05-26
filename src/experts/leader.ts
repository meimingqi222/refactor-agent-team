import { readdir, stat as fsStat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { join } from 'node:path'
import { callLLM, type LLMConfig } from '../llm/client'
import { LEADER_PROMPT } from '../prompts/leader'

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__', '.cache', '.venv', 'venv', 'target', 'coverage', '.next', '.svelte-kit'])

async function scout(dir: string): Promise<string> {
  const tree: string[] = []
  let hasTests = false, hasArchDoc = false, hasCi = false, totalFiles = 0
  const exts = new Set<string>()

  try { await fsStat(join(dir, 'ARCHITECTURE.md')); hasArchDoc = true } catch {}

  async function walk(d: string, depth = 0) {
    if (depth > 2) return
    let entries: string[]
    try { entries = await readdir(d) } catch { return }
    for (const entry of entries.sort()) {
      if (SKIP.has(entry) || entry.startsWith('.')) continue
      const full = join(d, entry)
      let s: Stats | undefined
      try { s = await fsStat(full) } catch { continue }
      if (s.isDirectory()) {
        tree.push(`${'  '.repeat(depth)}📁 ${entry}/`)
        if (/test|spec|__tests__|e2e/i.test(entry)) hasTests = true
        await walk(full, depth + 1)
      } else {
        if (depth === 0) tree.push(`${'  '.repeat(depth)}📄 ${entry}`)
        totalFiles++
        const i = entry.lastIndexOf('.'); if (i > 0) exts.add(entry.slice(i).toLowerCase())
        if (entry === '.github' || entry === '.gitlab-ci.yml' || entry === 'Jenkinsfile' || entry === 'Dockerfile' || entry === 'docker-compose.yml') hasCi = true
      }
    }
  }
  await walk(dir)

  const extList = [...exts].filter(e => !['.lock', '.map', '.svg', '.png', '.jpg', '.ico', '.woff2', '.eot', '.ttf'].includes(e)).join(', ')

  return `## 项目概况\n文件数: ~${totalFiles}\n类型: ${extList || '未知'}\n架构文档: ${hasArchDoc ? '✅ 有' : '❌ 无'}\n测试目录: ${hasTests ? '✅ 有' : '❌ 无'}\nCI: ${hasCi ? '✅ 有' : '❌ 无'}\n\n## 目录结构\n${tree.join('\n')}`
}

export async function planRefactoring(
  projectDir: string,
  goal: string,
  llmCfg: LLMConfig,
  _context = '',
): Promise<string> {
  const report = await scout(projectDir)
  const prefix = _context ? `## 已有上下文\n${_context}\n\n` : ''
  return callLLM(LEADER_PROMPT, `${prefix}${report}\n\n## 重构目标\n${goal}\n\n看看这项目该从哪里搞起。`, llmCfg)
}
