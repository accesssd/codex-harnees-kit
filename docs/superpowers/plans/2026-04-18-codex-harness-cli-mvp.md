# Codex Harness CLI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 Harnees 的本地 TypeScript CLI MVP，让用户可以从中文 raw idea 启动 Superpowers 生命周期工作流，生成/保存 run state、trace、prompt 和输出，并支持 `start`、`resume`、`status`、`list`、`step` 命令。

**Architecture:** 采用轻量分层：CLI 只解析命令，workflow engine 负责编排阶段，stores 负责 `.harnees/runs/<run-id>/` 文件状态，skill loader 和 context builder 负责组装 prompt，Codex adapter 封装 SDK 调用并保持可测试。MVP 不实现自动测试 runner、policy engine、GitHub 集成或真正多 agent 并发。

**Tech Stack:** Node.js 18+、TypeScript、Commander、YAML、Zod、Vitest、tsx、`@openai/codex-sdk`。

---

## 文件结构

本计划会创建这些文件：

```text
package.json
tsconfig.json
vitest.config.ts
README.md

src/
  cli.ts
  codex-thread.ts
  context-builder.ts
  domain.ts
  fs-utils.ts
  prompt-builder.ts
  skill-loader.ts
  task-store.ts
  trace-store.ts
  workflow-engine.ts
  workflow-inference.ts
  workflow-loader.ts

test/
  context-builder.test.ts
  prompt-builder.test.ts
  skill-loader.test.ts
  task-store.test.ts
  trace-store.test.ts
  workflow-engine.test.ts
  workflow-inference.test.ts
  workflow-loader.test.ts

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
```

职责边界：

- `src/domain.ts`：所有共享类型和 Zod schema。
- `src/fs-utils.ts`：路径、目录创建、JSON 读写和文本读写。
- `src/workflow-loader.ts`：读取 `workflows/*.yaml` 并校验。
- `src/workflow-inference.ts`：根据 raw idea 或 task text 推断 workflow。
- `src/skill-loader.ts`：按 skill id 读取本地 `SKILL.md`。
- `src/context-builder.ts`：收集 git、README、package metadata、task/run state。
- `src/prompt-builder.ts`：组装阶段 prompt，强制中文默认输出要求。
- `src/task-store.ts`：管理 `.harnees/runs/<run-id>/state.json`。
- `src/trace-store.ts`：写入 prompt、output 和 `trace.json`。
- `src/codex-thread.ts`：封装 Codex SDK，可被测试替身替换。
- `src/workflow-engine.ts`：串联 workflow、context、skills、prompt、Codex 和 stores。
- `src/cli.ts`：Commander CLI。

---

### Task 1: 初始化 TypeScript CLI 工程

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Modify: `README.md`
- Create: `tasks/.gitkeep`

- [ ] **Step 1: 写入项目配置**

`package.json`：

```json
{
  "name": "codex-harnees-kit",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "harnees": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@openai/codex-sdk": "latest",
    "commander": "^12.1.0",
    "yaml": "^2.6.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node", "vitest"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
```

`README.md`：

```md
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
```

`tasks/.gitkeep` 是空文件。

- [ ] **Step 2: 安装依赖**

Run:

```bash
npm install
```

Expected: `package-lock.json` 被创建，命令以 exit code 0 结束。

- [ ] **Step 3: 验证空测试和类型检查**

Run:

```bash
npm run typecheck
npm test
```

Expected:

```text
TypeScript exits with code 0
No test files found
```

如果 Vitest 对无测试文件返回非零，先继续 Task 2；Task 2 会添加第一批测试。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts README.md tasks/.gitkeep
git commit -m "chore: scaffold typescript cli project"
```

---

### Task 2: 定义领域类型和文件工具

**Files:**
- Create: `src/domain.ts`
- Create: `src/fs-utils.ts`
- Create: `test/task-store.test.ts`

- [ ] **Step 1: 写失败测试，锁定 JSON 文件读写行为**

`test/task-store.test.ts`：

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonFile, writeJsonFile } from "../src/fs-utils.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("fs-utils", () => {
  it("writes parent directories before JSON content", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harnees-"));
    const filePath = join(tempDir, "nested", "state.json");

    await writeJsonFile(filePath, { status: "created" });

    await expect(readJsonFile(filePath)).resolves.toEqual({ status: "created" });
  });
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
npm test -- test/task-store.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../src/fs-utils.js'`。

- [ ] **Step 3: 创建类型和文件工具**

`src/domain.ts`：

