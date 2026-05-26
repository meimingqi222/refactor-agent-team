import { type Plugin, tool } from '@opencode-ai/plugin'
import { planRefactoring } from './experts/leader'
import { analyze } from './experts/analyst'
import { review } from './experts/reviewer'
import { verify } from './experts/verifier'
import { listPlans, getPlan } from './task/index'

function cfg(args: Record<string, string | undefined>) {
  return {
    baseURL: args.baseURL || process.env.LLM_BASE_URL || '',
    apiKey: args.apiKey || process.env.LLM_API_KEY || '',
    model: args.model || process.env.LLM_MODEL || '',
  }
}

export const RefactorAgentTeam: Plugin = async () => ({
  tool: {
    refactor_plan: tool({
      description: `[Leader] 看项目结构，告诉你从哪里搞起。
- 优先修安全漏洞 → 再搞架构 → 最后清理代码
- 小项目不瞎折腾，没测试的不乱动`,

      args: {
        goal: tool.schema.string({ desc: '重构目标' }),
        baseURL: tool.schema.string().optional({ desc: 'LLM地址' }),
        apiKey: tool.schema.string().optional({ desc: 'LLM密钥' }),
        model: tool.schema.string().optional({ desc: '模型名' }),
      },

      async execute(a, ctx) {
        try {
          if (!a.goal) return '说清楚你想搞啥，比如 goal="支付模块太乱，想整理一下"'
          return await planRefactoring(ctx.directory, a.goal, cfg(a))
        } catch (e: any) { return `翻车了: ${e.message}` }
      },
    }),

    scan_techdebt: tool({
      description: `[Code Analyst] 在代码里找到真正值得修的问题。
只看三类：安全漏洞（密码/SQL注入）、架构违规（缺层/循环依赖）、代码坏味（空catch/TODO/魔法数字）。
不报格式问题、不报注释不够、不报命名风格。`,

      args: {
        focus: tool.schema.string().optional({ desc: '只看某个模块，比如 focus=auth' }),
        baseURL: tool.schema.string().optional({ desc: 'LLM地址' }),
        apiKey: tool.schema.string().optional({ desc: 'LLM密钥' }),
        model: tool.schema.string().optional({ desc: '模型名' }),
      },

      async execute(a, ctx) {
        try { return await analyze(ctx.directory, a.focus, cfg(a)) }
        catch (e: any) { return `翻车了: ${e.message}` }
      },
    }),

    review_code: tool({
      description: `[Reviewer] 审代码。只关心会不会炸。
blocker（线上会炸）、critical（早晚会炸）、major（同事会骂）。
不管格式不管命名不管注释。`,

      args: {
        focus: tool.schema.string().optional({ desc: '只看某个模块' }),
        baseURL: tool.schema.string().optional({ desc: 'LLM地址' }),
        apiKey: tool.schema.string().optional({ desc: 'LLM密钥' }),
        model: tool.schema.string().optional({ desc: '模型名' }),
      },

      async execute(a, ctx) {
        try { return await review(ctx.directory, a.focus, cfg(a)) }
        catch (e: any) { return `翻车了: ${e.message}` }
      },
    }),

    verify_refactoring: tool({
      description: `[Verifier] 判断重构能不能合并。
三个维度：测试覆盖够不够、改的东西危不危险、有没有红线问题。
直接说 CAN_MERGE / NEED_TESTS / BLOCKED。`,

      args: {
        filesChanged: tool.schema.string().optional({ desc: '改了哪些文件，JSON数组' }),
        baseURL: tool.schema.string().optional({ desc: 'LLM地址' }),
        apiKey: tool.schema.string().optional({ desc: 'LLM密钥' }),
        model: tool.schema.string().optional({ desc: '模型名' }),
      },

      async execute(a, ctx) {
        try {
          const files = a.filesChanged ? JSON.parse(a.filesChanged) : []
          return await verify(ctx.directory, files, cfg(a))
        } catch (e: any) { return `翻车了: ${e.message}` }
      },
    }),

    plan_status: tool({
      description: '查看重构计划',

      args: {
        planId: tool.schema.string().optional({ desc: '计划ID' }),
      },

      async execute(a) {
        if (a.planId) {
          const p = getPlan(a.planId)
          return p ? `📋 ${p.title}\n状态: ${p.status}\n任务: ${p.tasks.length}` : '没找到'
        }
        const all = listPlans()
        return all.length ? all.map(p => `- ${p.id} ${p.title}`).join('\n') : '还没有计划'
      },
    }),
  },
})
