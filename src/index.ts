/**
 * Refactor Agent Team — OpenCode multi-agent codebase refactoring plugin.
 *
 * Architecture:
 *   Leader     → scouts project, plans what to fix and in what order
 *   Analyst    → deep scan for security/architecture/code-smell issues
 *   Reviewer   → focused review: "will this blow up at 3am?"
 *   Verifier   → test coverage + risk → CAN_MERGE / NEED_TESTS / BLOCKED
 *
 * Cross-agent context: each tool call can optionally pass previous findings
 * so agents build on each other's work instead of starting from scratch.
 */

import { type Plugin, type PluginInput, tool } from '@opencode-ai/plugin'
import { planRefactoring } from './experts/leader'
import { analyze } from './experts/analyst'
import { review } from './experts/reviewer'
import { verify } from './experts/verifier'
import { listPlans, getPlan } from './task/index'

// ──────────────────────────────────────
// Plugin configuration from env + args
// ──────────────────────────────────────

function resolveLLMConfig(args: Record<string, string | undefined>, input: PluginInput) {
  return {
    baseURL: args.baseURL || process.env.LLM_BASE_URL || '',
    apiKey: args.apiKey || process.env.LLM_API_KEY || '',
    model: args.model || process.env.LLM_MODEL || '',
  }
}

function llmWarning(cfg: { baseURL: string; apiKey: string; model: string }): string | null {
  if (!cfg.baseURL) return '⚠️ LLM_BASE_URL 未设置 → 设环境变量或在 tool args 里传 baseURL'
  if (!cfg.apiKey) return '⚠️ LLM_API_KEY 未设置 → 设环境变量或在 tool args 里传 apiKey'
  if (!cfg.model) return '⚠️ LLM_MODEL 未设置 → 设环境变量或在 tool args 里传 model'
  return null
}

// ──────────────────────────────────────
// Plugin registration
// ──────────────────────────────────────