```ts
import { z } from "zod";

export const PhaseIdSchema = z.enum([
  "worktree",
  "brainstorm",
  "plan",
  "execute",
  "review",
  "verify",
  "finish"
]);

export type PhaseId = z.infer<typeof PhaseIdSchema>;

export const WorkflowNameSchema = z.enum(["bugfix", "feature", "review", "ci-failure"]);
export type WorkflowName = z.infer<typeof WorkflowNameSchema>;

export const RunStatusSchema = z.enum([
  "created",
  "waiting_for_user",
  "running",
  "completed",
  "blocked",
  "failed"
]);

export type RunStatus = z.infer<typeof RunStatusSchema>;

export const WorkflowPhaseSchema = z.object({
  id: PhaseIdSchema,
  skills: z.array(z.string()).default([]),
  objective: z.string(),
  stopCondition: z.string().optional(),
  requiresConfirmation: z.boolean().default(false)
});

export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>;

export const WorkflowSchema = z.object({
  name: WorkflowNameSchema,
  phases: z.array(WorkflowPhaseSchema).min(1)
});

export type Workflow = z.infer<typeof WorkflowSchema>;

export const RunStateSchema = z.object({
  runId: z.string(),
  status: RunStatusSchema,
  workflow: WorkflowNameSchema,
  workflowSource: z.enum(["inferred", "explicit"]),
  currentPhase: PhaseIdSchema,
  threadId: z.string().optional(),
  taskFile: z.string().optional(),
  planFile: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type RunState = z.infer<typeof RunStateSchema>;

export type WorkflowInference = {
  workflow: WorkflowName;
  confidence: number;
  rationale: string[];
  requiresConfirmation: boolean;
  source: "inferred" | "explicit";
};

export type PhaseResult = {
  status: RunStatus;
  summary: string;
  nextAction: string;
  artifacts: string[];
};
```

`src/fs-utils.ts`：

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, content, "utf8");
}

export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  const content = await readTextFile(filePath);
  return JSON.parse(content) as T;
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run:

```bash
npm test -- test/task-store.test.ts
npm run typecheck
```

Expected: PASS，typecheck 无错误。

- [ ] **Step 5: Commit**

```bash
git add src/domain.ts src/fs-utils.ts test/task-store.test.ts
git commit -m "feat: add core domain types and file utilities"
```

---

### Task 3: 添加 workflow 配置和 loader

**Files:**
- Create: `workflows/bugfix.yaml`
- Create: `workflows/feature.yaml`
- Create: `workflows/review.yaml`
- Create: `workflows/ci-failure.yaml`
- Create: `src/workflow-loader.ts`
- Create: `test/workflow-loader.test.ts`

- [ ] **Step 1: 写失败测试**

`test/workflow-loader.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { loadWorkflow } from "../src/workflow-loader.js";

describe("workflow-loader", () => {
  it("loads bugfix workflow with the Superpowers lifecycle phases", async () => {
    const workflow = await loadWorkflow(process.cwd(), "bugfix");

    expect(workflow.name).toBe("bugfix");
    expect(workflow.phases.map((phase) => phase.id)).toEqual([
      "worktree",
      "brainstorm",
      "plan",
      "execute",
      "review",
      "verify",
      "finish"
    ]);
    expect(workflow.phases[1].skills).toContain("superpowers:brainstorming");
  });
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
npm test -- test/workflow-loader.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../src/workflow-loader.js'`。

- [ ] **Step 3: 创建 workflow 文件**

`workflows/bugfix.yaml`：

```yaml
name: bugfix
phases:
  - id: worktree
    skills:
      - superpowers:using-git-worktrees
    objective: 检查隔离分支或 worktree 状态。
  - id: brainstorm
    skills:
      - superpowers:brainstorming
    objective: 澄清 bug 范围并生成 task.md。
    requiresConfirmation: true
  - id: plan
    skills:
      - superpowers:writing-plans
    objective: 根据 task.md 生成实现计划。
    requiresConfirmation: true
  - id: execute
    skills:
      - superpowers:subagent-driven-development
      - superpowers:test-driven-development
      - ecc:tdd-workflow
    objective: 用 TDD 证据实现最小正确修复。
  - id: review
    skills:
      - superpowers:requesting-code-review
    objective: 做 spec compliance 和 code quality review。
  - id: verify
    skills:
      - superpowers:verification-before-completion
      - ecc:verification-loop
    objective: 要求完成前验证证据。
  - id: finish
    skills:
      - superpowers:finishing-a-development-branch
    objective: 汇总证据、风险和分支收尾建议。
```

`workflows/feature.yaml`、`workflows/review.yaml`、`workflows/ci-failure.yaml` 使用相同阶段顺序，分别将 `name` 改为对应 workflow，并调整 `brainstorm` 的 objective：

```yaml
name: feature
phases:
  - id: worktree
    skills:
      - superpowers:using-git-worktrees
    objective: 检查隔离分支或 worktree 状态。
  - id: brainstorm
    skills:
      - superpowers:brainstorming
    objective: 澄清功能范围并生成 task.md。
    requiresConfirmation: true
  - id: plan
    skills:
      - superpowers:writing-plans
    objective: 根据 task.md 生成实现计划。
    requiresConfirmation: true
  - id: execute
    skills:
      - superpowers:subagent-driven-development
      - superpowers:test-driven-development
      - ecc:tdd-workflow
    objective: 用 TDD 证据实现功能。
  - id: review
    skills:
      - superpowers:requesting-code-review
    objective: 做 spec compliance 和 code quality review。
  - id: verify
    skills:
      - superpowers:verification-before-completion
      - ecc:verification-loop
    objective: 要求完成前验证证据。
  - id: finish
    skills:
      - superpowers:finishing-a-development-branch
    objective: 汇总证据、风险和分支收尾建议。
```

`workflows/review.yaml` 使用同样阶段顺序，`name` 为 `review`，`brainstorm` 阶段的 `objective` 为 `澄清审查范围并生成 task.md。`

`workflows/ci-failure.yaml` 使用同样阶段顺序，`name` 为 `ci-failure`，`brainstorm` 阶段的 `objective` 为 `澄清 CI 失败现象并生成 task.md。`

- [ ] **Step 4: 实现 loader**

