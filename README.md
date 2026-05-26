# Refactor Agent Team

OpenCode 插件 — **多 Agent 代码重构系统**。每个专家有独立的 system prompt，调 LLM（任意 OpenAI 兼容 API）做真实分析，不是正则匹配。

## 🏗 架构

```
Analyst → 代码扫描（安全/架构/坏味）
Reviewer → 代码审查（"凌晨三点会不会炸"）
Verifier → 判决（CAN_MERGE / NEED_TESTS / BLOCKED）
Leader → 规划（P0 立刻修 / P1 这周搞 / P2 有空再说 / 别碰）
```

**跨 Agent 协作**：Analyst 的发现可传给 Reviewer，Reviewer 的结论可传给 Verifier。`quick_review` tool 一键执行全流水线。

## 安装

```bash
git clone https://github.com/meimingqi222/refactor-agent-team.git
mkdir -p ~/.config/opencode/plugins
cp -r refactor-agent-team ~/.config/opencode/plugins/
# 重启 OpenCode
```

## 配置

```bash
export LLM_BASE_URL=https://api.openai.com/v1
export LLM_API_KEY=sk-xxx
export LLM_MODEL=gpt-4o
```

也可以在 tool 调用时通过 `baseURL`、`apiKey`、`model` 参数覆盖（每个 tool/每个 Agent 可用不同模型）。

## Tools

| Tool | 干什么 | 输出 |
|------|--------|------|
| `refactor_plan` | 侦察项目，规划重构优先级 | P0/P1/P2 分级任务 |
| `scan_techdebt` | 扫描技术债（安全/架构/坏味） | JSON 格式问题列表 |
| `review_code` | 审查代码，聚焦线上风险 | blocker/critical/major 分级 |
| `verify_refactoring` | 判断重构能不能合并 | CAN_MERGE/NEED_TESTS/BLOCKED |
| `quick_review` | 一键全流程分析 | Analyst→Reviewer→Verifier 报告 |
| `plan_status` | 查看重构计划 | 计划列表/详情 |

## Prompt 设计哲学

每个 prompt 有明确的范围和**舍弃**：

- **analyst**：只看 3 类问题（安全/架构/坏味），不报格式和注释。预期 5-25 条
- **reviewer**：聚焦"会不会出问题"，不管 lint 和命名。3-8 条合理
- **verifier**：直接说 CAN_MERGE/NEED_TESTS/BLOCKED
- **leader**：像跟程序员说话一样自然，不列 10+ 个没人会做的任务

## 与 requesting-code-review 的关系

`requesting-code-review` 是 Hermes Agent 平台上的 skill（提交前验证流水线），
`refactor-agent-team` 是 OpenCode 原生插件（OpenCode 内直接使用的 tools）。
两者 prompt 设计理念一致，实现平台不同。

## 结构

```
src/
├── index.ts              # 插件入口（6 个 tools）
├── llm/client.ts         # LLM 调用（带 retry）
├── prompts/              # system prompt（每个专家的思维方式）
│   ├── analyst.ts
│   ├── reviewer.ts
│   ├── verifier.ts
│   └── leader.ts
├── experts/              # 实现（收集上下文 → 调 LLM）
│   ├── analyst.ts
│   ├── reviewer.ts
│   ├── verifier.ts
│   └── leader.ts
└── task/                 # 任务追踪
    └── index.ts
```

## License

MIT
