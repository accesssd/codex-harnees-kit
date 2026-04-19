# codex-harnees-kit

Harnees 是一个本地 Codex workflow harness。MVP 使用 TypeScript CLI 编排 Superpowers 生命周期，并按需加载 ECC skills。

## MVP 命令

```bash
npm run dev -- start "登录超时后页面会卡住"
npm run dev -- status <run-id>
npm run dev -- list
npm run dev -- resume <run-id>
npm run dev -- step <run-id> verify
```

## 工作流

MVP 默认从 `brainstorm` 阶段开始，让用户先确认 `task.md`。`--workflow` 不是必填项；未提供时，Harnees 会根据任务内容自动推断 workflow，并用中文解释判断原因。

## 设计文档

- `docs/superpowers/specs/2026-04-18-codex-harness-cli-design.md`
- `docs/superpowers/plans/2026-04-18-codex-harness-cli-mvp.md`

## 后续阶段

- Phase 2：由 harness 运行 test/lint/typecheck，并把失败输出反馈给 Codex thread。
- Phase 3：增加 command allowlist、protected files 和 approval policy。
- Phase 4：接入真正的 planner/executor/reviewer/verifier subagent 流程。
