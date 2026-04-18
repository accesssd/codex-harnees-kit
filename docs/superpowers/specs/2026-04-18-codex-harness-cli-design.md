# Codex Harness CLI 设计

## 概要

Harnees 是一个本地 TypeScript CLI，用来把 Codex Agent SDK 的使用方式变成可重复执行的工程工作流。它使用 Superpowers 作为开发生命周期骨架，使用 ECC 作为可复用能力库，使用 Codex 作为执行引擎。

MVP 是一个工作流编排器，不是新的 agent 框架。它帮助用户从一个模糊想法开始，通过脑暴确认任务文件，生成实现计划，让 Codex 执行代码工作，审查结果，要求验证证据，并完成分支收尾。

## 目标

- 提供一个本地 CLI，用来运行结构化的 Codex 开发工作流。
- 使用 Superpowers 生命周期作为默认流程：`worktree`、`brainstorm`、`plan`、`execute`、per-task TDD、`review`、`verify`、`finish`。
- 使用 ECC skills 作为领域指导和操作手册。
- 用户可见的 CLI 输出、生成的任务文件、实现计划、审查总结、验证总结和最终报告默认使用中文。
- 默认自动推断 workflow，同时允许用 `--workflow` 显式覆盖。
- 在开始实现之前，必须通过脑暴阶段产出并确认 `task.md`。
- 为每次运行保存 prompt、输出、已选择的 skills、workflow 状态和 trace 数据。
- 支持从已保存状态恢复运行。

## MVP 非目标

- 不构建 Web dashboard。
- 不实现完整的命令 allowlist 或 approval engine。
- 不由 harness 自己自动运行 tests、lint 或 typecheck。
- 不自动 push commit 或创建 pull request。
- 不实现真正并发的多 agent 执行。
- 不替代 Codex 自身的 shell 权限和文件系统控制。

这些能力会作为后续阶段推进。MVP 的重点是先把工作流编排闭环跑稳定。

## 用户体验

主命令从一个原始想法开始：

```bash
harnees start "登录超时后页面会卡住"
```

CLI 会推断 workflow，用中文解释分类原因，并在脑暴阶段让用户确认。例如：

```text
检测到的工作流：bugfix

判断原因：
- 这个需求描述的是已有行为出错。
- 预期结果是修复问题，而不是新增能力。

是否继续使用 bugfix 工作流？yes/no
```

如果用户已经有任务文件：

```bash
harnees start --task tasks/fix-login-timeout.md
```

如果需要确定性行为，`--workflow` 可以覆盖自动推断：

```bash
harnees start "登录超时后页面会卡住" --workflow bugfix
```

`--workflow` 是可选参数。它面向脚本、CI 和已经明确知道要使用哪种 workflow 的高级用户。

辅助命令：

```bash
harnees resume <run-id>
harnees status <run-id>
harnees list
harnees step <run-id> <phase>
```

`step` 用来手动推进或重跑某个阶段，例如：

```bash
harnees step 2026-04-18-001 verify
```

## Superpowers 生命周期

MVP 会保留完整 Superpowers 生命周期概念，即使第一版中某些步骤仍然是人工确认或 prompt 驱动。

### 1. Worktree

Skills:

- `superpowers:using-git-worktrees`

MVP 行为：

- 检查 `git status`。
- 如果工作区不干净，给出提醒。
- 建议创建隔离分支或 worktree。
- 将用户决策记录到 run state。

除非用户显式要求，MVP 不会自动创建 worktree。

### 2. Brainstorm

Skills:

- `superpowers:brainstorming`

MVP 行为：

- 从原始想法或已有任务文件开始。
- 除非提供了 `--workflow`，否则自动推断可能的 workflow。
- 与用户澄清任务。
- 在 `tasks/` 下生成任务文件。
- 进入计划阶段前要求用户确认。

任务文件必须包含：

- 目标
- 背景
- 预期行为
- 非目标
- 成功标准
- workflow 和分类理由

任务文件默认使用中文。命令名、文件路径、workflow 名称、包名和 API 名称等技术标识保持原文。

### 3. Plan

Skills:

- `superpowers:writing-plans`
- 对于更大的多 session 或多 PR 工作，使用 `ecc:blueprint`

MVP 行为：

- 根据已确认的任务文件生成实现计划。
- 将计划保存到 `docs/superpowers/plans/`。
- 将计划路径记录到 run state。

### 4. Execute

Skills:

- `superpowers:subagent-driven-development`

MVP 行为：

- 使用一个 Codex thread 串行执行计划。
- 在 prompt 和 trace 中保留 `subagent-driven-development` 的模型。
- 记录未来升级为 planner、executor、reviewer、verifier 角色的扩展点。

真正的多 agent dispatch 延后到后续阶段。

### 5. Per-Task TDD

Skills:

- `superpowers:test-driven-development`
- `ecc:tdd-workflow`

MVP 行为：

- 要求 agent 在可行时遵循 RED、GREEN、REFACTOR 循环。
- 在修改生产代码前，要求提供失败测试有意义的证据。
- 将报告的验证命令和输出保存到 trace。

