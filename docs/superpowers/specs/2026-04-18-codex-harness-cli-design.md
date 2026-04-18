# Codex Harness CLI Design

## Summary

Harnees is a local TypeScript CLI that turns Codex Agent SDK usage into a repeatable engineering workflow. It uses Superpowers as the development lifecycle, ECC as the reusable capability catalog, and Codex as the execution engine.

The MVP is a workflow orchestrator, not a new agent framework. It helps a user start from a raw idea, confirm a task file through brainstorming, generate an implementation plan, execute the work with Codex, review the result, require verification evidence, and finish the branch.

## Goals

- Provide a local CLI for running structured Codex development workflows.
- Use the Superpowers lifecycle as the default process:
  worktree, brainstorm, plan, execute, per-task TDD, review, verify, finish.
- Use ECC skills as domain-specific guidance and operational playbooks.
- Infer the workflow by default, while allowing `--workflow` as an explicit override.
- Make the brainstorming step produce an approved `task.md` before implementation starts.
- Save prompts, outputs, selected skills, workflow state, and trace data for every run.
- Support resuming a run from its saved state.

## Non-Goals For MVP

- Do not build a web dashboard.
- Do not implement a full command allowlist or approval engine.
- Do not automatically run tests, lint, or typecheck from the harness itself.
- Do not automatically push commits or create pull requests.
- Do not implement true concurrent multi-agent execution.
- Do not replace Codex shell permissions or filesystem controls.

These capabilities are planned as follow-up phases after the workflow orchestration loop is stable.

## User Experience

The primary command starts from a raw idea:

```bash
harnees start "login timeout leaves the page stuck"
```

The CLI infers a workflow, explains the classification, and asks the user to confirm it during the brainstorming phase. For example:

```text
Detected workflow: bugfix

Reason:
- The request describes broken existing behavior.
- The expected outcome is a fix, not a new capability.

Proceed with bugfix? yes/no
```

If the user already has a task file:

```bash
harnees start --task tasks/fix-login-timeout.md
```

If deterministic behavior is needed, `--workflow` overrides inference:

```bash
harnees start "login timeout leaves the page stuck" --workflow bugfix
```

`--workflow` is optional. It exists for scripts, CI, and advanced users who already know which workflow they want.

Supporting commands:

```bash
harnees resume <run-id>
harnees status <run-id>
harnees list
harnees step <run-id> <phase>
```

`step` allows a user to manually advance or rerun a phase, such as:

```bash
harnees step 2026-04-18-001 verify
```

## Superpowers Lifecycle

The MVP keeps the full Superpowers lifecycle visible even though some steps are manual or prompt-driven in the first version.

### 1. Worktree

Skills:

- `superpowers:using-git-worktrees`

MVP behavior:

- Inspect git status.
- Warn if the worktree is dirty.
- Recommend creating an isolated branch or worktree.
- Record the decision in run state.

The MVP does not automatically create a worktree unless the user explicitly requests it.

### 2. Brainstorm

Skills:

- `superpowers:brainstorming`

MVP behavior:

- Start from a raw idea or existing task file.
- Infer the likely workflow unless `--workflow` is supplied.
- Clarify the task with the user.
- Produce a task file under `tasks/`.
- Require user confirmation before moving to planning.

The task file must include:

- Goal
- Context
- Expected behavior
- Non-goals
- Success criteria
- Workflow and classification rationale

### 3. Plan

Skills:

- `superpowers:writing-plans`
- `ecc:blueprint` for larger multi-session or multi-PR work

MVP behavior:

- Generate an implementation plan from the confirmed task file.
- Save the plan under `docs/superpowers/plans/`.
- Record the plan path in run state.

### 4. Execute

Skills:

- `superpowers:subagent-driven-development`

MVP behavior:

- Use one Codex thread to execute the plan serially.
- Preserve the subagent-driven-development model in the prompt and trace.
- Record future upgrade points for planner, executor, reviewer, and verifier roles.

True multi-agent dispatch is deferred until a later phase.

### 5. Per-Task TDD

Skills:

- `superpowers:test-driven-development`
- `ecc:tdd-workflow`

MVP behavior:

- Require the agent to follow a RED, GREEN, REFACTOR loop where practical.
- Ask for evidence that the failing test is meaningful before production changes.
- Save any reported verification commands and outputs in the trace.

The MVP relies on Codex to run commands inside its session. The harness records evidence but does not run test commands itself.

### 6. Review

Skills:

- `superpowers:requesting-code-review`

MVP behavior:

- Ask Codex to review the implementation after execution.
- Separate spec compliance review from code quality review.
- Record findings and whether they are blocking.

### 7. Verify

Skills:

- `superpowers:verification-before-completion`
- `ecc:verification-loop`

MVP behavior:

- Require command evidence before the run can be considered complete.
- Ask Codex to report relevant tests, lint, typecheck, or manual verification steps.
- Save verification output in trace files.

The MVP does not claim success unless evidence is recorded.

