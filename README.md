# Refactor Agent Team

OpenCode 插件 — 多代理代码重构工具。

每个专家有独立的 system prompt，调 LLM（任意 OpenAI 兼容 API）做真实分析。

## 安装

```bash
git clone https://github.com/meimingqi222/refactor-agent-team.git
mkdir -p ~/.config/opencode/plugins
cp -r refactor-agent-team ~/.config/opencode/plugins/
# 重启 OpenCode
```

## 配置

```bash
export LLM_BASE_URL=你的API地址
export LLM_API_KEY=*** LLM_MODEL=模型名
```

## Tools

| Tool | 干什么 |
|------|--------|
| `refactor_plan` | 侦察项目，说清楚从哪里搞起 |
| `scan_techdebt` | 找真正值得修的问题（安全/架构/坏味） |
| `review_code` | 审代码，只关心会不会炸 |
| `verify_refactoring` | 判断能不能合并 |
| `plan_status` | 查看计划 |

每个 tool 做的事：读源码 → 调 LLM → 返回结果。不是正则匹配。

## Prompt 设计思路

每个 prompt 有明确的范围和舍弃：

- **analyst**: 只看 3 类问题（安全/架构/坏味），不报格式和注释。预期数量 5-25 条
- **reviewer**: 聚焦"会不会出问题"，不管 lint 和命名。3-8 条评论算正常
- **verifier**: 直接告诉你能不能合并（CAN_MERGE/NEED_TESTS/BLOCKED）
- **leader**: 像跟程序员说话一样自然，不用表格模板

## 结构

```
src/
├── index.ts              # 插件入口
├── llm/client.ts         # LLM 调用
├── prompts/              # system prompt（每个专家的思维方式）
├── experts/              # 实现（收集上下文 → 调 LLM）
└── task/                 # 任务追踪
```