MVP 依赖 Codex 在自己的 session 中运行命令。Harness 记录证据，但不自己运行测试命令。

### 6. Review

Skills:

- `superpowers:requesting-code-review`

MVP 行为：

- 在执行完成后要求 Codex 审查实现。
- 将 spec compliance review 和 code quality review 分开。
- 记录发现的问题，以及它们是否阻塞继续推进。

### 7. Verify

Skills:

- `superpowers:verification-before-completion`
- `ecc:verification-loop`

MVP 行为：

- 要求有命令证据后，run 才能被视为完成。
- 要求 Codex 报告相关 tests、lint、typecheck 或手工验证步骤。
- 将验证输出保存到 trace 文件。

如果没有记录验证证据，MVP 不允许声称任务成功完成。

### 8. Finish

Skills:

- `superpowers:finishing-a-development-branch`

MVP 行为：

- 总结变更文件、验证证据和剩余风险。
- 建议 commit、pull request 或 cleanup 后续动作。
- 不自动 push，也不自动创建 pull request。

## Workflow 配置

Workflow 是一个具名配置，用来针对不同任务类型调整生命周期。默认自动推断 workflow，也可以用 `--workflow` 覆盖。

初始 workflows：

- `bugfix`
- `feature`
- `review`
- `ci-failure`

每个 workflow 定义：

- 阶段顺序
- 每个阶段加载的 skills
- 阶段目标
- 停止条件
- 人工确认 gate

示例：

```yaml
name: bugfix
phases:
  - id: worktree
    skills:
      - superpowers:using-git-worktrees
    objective: Check isolation and current git state.

  - id: brainstorm
    skills:
      - superpowers:brainstorming
    objective: Confirm the bug scope and write task.md.

  - id: plan
    skills:
      - superpowers:writing-plans
    objective: Create an implementation plan from task.md.

  - id: execute
    skills:
      - superpowers:subagent-driven-development
      - superpowers:test-driven-development
      - ecc:tdd-workflow
    objective: Implement the smallest correct fix with TDD evidence.

  - id: review
    skills:
      - superpowers:requesting-code-review
    objective: Review for spec compliance and code quality.

  - id: verify
    skills:
      - superpowers:verification-before-completion
      - ecc:verification-loop
    objective: Require evidence before completion.

  - id: finish
    skills:
      - superpowers:finishing-a-development-branch
    objective: Prepare final summary and branch completion guidance.
```

## 项目结构

```text
codex-harnees-kit/
  README.md
  package.json
  tsconfig.json

  src/
    cli.ts
    codex-thread.ts
    workflow-engine.ts
    workflow-inference.ts
    skill-registry.ts
    skill-loader.ts
    context-builder.ts
    trace-store.ts
    task-store.ts

  workflows/
    bugfix.yaml
    feature.yaml
    review.yaml
    ci-failure.yaml

  prompts/
    controller.md
    phase.md

  config/
    skills.json

  tasks/
    .gitkeep

  .harnees/
    runs/

  docs/
    superpowers/
      specs/
      plans/
```

## 模块职责

### CLI

`src/cli.ts` 解析用户命令，并委托给 workflow engine。

MVP 支持的命令：

- `start`
- `resume`
- `status`
- `list`
- `step`

### Workflow Engine（工作流引擎）

`src/workflow-engine.ts` 加载 workflow YAML，判断当前阶段，加载阶段 skills，构造 prompts，调用 Codex，并推进 run state。

### Workflow Inference（工作流推断）

`src/workflow-inference.ts` 将原始想法或任务文件分类到最可能的 workflow。

推断结果包含：

- Workflow 名称
- 置信度
- 判断理由
- 是否需要用户确认

如果提供了 `--workflow`，则跳过推断，并将 workflow source 记录为 `explicit`。

### Skill Registry（Skill 注册表）

`src/skill-registry.ts` 将 skill 名称映射到本地 `SKILL.md` 文件。

MVP registry 只覆盖初始 workflows 使用的 skills。随着 workflow 覆盖范围扩大，可以继续加入更多 ECC skills。

### Skill Loader（Skill 加载器）

`src/skill-loader.ts` 只加载当前阶段需要的 skill 内容，避免把所有 Superpowers 或 ECC 文档塞进每个 prompt。

### Context Builder（上下文构建器）

`src/context-builder.ts` 收集轻量项目上下文：

- 当前工作目录
- Git 状态
- 存在时读取 README
- 存在时读取 package metadata
- 已有任务文件内容
- 当前 run state

### Codex Thread Adapter（Codex Thread 适配器）

`src/codex-thread.ts` 封装 Codex SDK thread 创建、执行和恢复行为。

### Trace Store（Trace 存储）

`src/trace-store.ts` 将 prompts、输出、已选择的 skills、阶段元数据和 run summaries 保存到 `.harnees/runs/<run-id>/`。

### Task Store（任务状态存储）

`src/task-store.ts` 为每个 run 创建和更新 `state.json`。