export const server: Plugin = async (input: PluginInput) => {
  const projectDir = input.directory

  return {
    tool: {
      // ── Leader ──────────────────────────
      refactor_plan: tool({
        description: `[Leader] 侦察项目结构，告诉你从哪里搞起。优先修安全漏洞 → 再搞架构 → 最后清理代码。小项目不瞎折腾，没测试的不乱动。`,

        args: {
          goal: tool.schema.string().describe('重构目标，如：支付模块太乱想整理一下'),
          context: tool.schema.string().optional().describe('可选：之前分析的结论'),
          baseURL: tool.schema.string().optional().describe('LLM API 地址'),
          apiKey: tool.schema.string().optional().describe('LLM API 密钥'),
          model: tool.schema.string().optional().describe('模型名'),
        },

        async execute(a) {
          try {
            if (!a.goal) return '说清楚你想搞啥，比如 goal="支付模块太乱，想整理一下"'
            const cfg = resolveLLMConfig(a as any, input)
            const warn = llmWarning(cfg)
            let result = await planRefactoring(projectDir, a.goal, cfg, a.context || '')
            return warn ? `${warn}\n\n${result}` : result
          } catch (e: any) {
            return `❌ 翻车了: ${e.message}`
          }
        },
      }),

      // ── Analyst ─────────────────────────
      scan_techdebt: tool({
        description: `[Code Analyst] 代码扫描。只看三类：安全漏洞、架构违规、代码坏味。不报格式和命名。预期 5-25 条。`,

        args: {
          focus: tool.schema.string().optional().describe('只看某个模块，如 auth'),
          depth: tool.schema.string().optional().describe('扫描深度: quick / deep'),
          baseURL: tool.schema.string().optional().describe('LLM API 地址'),
          apiKey: tool.schema.string().optional().describe('LLM API 密钥'),
          model: tool.schema.string().optional().describe('模型名'),
        },

        async execute(a) {
          try {
            const cfg = resolveLLMConfig(a as any, input)
            const warn = llmWarning(cfg)
            const result = await analyze(projectDir, a.focus, cfg, a.depth === 'deep')
            return warn ? `${warn}\n\n${result}` : result
          } catch (e: any) {
            return `❌ 翻车了: ${e.message}`
          }
        },
      }),

      // ── Reviewer ────────────────────────
      review_code: tool({
        description: `[Reviewer] 审代码。只关心会不会炸。不管格式不管命名。合理评论数 3-8 条。`,

        args: {
          focus: tool.schema.string().optional().describe('只看某个模块'),
          context: tool.schema.string().optional().describe('Analyst 的分析结果'),
          baseURL: tool.schema.string().optional().describe('LLM API 地址'),
          apiKey: tool.schema.string().optional().describe('LLM API 密钥'),
          model: tool.schema.string().optional().describe('模型名'),
        },

        async execute(a) {
          try {
            const cfg = resolveLLMConfig(a as any, input)
            const warn = llmWarning(cfg)
            const result = await review(projectDir, a.focus, cfg, a.context || '')
            return warn ? `${warn}\n\n${result}` : result
          } catch (e: any) {
            return `❌ 翻车了: ${e.message}`
          }
        },
      }),

      // ── Verifier ────────────────────────
      verify_refactoring: tool({
        description: `[Verifier] 判断重构能不能合并。三个维度：测试覆盖、风险、红线问题。直接说 CAN_MERGE / NEED_TESTS / BLOCKED。`,

        args: {
          filesChanged: tool.schema.string().optional().describe('改了哪些文件，JSON 数组'),
          riskContext: tool.schema.string().optional().describe('Reviewer 的审查结论'),
          baseURL: tool.schema.string().optional().describe('LLM API 地址'),
          apiKey: tool.schema.string().optional().describe('LLM API 密钥'),
          model: tool.schema.string().optional().describe('模型名'),
        },

        async execute(a) {
          try {
            const cfg = resolveLLMConfig(a as any, input)
            const warn = llmWarning(cfg)
            const files = a.filesChanged ? JSON.parse(a.filesChanged) : []
            const result = await verify(projectDir, files, cfg, a.riskContext || '')
            return warn ? `${warn}\n\n${result}` : result
          } catch (e: any) {
            return `❌ 翻车了: ${e.message}`
          }
        },
      }),

      // ── Plan status ─────────────────────
      plan_status: tool({
        description: '查看所有重构计划或某个计划的详情',

        args: {
          planId: tool.schema.string().optional().describe('计划ID（不传则列出所有）'),
        },

        async execute(a) {
          if (a.planId) {
            const p = getPlan(a.planId)
            if (!p) return `❌ 没找到计划: ${a.planId}`
            const tasks = p.tasks.map(t =>
              `  [${t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : t.status === 'failed' ? '❌' : '⬜'}] ${t.subject} (${t.owner})`,
            ).join('\n')
            return `📋 **${p.title}** (${p.id})\n状态: ${p.status}\n创建: ${new Date(p.createdAt).toLocaleString()}\n\n${tasks}`
          }
          const all = listPlans()
          if (all.length === 0) return '📭 还没有任何重构计划'
          return all.map(p =>
            `• **${p.title}** — ${p.id} | ${p.status} | ${p.tasks.filter(t => t.status === 'completed').length}/${p.tasks.length} 完成`,
          ).join('\n')
        },
      }),

      // ── Quick review (multi-agent pipeline) ────
      quick_review: tool({
        description: `[Pipeline] 一键全流程：Analyst → Reviewer → Verifier。快速了解代码库状况。`,

        args: {
          focus: tool.schema.string().optional().describe('只看某个模块'),
          baseURL: tool.schema.string().optional().describe('LLM API 地址'),
          apiKey: tool.schema.string().optional().describe('LLM API 密钥'),
          model: tool.schema.string().optional().describe('模型名'),
        },

        async execute(a) {
          try {
            const cfg = resolveLLMConfig(a as any, input)
            const warn = llmWarning(cfg)
            if (warn) return warn

            const focus = a.focus

            // Phase 1: Analyst scans
            const analysisResult = await analyze(projectDir, focus, cfg, false)

            // Phase 2: Reviewer uses analyst context
            const contextForReviewer = `## Analyst 分析发现\n${analysisResult.slice(0, 3000)}`
            const reviewResult = await review(projectDir, focus, cfg, contextForReviewer)

            // Phase 3: Quick verify
            const contextForVerifier = `## Reviewer 审查结论\n${reviewResult.slice(0, 2000)}`
            const verifyResult = await verify(projectDir, [], cfg, contextForVerifier)

            return `## 🔬 全流程分析报告\n\n### 📊 Analyst 扫描\n${analysisResult}\n\n### 👀 Reviewer 审查\n${reviewResult}\n\n### ✅ Verifier 判决\n${verifyResult}\n\n---\n*Pipeline 自动执行: Analyst → Reviewer → Verifier*`
          } catch (e: any) {
            return `❌ Pipeline 翻车了: ${e.message}`
          }
        },
      }),
    },
  }
}
