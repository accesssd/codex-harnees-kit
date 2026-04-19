import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  PhaseId,
  PhaseResult,
  RunState,
  RunStatus,
  WorkflowName,
  WorkflowPhase
} from "./domain.js";
import { readTextFile, writeTextFile } from "./fs-utils.js";
import { buildProjectContext } from "./context-builder.js";
import { buildPhasePrompt } from "./prompt-builder.js";
import { loadSkills } from "./skill-loader.js";
import { createRunState, loadRunState, saveRunState } from "./task-store.js";
import { appendTracePhase, writePhaseArtifact } from "./trace-store.js";
import { loadWorkflow } from "./workflow-loader.js";
import { CodexRunner } from "./codex-thread.js";

export type RunPhaseInput = {
  cwd: string;
  runId: string;
  workflow: WorkflowName;
  workflowSource: RunState["workflowSource"];
  phaseId: PhaseId;
  taskInput: string;
  codex: CodexRunner;
};

function findPhase(phases: WorkflowPhase[], phaseId: PhaseId): WorkflowPhase {
  const phase = phases.find((item) => item.id === phaseId);

  if (!phase) {
    throw new Error(`Workflow phase not found: ${phaseId}`);
  }

  return phase;
}

async function loadOrCreateRunState(input: RunPhaseInput): Promise<RunState> {
  try {
    return await loadRunState(input.cwd, input.runId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createRunState(input.cwd, {
        runId: input.runId,
        workflow: input.workflow,
        workflowSource: input.workflowSource
      });
    }

    throw error;
  }
}

async function writePhaseOutputFile(
  cwd: string,
  runId: string,
  phaseId: PhaseId,
  output: string
): Promise<{ taskFile?: string; planFile?: string; artifacts: string[] }> {
  if (phaseId === "brainstorm") {
    const taskFile = `tasks/${runId}-task.md`;
    await writeTextFile(join(cwd, taskFile), output);
    return { taskFile, artifacts: [taskFile] };
  }

  if (phaseId === "plan") {
    const planFile = `docs/superpowers/plans/${runId}-plan.md`;
    await writeTextFile(join(cwd, planFile), output);
    return { planFile, artifacts: [planFile] };
  }

  return { artifacts: [] };
}

function nextActionForStatus(status: RunStatus): string {
  if (status === "waiting_for_user") {
    return "Await user confirmation before continuing.";
  }

  return "Continue to the next workflow phase.";
}

function createAttemptId(): string {
  return `${Date.now().toString(36)}-${randomUUID()}`;
}

function formatOutputWithEvidence(output: string, rawItems: unknown): string {
  if (rawItems === undefined) {
    return output;
  }

  return `${output}\n\n## Codex turn items\n\n\`\`\`json\n${JSON.stringify(rawItems, null, 2)}\n\`\`\`\n`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runPhase(input: RunPhaseInput): Promise<PhaseResult> {
  const workflow = await loadWorkflow(input.cwd, input.workflow);
  const phase = findPhase(workflow.phases, input.phaseId);
  const state = await loadOrCreateRunState(input);
  const controllerPrompt = await readTextFile(join(input.cwd, "prompts", "controller.md"));
  const phaseTemplate = await readTextFile(join(input.cwd, "prompts", "phase.md"));
  const context = await buildProjectContext(input.cwd, {
    taskFile: state.taskFile,
    runState: state
  });
  const skills =
    phase.skills.length > 0
      ? await loadSkills(join(input.cwd, "config", "skills.json"), phase.skills)
      : [];
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
  const attemptId = createAttemptId();
  const promptPath = await writePhaseArtifact(
    input.cwd,
    input.runId,
    phase.id,
    "prompt",
    prompt,
    attemptId
  );
  try {
    const codexResult = await input.codex.run({ prompt, threadId: state.threadId });
    const output = formatOutputWithEvidence(codexResult.output, codexResult.rawItems);
    const outputPath = await writePhaseArtifact(
      input.cwd,
      input.runId,
      phase.id,
      "output",
      output,
      attemptId
    );
    const phaseFiles = await writePhaseOutputFile(
      input.cwd,
      input.runId,
      phase.id,
      codexResult.output
    );
    const status: RunStatus = phase.requiresConfirmation ? "waiting_for_user" : "completed";

    await appendTracePhase(input.cwd, input.runId, {
      id: phase.id,
      skills: phase.skills,
      promptPath,
      outputPath,
      status
    });

    const saved = await saveRunState(input.cwd, {
      ...state,
      status,
      currentPhase: phase.id,
      threadId: codexResult.threadId,
      taskFile: phaseFiles.taskFile ?? state.taskFile,
      planFile: phaseFiles.planFile ?? state.planFile
    });

    return {
      status: saved.status,
      summary: codexResult.output,
      nextAction: nextActionForStatus(saved.status),
      artifacts: [promptPath, outputPath, ...phaseFiles.artifacts]
    };
  } catch (error) {
    const message = errorMessage(error);
    const outputPath = await writePhaseArtifact(
      input.cwd,
      input.runId,
      phase.id,
      "output",
      `# Phase failed\n\n${message}\n`,
      attemptId
    );
    await appendTracePhase(input.cwd, input.runId, {
      id: phase.id,
      skills: phase.skills,
      promptPath,
      outputPath,
      status: "failed"
    });
    const saved = await saveRunState(input.cwd, {
      ...state,
      status: "failed",
      currentPhase: phase.id
    });

    return {
      status: saved.status,
      summary: message,
      nextAction: "Fix the failure and rerun this phase.",
      artifacts: [promptPath, outputPath]
    };
  }
}