`src/workflow-loader.ts`：

```ts
import { join } from "node:path";
import { parse } from "yaml";
import { Workflow, WorkflowName, WorkflowSchema } from "./domain.js";
import { readTextFile } from "./fs-utils.js";

export async function loadWorkflow(cwd: string, name: WorkflowName): Promise<Workflow> {
  const workflowPath = join(cwd, "workflows", `${name}.yaml`);
  const content = await readTextFile(workflowPath);
  const parsed = parse(content);
  return WorkflowSchema.parse(parsed);
}
```

- [ ] **Step 5: 运行测试确认 GREEN**

Run:

```bash
npm test -- test/workflow-loader.test.ts
npm run typecheck
```

Expected: PASS，typecheck 无错误。

- [ ] **Step 6: Commit**

```bash
git add workflows src/workflow-loader.ts test/workflow-loader.test.ts
git commit -m "feat: add workflow definitions and loader"
```

---

### Task 4: 实现 workflow 推断

**Files:**
- Create: `src/workflow-inference.ts`
- Create: `test/workflow-inference.test.ts`

- [ ] **Step 1: 写失败测试**

`test/workflow-inference.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { inferWorkflow } from "../src/workflow-inference.js";

describe("workflow-inference", () => {
  it("infers bugfix for broken existing behavior", () => {
    const result = inferWorkflow("登录超时后页面会卡住");

    expect(result.workflow).toBe("bugfix");
    expect(result.source).toBe("inferred");
    expect(result.requiresConfirmation).toBe(true);
    expect(result.rationale.join("\n")).toContain("已有行为");
  });

  it("honors explicit workflow override", () => {
    const result = inferWorkflow("整理登录模块", "review");

    expect(result.workflow).toBe("review");
    expect(result.source).toBe("explicit");
    expect(result.requiresConfirmation).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
npm test -- test/workflow-inference.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../src/workflow-inference.js'`。

- [ ] **Step 3: 实现推断规则**

`src/workflow-inference.ts`：

```ts
import { WorkflowInference, WorkflowName } from "./domain.js";

const BUGFIX_TERMS = ["bug", "fix", "失败", "报错", "卡住", "异常", "不能", "错误", "超时"];
const REVIEW_TERMS = ["review", "审查", "检查", "评审"];
const CI_TERMS = ["ci", "build", "pipeline", "测试失败", "构建失败"];

export function inferWorkflow(input: string, explicitWorkflow?: WorkflowName): WorkflowInference {
  if (explicitWorkflow) {
    return {
      workflow: explicitWorkflow,
      confidence: 1,
      rationale: [`用户显式指定了 ${explicitWorkflow} workflow。`],
      requiresConfirmation: false,
      source: "explicit"
    };
  }

  const normalized = input.toLowerCase();

  if (CI_TERMS.some((term) => normalized.includes(term))) {
    return {
      workflow: "ci-failure",
      confidence: 0.82,
      rationale: ["需求描述中包含 CI、build 或 pipeline 失败信号。"],
      requiresConfirmation: true,
      source: "inferred"
    };
  }

  if (REVIEW_TERMS.some((term) => normalized.includes(term))) {
    return {
      workflow: "review",
      confidence: 0.76,
      rationale: ["需求目标更像审查已有实现，而不是立即修改代码。"],
      requiresConfirmation: true,
      source: "inferred"
    };
  }

  if (BUGFIX_TERMS.some((term) => normalized.includes(term))) {
    return {
      workflow: "bugfix",
      confidence: 0.8,
      rationale: ["这个需求描述的是已有行为出错。", "预期结果是修复问题，而不是新增能力。"],
      requiresConfirmation: true,
      source: "inferred"
    };
  }

  return {
    workflow: "feature",
    confidence: 0.62,
    rationale: ["没有明显的 bug、CI 或 review 信号，默认按新功能处理。"],
    requiresConfirmation: true,
    source: "inferred"
  };
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run:

```bash
npm test -- test/workflow-inference.test.ts
npm run typecheck
```

Expected: PASS，typecheck 无错误。

- [ ] **Step 5: Commit**

```bash
git add src/workflow-inference.ts test/workflow-inference.test.ts
git commit -m "feat: infer workflow from task intent"
```

---

### Task 5: 实现 skill registry 和 loader

**Files:**
- Create: `config/skills.json`
- Create: `src/skill-loader.ts`
- Create: `test/skill-loader.test.ts`

- [ ] **Step 1: 写失败测试**

`test/skill-loader.test.ts`：

```ts
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSkills } from "../src/skill-loader.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("skill-loader", () => {
  it("loads skill markdown by id", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harnees-skills-"));
    const skillPath = join(tempDir, "brainstorming", "SKILL.md");
    await mkdir(join(tempDir, "brainstorming"), { recursive: true });
    await writeFile(skillPath, "# Brainstorming\n\nUse before coding.\n", "utf8");
    const registryPath = join(tempDir, "skills.json");
    await writeFile(
      registryPath,
      JSON.stringify({ "superpowers:brainstorming": skillPath }, null, 2),
      "utf8"
    );

    const skills = await loadSkills(registryPath, ["superpowers:brainstorming"]);

    expect(skills).toEqual([
      {
        id: "superpowers:brainstorming",
        path: skillPath,
        content: "# Brainstorming\n\nUse before coding.\n"
      }
    ]);
  });
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
npm test -- test/skill-loader.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../src/skill-loader.js'`。

