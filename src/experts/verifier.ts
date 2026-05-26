import { readdir, stat as fsStat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { join } from 'node:path'
import { callLLM, type LLMConfig } from '../llm/client'
import { VERIFIER_PROMPT } from '../prompts/verifier'

async function collect(dir: string): Promise<string> {
  const files = await readdir(dir).catch(() => [] as string[])

  let fw = 'unknown', cmd = ''
  if (files.includes('package.json')) {
    try {
      const p = JSON.parse(await Bun.file(join(dir, 'package.json')).text())
      cmd = p.scripts?.test || ''
      if (p.devDependencies?.vitest) fw = 'vitest'
      else if (p.devDependencies?.jest) fw = 'jest'
      else if (p.devDependencies?.mocha) fw = 'mocha'
    } catch {}
  } else if (files.includes('go.mod')) { fw = 'go test'; cmd = 'go test ./...' }
  else if (files.includes('pytest.ini') || files.includes('pyproject.toml') || files.includes('setup.py') || files.includes('setup.cfg')) { fw = 'pytest'; cmd = 'pytest -x' }
  else if (files.includes('Cargo.toml')) { fw = 'cargo'; cmd = 'cargo test' }
  else if (files.includes('build.gradle') || files.includes('build.gradle.kts')) { fw = 'gradle'; cmd = './gradlew test' }
  else if (files.includes('Makefile')) { fw = 'make'; cmd = 'make test' }

  const tests: string[] = []
  async function walk(d: string, depth = 0) {
    if (depth > 4) return
    let entries: string[]
    try { entries = await readdir(d) } catch { return }
    for (const e of entries) {
      if (e.startsWith('.') || e === 'node_modules' || e === 'dist' || e === 'target') continue
      const full = join(d, e)
      let s: Stats | undefined
      try { s = await fsStat(full) } catch { continue }
      if (s.isDirectory()) walk(full, depth + 1)
      else if (/\.(test|spec|e2e|integration)\.(ts|js|tsx|jsx|py)$/i.test(e) || /_test\.go$/i.test(e) || /Test\.(kt|java)$/i.test(e)) tests.push(full.replace(dir + '/', ''))
    }
  }
  await walk(dir)

  return `框架: ${fw}\n命令: ${cmd || '无'}\n测试文件数: ${tests.length}${tests.length > 0 ? '\n' + tests.slice(0, 20).map(f => '- ' + f).join('\n') : ''}`
}

export async function verify(
  projectDir: string,
  filesChanged: string[],
  llmCfg: LLMConfig,
  contextHint = '',
): Promise<string> {
  const info = await collect(projectDir)
  const prefix = contextHint || ''
  return callLLM(VERIFIER_PROMPT, `${prefix}${info}\n\n## 变更文件\n${filesChanged.map(f => '- ' + f).join('\n') || '(未指定)'}\n\n## 判决\n能合不能合？`, llmCfg)
}
