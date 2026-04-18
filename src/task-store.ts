import { join } from "node:path";
import { RunState, RunStateSchema, WorkflowName } from "./domain.js";
import { readJsonFile, writeJsonFile } from "./fs-utils.js";

export type CreateRunStateInput = {
  runId: string;
  workflow: WorkflowName;
  workflowSource: RunState["workflowSource"];
};

export function runDir(cwd: string, runId: string): string {
  return join(cwd, ".harnees", "runs", runId);
}

export function statePath(cwd: string, runId: string): string {
  return join(runDir(cwd, runId), "state.json");
}

export async function createRunState(cwd: string, input: CreateRunStateInput): Promise<RunState> {
  const now = new Date().toISOString();
  const state = RunStateSchema.parse({
    runId: input.runId,
    status: "created",
    workflow: input.workflow,
    workflowSource: input.workflowSource,
    currentPhase: "worktree",
    createdAt: now,
    updatedAt: now
  });

  await writeJsonFile(statePath(cwd, state.runId), state);
  return state;
}

export async function saveRunState(cwd: string, state: RunState): Promise<RunState> {
  const now = new Date().toISOString();
  const updatedAt =
    now === state.updatedAt
      ? new Date(new Date(now).getTime() + 1).toISOString()
      : now;
  const parsed = RunStateSchema.parse({ ...state, updatedAt });

  await writeJsonFile(statePath(cwd, parsed.runId), parsed);
  return parsed;
}

export async function loadRunState(cwd: string, runId: string): Promise<RunState> {
  const value = await readJsonFile(statePath(cwd, runId));
  return RunStateSchema.parse(value);
}