- [ ] **Step 3: 添加 registry 和 loader**

`config/skills.json`：

```json
{
  "superpowers:using-git-worktrees": "C:/Users/Admin/.codex/plugins/cache/openai-curated/superpowers/b1986b3d3da5bb8a04d3cb1e69af5a29bb5c2c04/skills/using-git-worktrees/SKILL.md",
  "superpowers:brainstorming": "C:/Users/Admin/.codex/plugins/cache/openai-curated/superpowers/b1986b3d3da5bb8a04d3cb1e69af5a29bb5c2c04/skills/brainstorming/SKILL.md",
  "superpowers:writing-plans": "C:/Users/Admin/.codex/plugins/cache/openai-curated/superpowers/b1986b3d3da5bb8a04d3cb1e69af5a29bb5c2c04/skills/writing-plans/SKILL.md",
  "superpowers:subagent-driven-development": "C:/Users/Admin/.codex/plugins/cache/openai-curated/superpowers/b1986b3d3da5bb8a04d3cb1e69af5a29bb5c2c04/skills/subagent-driven-development/SKILL.md",
  "superpowers:test-driven-development": "C:/Users/Admin/.codex/plugins/cache/openai-curated/superpowers/b1986b3d3da5bb8a04d3cb1e69af5a29bb5c2c04/skills/test-driven-development/SKILL.md",
  "superpowers:requesting-code-review": "C:/Users/Admin/.codex/plugins/cache/openai-curated/superpowers/b1986b3d3da5bb8a04d3cb1e69af5a29bb5c2c04/skills/requesting-code-review/SKILL.md",
  "superpowers:verification-before-completion": "C:/Users/Admin/.codex/plugins/cache/openai-curated/superpowers/b1986b3d3da5bb8a04d3cb1e69af5a29bb5c2c04/skills/verification-before-completion/SKILL.md",
  "superpowers:finishing-a-development-branch": "C:/Users/Admin/.codex/plugins/cache/openai-curated/superpowers/b1986b3d3da5bb8a04d3cb1e69af5a29bb5c2c04/skills/finishing-a-development-branch/SKILL.md",
  "ecc:tdd-workflow": "C:/Users/Admin/.codex/plugins/cache/ecc/ecc/1.10.0/skills/tdd-workflow/SKILL.md",
  "ecc:verification-loop": "C:/Users/Admin/.codex/plugins/cache/ecc/ecc/1.10.0/skills/verification-loop/SKILL.md"
}
```

`src/skill-loader.ts`：

```ts
import { readJsonFile, readTextFile } from "./fs-utils.js";

export type LoadedSkill = {
  id: string;
  path: string;
  content: string;
};

export async function loadSkillRegistry(registryPath: string): Promise<Record<string, string>> {
  return readJsonFile<Record<string, string>>(registryPath);
}

export async function loadSkills(registryPath: string, ids: string[]): Promise<LoadedSkill[]> {
  const registry = await loadSkillRegistry(registryPath);

  return Promise.all(
    ids.map(async (id) => {
      const path = registry[id];
      if (!path) {
        throw new Error(`Skill is not registered: ${id}`);
      }
      const content = await readTextFile(path);
      return { id, path, content };
    })
  );
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run:

```bash
npm test -- test/skill-loader.test.ts
npm run typecheck
```

Expected: PASS，typecheck 无错误。

- [ ] **Step 5: Commit**

```bash
git add config/skills.json src/skill-loader.ts test/skill-loader.test.ts
git commit -m "feat: load workflow skills from registry"
```

---

### Task 6: 实现 task state 和 trace store

**Files:**
- Create: `src/task-store.ts`
- Create: `src/trace-store.ts`
- Modify: `test/task-store.test.ts`
- Create: `test/trace-store.test.ts`

- [ ] **Step 1: 添加失败测试**

在 `test/task-store.test.ts` 追加：

```ts
import { createRunState, loadRunState, saveRunState } from "../src/task-store.js";

describe("task-store", () => {
  it("creates and persists run state under .harnees/runs", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harnees-state-"));

    const state = await createRunState(tempDir, {
      runId: "2026-04-18-001",
      workflow: "bugfix",
      workflowSource: "inferred"
    });

    expect(state.currentPhase).toBe("worktree");
    expect(state.status).toBe("created");

    await saveRunState(tempDir, { ...state, status: "waiting_for_user" });
    await expect(loadRunState(tempDir, "2026-04-18-001")).resolves.toMatchObject({
      runId: "2026-04-18-001",
      status: "waiting_for_user"
    });
  });
});
```

`test/trace-store.test.ts`：

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendTracePhase, writePhaseArtifact } from "../src/trace-store.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("trace-store", () => {
  it("writes phase artifacts and trace metadata", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harnees-trace-"));

    const promptPath = await writePhaseArtifact(tempDir, "2026-04-18-001", "brainstorm", "prompt", "你好");
    await appendTracePhase(tempDir, "2026-04-18-001", {
      id: "brainstorm",
      skills: ["superpowers:brainstorming"],
      promptPath,
      outputPath: ".harnees/runs/2026-04-18-001/brainstorm.output.md",
      status: "completed"
    });

    expect(promptPath).toBe(".harnees/runs/2026-04-18-001/brainstorm.prompt.md");
  });
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
npm test -- test/task-store.test.ts test/trace-store.test.ts
```