### 8. Finish

Skills:

- `superpowers:finishing-a-development-branch`

MVP behavior:

- Summarize changed files, evidence, and remaining risks.
- Suggest commit, pull request, or cleanup next steps.
- Do not push or create a pull request automatically.

## Workflows

A workflow is a named configuration that tunes the lifecycle for a task type. Workflows are inferred by default and can be overridden with `--workflow`.

Initial workflows:

- `bugfix`
- `feature`
- `review`
- `ci-failure`

Each workflow defines:

- Phase order
- Skills loaded per phase
- Phase objective
- Stop condition
- Manual confirmation gates

Example:

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

## Project Structure

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

## Module Responsibilities

### CLI

`src/cli.ts` parses user commands and delegates to the workflow engine.

Supported MVP commands:

- `start`
- `resume`
- `status`
- `list`
- `step`

### Workflow Engine

`src/workflow-engine.ts` loads workflow YAML, determines the current phase, loads phase skills, builds prompts, calls Codex, and advances run state.

### Workflow Inference

`src/workflow-inference.ts` classifies raw ideas or task files into a likely workflow.

The inference result includes:

- Workflow name
- Confidence
- Rationale
- Whether confirmation is required

If `--workflow` is provided, inference is skipped and the workflow source is recorded as `explicit`.

### Skill Registry

`src/skill-registry.ts` maps skill names to local `SKILL.md` files.

The MVP registry covers only the skills used by the initial workflows. Additional ECC skills can be added later as workflow coverage grows.

### Skill Loader

`src/skill-loader.ts` loads skill content for the active phase only. It avoids loading every Superpowers or ECC document into every prompt.

### Context Builder

`src/context-builder.ts` collects lightweight project context:

- Current working directory
- Git status
- README when present
- Package metadata when present
- Existing task file content
- Current run state

### Codex Thread Adapter

`src/codex-thread.ts` wraps Codex SDK thread creation, execution, and resume behavior.

### Trace Store

`src/trace-store.ts` saves prompts, outputs, selected skills, phase metadata, and run summaries under `.harnees/runs/<run-id>/`.

### Task Store

`src/task-store.ts` creates and updates `state.json` for each run.

## Run Artifacts

Every run writes artifacts under `.harnees/runs/<run-id>/`.

Example:

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

Generated task and plan files:

```text
tasks/
  2026-04-18-001-task.md

docs/
  superpowers/
    plans/
      2026-04-18-001-plan.md
```

Example `state.json`:

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

Example `trace.json`:

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

## Prompt Composition

The harness builds each phase prompt from:

- A short invariant controller prompt
- Workflow phase objective
- Active skill content
- Project context
- Task file or raw idea
- Current run state
- Stop condition

The system prompt stays minimal. Long guidance lives in skill files and is loaded only when relevant.

## Manual Gates

The MVP uses manual gates for important decisions:

- Confirm inferred workflow.
- Approve generated `task.md`.
- Approve generated implementation plan.
- Continue after blocking review findings.
- Finish after verification evidence is recorded.

The CLI records the gate state and tells the user how to continue with `harnees resume <run-id>`.

## Error Handling

Each phase should return a structured result:

- Status: `completed`, `waiting_for_user`, `blocked`, or `failed`
- Summary
- Next action
- Artifact paths

On failure, the harness records the error and keeps the run resumable. It does not discard trace data.

## Backlog

### Phase 2: Semi-Automatic Verification

- Detect package manager and project type.
- Run test, lint, and typecheck commands from the harness.
- Feed failures back into the same Codex thread.
- Add `harnees verify`.

### Phase 3: Policy Engine

- Command allowlist.
- Destructive command approval.
- Protected file checks.
- Network and dependency install approval.

### Phase 4: Real Subagent Execution

- Split planner, executor, reviewer, and verifier roles.
- Run spec compliance review before code quality review.
- Keep execution serial first, then add safe parallelism for disjoint work.

### Phase 5: GitHub Integration

- Start runs from GitHub issues.
- Read pull request and CI state.
- Generate pull request descriptions.
- Query PR checks.

### Phase 6: Eval And Dashboard

- Track pass rate.
- Track retry count.
- Track verification success rate.
- Support task replay from traces.
- Add a small local dashboard only after trace quality is stable.

## MVP Decisions

- Local run state uses `.harnees/`.
- Generated task and plan files are normal project artifacts. They are not committed automatically by the MVP.
- The first implementation targets the Codex SDK directly. If the SDK is unavailable during implementation, the CLI should fail with a clear setup message rather than silently shelling out to another interface.

## Approval Criteria

The design is ready for implementation planning when:

- The user accepts the Superpowers lifecycle as the primary workflow.
- The user accepts TypeScript and Node.js as the implementation stack.
- The user accepts workflow inference with optional `--workflow` override.
- The user accepts that MVP verification is prompt-driven and trace-recorded, not harness-executed.
- The user accepts the backlog order for follow-up automation.