## 运行产物

每次运行都会在 `.harnees/runs/<run-id>/` 下写入产物。

示例：

```text
.harnees/
  runs/
    2026-04-18-001/
      state.json
      trace.json
      worktree.prompt.md
      worktree.output.md
      brainstorm.prompt.md
      brainstorm.output.md
      plan.prompt.md
      plan.output.md
      execute.prompt.md
      execute.output.md
      review.prompt.md
      review.output.md
      verify.prompt.md
      verify.output.md
      finish.prompt.md
      finish.output.md
```

生成的任务和计划文件：

```text
tasks/
  2026-04-18-001-task.md

docs/
  superpowers/
    plans/
      2026-04-18-001-plan.md
```

`state.json` 示例：

```json
{
  "runId": "2026-04-18-001",
  "status": "task_confirmed",
  "workflow": "bugfix",
  "workflowSource": "inferred",
  "currentPhase": "plan",
  "threadId": "codex-thread-id",
  "taskFile": "tasks/2026-04-18-001-task.md",
  "planFile": "docs/superpowers/plans/2026-04-18-001-plan.md",
  "createdAt": "2026-04-18T00:00:00.000Z",
  "updatedAt": "2026-04-18T00:00:00.000Z"
}
```

`trace.json` 示例：

```json
{
  "runId": "2026-04-18-001",
  "workflow": "bugfix",
  "phases": [
    {
      "id": "brainstorm",
      "skills": ["superpowers:brainstorming"],
      "promptPath": ".harnees/runs/2026-04-18-001/brainstorm.prompt.md",
      "outputPath": ".harnees/runs/2026-04-18-001/brainstorm.output.md",
      "status": "completed"
    }
  ]
}
```

## Prompt 组装

Harness 会从以下内容组装每个阶段的 prompt：

- 简短、稳定的 controller prompt
- Workflow 阶段目标
- 当前阶段的 skill 内容
- 项目上下文
- 任务文件或原始想法
- 当前 run state
- 停止条件

System prompt 保持最小。长指导内容保存在 skill 文件中，只在相关阶段加载。

每个阶段的 prompt 都必须包含语言要求：

```text
默认使用中文回答、提问、总结和生成任务/计划文档。命令、代码、文件路径、包名、API 名称、workflow id、skill id 保持原文。
```

如果用户用其他语言写初始任务，CLI 仍然默认使用中文，除非用户显式要求使用其他输出语言。

## 人工 Gate

MVP 在重要决策点使用人工 gate：

- 确认推断出的 workflow。
- 确认生成的 `task.md`。
- 确认生成的实现计划。
- 在存在阻塞性 review findings 时决定是否继续。
- 在记录验证证据后确认是否 finish。

CLI 会记录 gate 状态，并提示用户如何用 `harnees resume <run-id>` 继续。

## 错误处理

每个阶段都应该返回结构化结果：

- Status：`completed`、`waiting_for_user`、`blocked` 或 `failed`
- 摘要
- Next action
- Artifact paths

失败时，harness 会记录错误，并保持 run 可恢复。它不会丢弃 trace 数据。

## 后续路线图

### Phase 2：半自动验证

- 检测 package manager 和项目类型。
- 由 harness 运行 test、lint 和 typecheck 命令。
- 将失败输出反馈给同一个 Codex thread。
- 增加 `harnees verify`。

### Phase 3：Policy Engine

- Command allowlist。
- Destructive command approval。
- Protected file checks。
- Network 和 dependency install approval。

### Phase 4：真实 Subagent 执行

- 拆分 planner、executor、reviewer 和 verifier 角色。
- 先运行 spec compliance review，再运行 code quality review。
- 先保持串行执行，再为互不冲突的工作增加安全并行。

### Phase 5：GitHub 集成

- 从 GitHub issues 启动 runs。
- 读取 pull request 和 CI 状态。
- 生成 pull request description。
- 查询 PR checks。

### Phase 6：Eval 和 Dashboard

- 跟踪 pass rate。
- 跟踪 retry count。
- 跟踪 verification success rate。
- 支持从 traces 回放 task。
- 只有在 trace 质量稳定后，再增加小型本地 dashboard。

## MVP 决策

- 本地运行状态使用 `.harnees/`。
- 生成的任务和计划文件是普通项目产物。MVP 不会自动提交它们。
- 第一版实现直接面向 Codex SDK。如果实现时本地缺少 SDK，CLI 应该给出明确的 setup message，而不是静默切换为 shell 调用其他接口。

## 进入实现计划的批准标准

当以下条件满足时，本设计可以进入 implementation planning：

- 用户接受 Superpowers 生命周期作为主工作流。
- 用户接受 TypeScript 和 Node.js 作为实现栈。
- 用户接受 workflow 自动推断，并允许用 `--workflow` 可选覆盖。
- 用户接受 MVP 的验证是 prompt 驱动并记录到 trace，而不是由 harness 自己执行。
- 用户接受后续自动化 backlog 的推进顺序。