Expected: FAIL，缺少 `task-store.js` 和 `trace-store.js`。

- [ ] **Step 3: 实现 stores**

`src/task-store.ts`：

```ts
import { join } from "node:path";
import { RunState, RunStateSchema, WorkflowName } from "./domain.js";
import { readJsonFile, writeJsonFile } from "./fs-utils.js";

export function runDir(cwd: string, runId: string): string {
  return join(cwd, ".harnees", "runs", runId);
}

export function statePath(cwd: string, runId: string): string {
  return join(runDir(cwd, runId), "state.json");
}

export async function createRunState(
  cwd: string,
  input: { runId: string; workflow: WorkflowName; workflowSource: "inferred" | "explicit" }
): Promise<RunState> {
  const now = new Date().toISOString();
  const state: RunState = {
    runId: input.runId,
    status: "created",
    workflow: input.workflow,
    workflowSource: input.workflowSource,
    currentPhase: "worktree",
    createdAt: now,
    updatedAt: now
  };
  await saveRunState(cwd, state);
  return state;
}

export async function saveRunState(cwd: string, state: RunState): Promise<void> {
  const next = { ...state, updatedAt: new Date().toISOString() };
  await writeJsonFile(statePath(cwd, state.runId), RunStateSchema.parse(next));
}

export async function loadRunState(cwd: string, runId: string): Promise<RunState> {
  return RunStateSchema.parse(await readJsonFile(statePath(cwd, runId)));
}
```

`src/trace-store.ts`：

```ts
import { join } from "node:path";
import { PhaseId, RunStatus } from "./domain.js";
import { readJsonFile, writeJsonFile, writeTextFile } from "./fs-utils.js";
import { runDir } from "./task-store.js";

export type TracePhase = {
  id: PhaseId;
  skills: string[];
  promptPath: string;
  outputPath: string;
  status: RunStatus;
};

export type Trace = {
  runId: string;
  phases: TracePhase[];
};

export function relativeArtifactPath(runId: string, phase: PhaseId, kind: "prompt" | "output"): string {
  return `.harnees/runs/${runId}/${phase}.${kind}.md`;
}

export async function writePhaseArtifact(
  cwd: string,
  runId: string,
  phase: PhaseId,
  kind: "prompt" | "output",
  content: string
): Promise<string> {
  const relativePath = relativeArtifactPath(runId, phase, kind);
  await writeTextFile(join(cwd, relativePath), content);
  return relativePath;
}

export async function appendTracePhase(cwd: string, runId: string, phase: TracePhase): Promise<void> {
  const tracePath = join(runDir(cwd, runId), "trace.json");
  let trace: Trace = { runId, phases: [] };
  try {
    trace = await readJsonFile<Trace>(tracePath);
  } catch {
    trace = { runId, phases: [] };
  }
  const phases = trace.phases.filter((item) => item.id !== phase.id);
  phases.push(phase);
  await writeJsonFile(tracePath, { runId, phases });
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run:

```bash
npm test -- test/task-store.test.ts test/trace-store.test.ts
npm run typecheck
```

Expected: PASS，typecheck 无错误。

- [ ] **Step 5: Commit**

```bash
git add src/task-store.ts src/trace-store.ts test/task-store.test.ts test/trace-store.test.ts
git commit -m "feat: persist run state and traces"
```

---

### Task 7: 实现 context builder 和 prompt builder

**Files:**
- Create: `src/context-builder.ts`
- Create: `src/prompt-builder.ts`
- Create: `prompts/controller.md`
- Create: `prompts/phase.md`
- Create: `test/context-builder.test.ts`
- Create: `test/prompt-builder.test.ts`

- [ ] **Step 1: 写失败测试**

`test/prompt-builder.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { buildPhasePrompt } from "../src/prompt-builder.js";

describe("prompt-builder", () => {
  it("includes Chinese language rule and phase skills", () => {
    const prompt = buildPhasePrompt({
      controllerPrompt: "你是 Harnees controller。",
      phaseTemplate: "阶段：{{phaseId}}\n目标：{{objective}}",
      phaseId: "brainstorm",
      objective: "澄清任务",
      skills: [{ id: "superpowers:brainstorming", path: "x", content: "# Brainstorming" }],
      context: "README: test",
      taskInput: "登录超时后页面会卡住",
      runState: "status=created"
    });

    expect(prompt).toContain("默认使用中文回答");
    expect(prompt).toContain("superpowers:brainstorming");
    expect(prompt).toContain("# Brainstorming");
  });
});
```

`test/context-builder.test.ts`：

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProjectContext } from "../src/context-builder.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("context-builder", () => {
  it("includes README and package metadata when present", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harnees-context-"));
    await writeFile(join(tempDir, "README.md"), "# Demo\n", "utf8");
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "demo" }), "utf8");

    const context = await buildProjectContext(tempDir);

    expect(context).toContain("# Demo");
    expect(context).toContain('"name": "demo"');
  });
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
npm test -- test/prompt-builder.test.ts test/context-builder.test.ts
```

Expected: FAIL，缺少 builder 模块。

- [ ] **Step 3: 实现 builders**

`prompts/controller.md`：

```md
你是 Harnees workflow harness 的 Codex 执行代理。

你必须遵守当前 phase 的目标和停止条件。
默认使用中文回答、提问、总结和生成任务/计划文档。
命令、代码、文件路径、包名、API 名称、workflow id、skill id 保持原文。
```

