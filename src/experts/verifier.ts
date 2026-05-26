import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { callLLM, type LLMConfig } from '../llm/client'
import { VERIFIER_PROMPT } from '../prompts/verifier'

async function collect(dir: string): Promise<string> {
  const files = await readdir(dir).catch(() => [])

  let fw = 'unknown', cmd = ''
  if (files.includes('package.json')) {
    try {
      const p = JSON.parse(await Bun.file(join(dir, 'package.json')).text())
      cmd = p.scripts?.test || ''
      if (p.devDependencies?.vitest) fw = 'vitest'
      else if (p.devDependencies?.jest) fw = 'jest'
    } catch {}
  } else if (files.includes('go.mod')) { fw = 'go test'; cmd = 'go test ./...' }
  else if (files.includes('pytest.ini') || files.includes('pyproject.toml')) { fw = 'pytest'; cmd = 'pytest' }

  const tests: string[] = []
  async function walk(d: string, depth = 0) {
    if (depth > 3) return
    let entries: string[]
    try { entries = await readdir(d) } catch { return }
    for (const e of entries) {
      if (e.startsWith('.') || e === 'node_modules' || e === 'dist') continue
      const full = join(d, e)
      let s
      try { s = await stat(full) } catch { continue }
      if (s.isDirectory()) walk(full, depth + 1)
      else if (/\.(test|spec)\.(ts|js|tsx|jsx|py)$/i.test(e) || /_test\.go$/i.test(e)) tests.push(full.replace(dir + '/', ''))
    }
  }
  await walk(dir)

  return `框架: ${fw}\n命令: ${cmd || '无'}\n测试文件数: ${tests.length}${tests.length > 0 ? '\n' + tests.slice(0, 15).map(f => '- ' + f).join('\n') : ''}`
}

export async function verify(projectDir: string, filesChanged: string[], llmCfg: LLMConfig): Promise<string> {
  const info = await collect(projectDir)
  return callLLM(VERIFIER_PROMPT, `${info}\n\n变更:\n${filesChanged.map(f => '- ' + f).join('\n') || '(未指定)'}\n\n能合不能合？`, llmCfg)
}
