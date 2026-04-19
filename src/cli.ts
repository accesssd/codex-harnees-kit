#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { Command } from "commander";
import { ZodError } from "zod";
import { buildStepTaskInput } from "./cli-helpers.js";
import { CodexSdkRunner } from "./codex-thread.js";
import { PhaseIdSchema, WorkflowNameSchema } from "./domain.js";
import { readTextFile } from "./fs-utils.js";
import { loadRunState } from "./task-store.js";
import { runPhase } from "./workflow-engine.js";
import { inferWorkflow } from "./workflow-inference.js";

type StartOptions = {
  task?: string;
  workflow?: string;
};

const RUN_ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+$/;

function createRunId(): string {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = Date.now().toString(36);
  return `${date}-${suffix}`;
}

function resolveFromCwd(cwd: string, path: string): string {
  return isAbsolute(path) ? path : join(cwd, path);
}

function parseRunId(runId: string): string {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error("run id 格式无效。请使用 harnees list 查看可用 run id。");
  }
  return runId;
}

function formatZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "参数校验失败。";
  }
  return `参数校验失败：${issue.path.join(".") || "value"} ${issue.message}`;
}

async function readTaskInput(cwd: string, idea: string | undefined, taskPath: string | undefined): Promise<string> {
  const taskInput = taskPath ? await readTextFile(resolveFromCwd(cwd, taskPath)) : idea;
  const trimmed = taskInput?.trim();

  if (!trimmed) {
    throw new Error("请提供任务输入：传入 raw idea，或使用 --task <path> 指定任务文件。");
  }

  return trimmed;
}

async function listRunIds(cwd: string): Promise<string[]> {
  const runsDir = join(cwd, ".harnees", "runs");
  try {
    const entries = await readdir(runsDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

const program = new Command();

program.name("harnees").description("Codex workflow harness").version("0.1.0");

program
  .command("start")
  .argument("[idea]", "原始任务想法")
  .option("--task <path>", "从任务文件读取输入")
  .option("--workflow <name>", "显式指定 workflow")
  .action(async (idea: string | undefined, options: StartOptions) => {
    const cwd = process.cwd();
    const taskInput = await readTaskInput(cwd, idea, options.task);
    const explicitWorkflow = options.workflow ? WorkflowNameSchema.parse(options.workflow) : undefined;
    const inference = inferWorkflow(taskInput, explicitWorkflow);
    const runId = createRunId();

    console.log(`检测到 workflow：${inference.workflow}`);
    console.log(`来源：${inference.source}`);
    console.log(`置信度：${inference.confidence}`);
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

program
  .command("status")
  .argument("<run-id>", "run id")
  .action(async (runId: string) => {
    const state = await loadRunState(process.cwd(), parseRunId(runId));
    console.log(JSON.stringify(state, null, 2));
  });

program.command("list").action(async () => {
  for (const runId of await listRunIds(process.cwd())) {
    console.log(runId);
  }
});

program
  .command("resume")
  .argument("<run-id>", "run id")
  .action(async (runId: string) => {
    const parsedRunId = parseRunId(runId);
    const state = await loadRunState(process.cwd(), parsedRunId);

    console.log(`当前阶段：${state.currentPhase}`);
    console.log(`状态：${state.status}`);
    console.log(`提示：MVP resume 只读取状态，不会自动推进。请确认后运行 harnees step ${parsedRunId} <phase>。`);
  });

program
  .command("step")
  .argument("<run-id>", "run id")
  .argument("<phase>", "phase id")
  .action(async (runId: string, phase: string) => {
    const cwd = process.cwd();
    const parsedRunId = parseRunId(runId);
    const state = await loadRunState(cwd, parsedRunId);
    const phaseId = PhaseIdSchema.parse(phase);
    const taskInput = await buildStepTaskInput(cwd, state);
    const result = await runPhase({
      cwd,
      runId: parsedRunId,
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
  if (error instanceof ZodError) {
    console.error(formatZodError(error));
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});