`prompts/phase.md`：

```md
阶段：{{phaseId}}

目标：
{{objective}}

当前 run state：
{{runState}}

项目上下文：
{{context}}

任务输入：
{{taskInput}}

加载的 skills：
{{skills}}
```

`src/context-builder.ts`：

```ts
import { access } from "node:fs/promises";
import { join } from "node:path";
import { readTextFile } from "./fs-utils.js";

async function readIfExists(path: string): Promise<string> {
  try {
    await access(path);
    return readTextFile(path);
  } catch {
    return "";
  }
}

export async function buildProjectContext(cwd: string): Promise<string> {
  const readme = await readIfExists(join(cwd, "README.md"));
  const packageJson = await readIfExists(join(cwd, "package.json"));

  return [
    `cwd: ${cwd}`,
    readme ? `README.md:\n${readme}` : "README.md: not found",
    packageJson ? `package.json:\n${packageJson}` : "package.json: not found"
  ].join("\n\n");
}
```

`src/prompt-builder.ts`：

```ts
import { PhaseId } from "./domain.js";
import { LoadedSkill } from "./skill-loader.js";

export type BuildPhasePromptInput = {
  controllerPrompt: string;
  phaseTemplate: string;
  phaseId: PhaseId;
  objective: string;
  skills: LoadedSkill[];
  context: string;
  taskInput: string;
  runState: string;
};

const LANGUAGE_RULE =
  "默认使用中文回答、提问、总结和生成任务/计划文档。命令、代码、文件路径、包名、API 名称、workflow id、skill id 保持原文。";

export function buildPhasePrompt(input: BuildPhasePromptInput): string {
  const skillContent = input.skills
    .map((skill) => `## ${skill.id}\nPath: ${skill.path}\n\n${skill.content}`)
    .join("\n\n---\n\n");

  const body = input.phaseTemplate
    .replaceAll("{{phaseId}}", input.phaseId)
    .replaceAll("{{objective}}", input.objective)
    .replaceAll("{{runState}}", input.runState)
    .replaceAll("{{context}}", input.context)
    .replaceAll("{{taskInput}}", input.taskInput)
    .replaceAll("{{skills}}", skillContent);

  return [input.controllerPrompt, LANGUAGE_RULE, body].join("\n\n---\n\n");
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run:

```bash
npm test -- test/prompt-builder.test.ts test/context-builder.test.ts
npm run typecheck
```

Expected: PASS，typecheck 无错误。

- [ ] **Step 5: Commit**

```bash
git add prompts src/context-builder.ts src/prompt-builder.ts test/context-builder.test.ts test/prompt-builder.test.ts
git commit -m "feat: build chinese phase prompts"
```

---

### Task 8: 实现 Codex adapter 和 workflow engine

**Files:**
- Create: `src/codex-thread.ts`
- Create: `src/workflow-engine.ts`
- Create: `test/workflow-engine.test.ts`

- [ ] **Step 1: 写失败测试**

`test/workflow-engine.test.ts`：

```ts
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPhase } from "../src/workflow-engine.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("workflow-engine", () => {
  it("runs one phase and records output", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harnees-engine-"));
    await mkdir(join(tempDir, "workflows"), { recursive: true });
    await mkdir(join(tempDir, "config"), { recursive: true });
    await mkdir(join(tempDir, "prompts"), { recursive: true });
    await writeFile(join(tempDir, "README.md"), "# Demo\n", "utf8");
    await writeFile(join(tempDir, "prompts", "controller.md"), "controller", "utf8");
    await writeFile(join(tempDir, "prompts", "phase.md"), "phase {{phaseId}} {{skills}}", "utf8");
    const skillPath = join(tempDir, "SKILL.md");
    await writeFile(skillPath, "# Skill\n", "utf8");
    await writeFile(join(tempDir, "config", "skills.json"), JSON.stringify({ "superpowers:brainstorming": skillPath }), "utf8");
    await writeFile(
      join(tempDir, "workflows", "bugfix.yaml"),
      "name: bugfix\nphases:\n  - id: brainstorm\n    skills:\n      - superpowers:brainstorming\n    objective: test\n",
      "utf8"
    );

    const result = await runPhase({
      cwd: tempDir,
      runId: "2026-04-18-001",
      workflow: "bugfix",
      phaseId: "brainstorm",
      taskInput: "登录超时后页面会卡住",
      workflowSource: "inferred",
      codex: {
        run: async () => ({ threadId: "thread-1", output: "阶段完成" })
      }
    });

    expect(result.status).toBe("completed");
    expect(result.summary).toContain("阶段完成");
  });
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
npm test -- test/workflow-engine.test.ts
```

Expected: FAIL，缺少 `workflow-engine.js`。

- [ ] **Step 3: 实现 Codex adapter 和 engine**

`src/codex-thread.ts`：

```ts
export type CodexRunResult = {
  threadId: string;
  output: string;
};

export type CodexRunner = {
  run(input: { prompt: string; threadId?: string }): Promise<CodexRunResult>;
};

export class CodexSdkRunner implements CodexRunner {
  async run(input: { prompt: string; threadId?: string }): Promise<CodexRunResult> {
    const mod = await import("@openai/codex-sdk");
    const Codex = (mod as { Codex?: new () => unknown }).Codex;
    if (!Codex) {
      throw new Error("@openai/codex-sdk does not export Codex. Please verify Codex SDK setup.");
    }
    const client = new Codex() as {
      startThread: () => {
        id?: string;
        run: (prompt: string) => Promise<unknown>;
      };
    };
    const thread = client.startThread();
    const output = await thread.run(input.prompt);
    return {
      threadId: input.threadId ?? thread.id ?? "unknown-thread",
      output: typeof output === "string" ? output : JSON.stringify(output, null, 2)
    };
  }
}
```

`src/workflow-engine.ts`：

```ts
import { join } from "node:path";
import { PhaseId, PhaseResult, WorkflowName } from "./domain.js";
import { readTextFile } from "./fs-utils.js";
import { writeTextFile } from "./fs-utils.js";
import { buildProjectContext } from "./context-builder.js";
import { CodexRunner } from "./codex-thread.js";
import { buildPhasePrompt } from "./prompt-builder.js";
import { loadSkills } from "./skill-loader.js";
import { createRunState, loadRunState, saveRunState } from "./task-store.js";
import { appendTracePhase, writePhaseArtifact } from "./trace-store.js";
import { loadWorkflow } from "./workflow-loader.js";

export type RunPhaseInput = {
  cwd: string;
  runId: string;
  workflow: WorkflowName;
  workflowSource: "inferred" | "explicit";
  phaseId: PhaseId;
  taskInput: string;
  codex: CodexRunner;
};

export async function runPhase(input: RunPhaseInput): Promise<PhaseResult> {
  const workflow = await loadWorkflow(input.cwd, input.workflow);
  const phase = workflow.phases.find((item) => item.id === input.phaseId);
  if (!phase) {
    throw new Error(`Phase ${input.phaseId} is not defined in workflow ${input.workflow}.`);
  }

  let state = await createRunState(input.cwd, {
    runId: input.runId,
    workflow: input.workflow,
    workflowSource: input.workflowSource
  });
  try {
    state = await loadRunState(input.cwd, input.runId);
  } catch {
    await saveRunState(input.cwd, state);
  }

  const [controllerPrompt, phaseTemplate, context, skills] = await Promise.all([
    readTextFile(join(input.cwd, "prompts", "controller.md")),
    readTextFile(join(input.cwd, "prompts", "phase.md")),
    buildProjectContext(input.cwd),
    loadSkills(join(input.cwd, "config", "skills.json"), phase.skills)
  ]);

  const prompt = buildPhasePrompt({
    controllerPrompt,
    phaseTemplate,
    phaseId: phase.id,
    objective: phase.objective,
    skills,
    context,
    taskInput: input.taskInput,
    runState: JSON.stringify(state, null, 2)
  });

  const promptPath = await writePhaseArtifact(input.cwd, input.runId, phase.id, "prompt", prompt);
  const codexResult = await input.codex.run({ prompt, threadId: state.threadId });
  const outputPath = await writePhaseArtifact(input.cwd, input.runId, phase.id, "output", codexResult.output);
  const taskFile = phase.id === "brainstorm" ? `tasks/${input.runId}-task.md` : state.taskFile;
  const planFile = phase.id === "plan" ? `docs/superpowers/plans/${input.runId}-plan.md` : state.planFile;

  if (phase.id === "brainstorm" && taskFile) {
    await writeTextFile(join(input.cwd, taskFile), codexResult.output);
  }

  if (phase.id === "plan" && planFile) {
    await writeTextFile(join(input.cwd, planFile), codexResult.output);
  }

  await appendTracePhase(input.cwd, input.runId, {
    id: phase.id,
    skills: phase.skills,
    promptPath,
    outputPath,
    status: "completed"
  });

  await saveRunState(input.cwd, {
    ...state,
    status: phase.requiresConfirmation ? "waiting_for_user" : "completed",
    currentPhase: phase.id,
    threadId: codexResult.threadId,
    taskFile,
    planFile
  });

  return {
    status: "completed",
    summary: codexResult.output,
    nextAction: phase.requiresConfirmation ? `请确认后运行 harnees resume ${input.runId}` : "可以进入下一阶段。",
    artifacts: [promptPath, outputPath]
  };
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run:

```bash
npm test -- test/workflow-engine.test.ts
npm run typecheck
```

Expected: PASS，typecheck 无错误。

- [ ] **Step 5: Commit**

```bash
git add src/codex-thread.ts src/workflow-engine.ts test/workflow-engine.test.ts
git commit -m "feat: run workflow phases through codex adapter"
```

---

### Task 9: 实现 CLI 命令

**Files:**
- Create: `src/cli.ts`
- Modify: `package.json`

- [ ] **Step 1: 添加 CLI 入口**

`src/cli.ts`：

```ts
#!/usr/bin/env node
import { Command } from "commander";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CodexSdkRunner } from "./codex-thread.js";
import { PhaseIdSchema, WorkflowNameSchema } from "./domain.js";
import { readTextFile } from "./fs-utils.js";
import { loadRunState } from "./task-store.js";
import { runPhase } from "./workflow-engine.js";
import { inferWorkflow } from "./workflow-inference.js";

function createRunId(): string {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = String(Date.now()).slice(-4);
  return `${date}-${suffix}`;
}

const program = new Command();

program.name("harnees").description("Codex workflow harness").version("0.1.0");

program
  .command("start")
  .argument("[idea]", "原始任务想法")
  .option("--task <path>", "已有 task.md 路径")
  .option("--workflow <name>", "显式 workflow 覆盖")
  .action(async (idea: string | undefined, options: { task?: string; workflow?: string }) => {
    const cwd = process.cwd();
    const taskInput = options.task ? await readTextFile(join(cwd, options.task)) : idea;
    if (!taskInput) {
      throw new Error("请提供 raw idea，或使用 --task 指定任务文件。");
    }

    const explicitWorkflow = options.workflow ? WorkflowNameSchema.parse(options.workflow) : undefined;
    const inference = inferWorkflow(taskInput, explicitWorkflow);
    const runId = createRunId();

    console.log(`检测到的工作流：${inference.workflow}`);
    console.log("判断原因：");
    for (const reason of inference.rationale) {
      console.log(`- ${reason}`);
    }
    console.log(`run id：${runId}`);

    const result = await runPhase({
      cwd,
      runId,
      workflow: inference.workflow,
      workflowSource: inference.source,
      phaseId: "brainstorm",
      taskInput,
      codex: new CodexSdkRunner()
    });

    console.log(result.summary);
    console.log(`下一步：${result.nextAction}`);
  });

program.command("status").argument("<run-id>").action(async (runId: string) => {
  const state = await loadRunState(process.cwd(), runId);
  console.log(JSON.stringify(state, null, 2));
});

program.command("list").action(async () => {
  const runsDir = join(process.cwd(), ".harnees", "runs");
  const entries = await readdir(runsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      console.log(entry.name);
    }
  }
});

program.command("resume").argument("<run-id>").action(async (runId: string) => {
  const state = await loadRunState(process.cwd(), runId);
  console.log(`当前阶段：${state.currentPhase}`);
  console.log("MVP resume 会读取状态并提示下一步；自动推进将在后续任务中扩展。");
});

program.command("step").argument("<run-id>").argument("<phase>").action(async (runId: string, phase: string) => {
  const cwd = process.cwd();
  const state = await loadRunState(cwd, runId);
  const phaseId = PhaseIdSchema.parse(phase);
  const taskInput = state.taskFile ? await readTextFile(join(cwd, state.taskFile)) : "";
  const result = await runPhase({
    cwd,
    runId,
    workflow: state.workflow,
    workflowSource: state.workflowSource,
    phaseId,
    taskInput,
    codex: new CodexSdkRunner()
  });
  console.log(result.summary);
  console.log(`下一步：${result.nextAction}`);
});

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
```

Update `package.json` to ensure build output is executable through `bin` already defined in Task 1. No new script is required.

- [ ] **Step 2: 运行类型检查**

Run:

```bash
npm run typecheck
```

Expected: PASS。

- [ ] **Step 3: 运行 CLI smoke**

Run:

```bash
npm run dev -- list
```

Expected: exit code 0，若还没有 `.harnees/runs`，输出为空。

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts package.json
git commit -m "feat: add harnees cli commands"
```

---

### Task 10: 最终验证和 README 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README 使用说明**

追加：

```md
## 工作流

MVP 默认从 `brainstorm` 阶段开始，让用户先确认 `task.md`。`--workflow` 不是必填项；未提供时，Harnees 会根据任务内容自动推断 workflow，并用中文解释判断原因。

## 设计文档

- `docs/superpowers/specs/2026-04-18-codex-harness-cli-design.md`
- `docs/superpowers/plans/2026-04-18-codex-harness-cli-mvp.md`

## 后续阶段

- Phase 2：由 harness 运行 test/lint/typecheck，并把失败输出反馈给 Codex thread。
- Phase 3：增加 command allowlist、protected files 和 approval policy。
- Phase 4：接入真正的 planner/executor/reviewer/verifier subagent 流程。
```

- [ ] **Step 2: 全量验证**

Run:

```bash
npm test
npm run typecheck
npm run build
git status --short
```

Expected:

```text
所有 Vitest tests PASS
typecheck PASS
build PASS
git status 只显示本任务预期修改
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/plans/2026-04-18-codex-harness-cli-mvp.md
git commit -m "docs: add harness mvp implementation plan"
```

---

## 自审清单

- Spec 覆盖：计划覆盖了默认中文、workflow 推断、`--workflow` 覆盖、Superpowers 生命周期、skill loading、prompt/trace/state、resume/status/list/step 命令和 MVP 非目标。
- 占位符扫描：计划没有未决占位项，也没有要求执行者自行补齐的空洞步骤。
- 类型一致性：`WorkflowName`、`PhaseId`、`RunState`、`Workflow`、`PhaseResult` 在任务 2 定义，后续任务复用相同名称。
- 风险：`@openai/codex-sdk` 的实际导出形态可能与 `CodexSdkRunner` 示例不同。实现时如果 SDK API 不匹配，应保持 adapter 接口和测试不变，只调整 `CodexSdkRunner` 内部，并给出清晰 setup message。

## 执行选项

Plan complete and saved to `docs/superpowers/plans/2026-04-18-codex-harness-cli-mvp.md`. Two execution options:

1. **Subagent-Driven（推荐）** - 每个任务派发 fresh subagent，任务间做 review，迭代快。
2. **Inline Execution** - 在当前 session 按计划逐步执行，带 checkpoint。

请选择执行方式。
