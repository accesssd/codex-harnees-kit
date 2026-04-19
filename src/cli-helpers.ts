import { isAbsolute, join } from "node:path";
import { RunState } from "./domain.js";
import { readTextFile } from "./fs-utils.js";

function resolveFromCwd(cwd: string, path: string): string {
  return isAbsolute(path) ? path : join(cwd, path);
}

export async function readStateArtifact(
  cwd: string,
  label: string,
  path: string | undefined
): Promise<string> {
  if (!path) {
    return `${label}: not found`;
  }
  return `${label}: ${path}\n${await readTextFile(resolveFromCwd(cwd, path))}`;
}

export async function buildStepTaskInput(cwd: string, state: RunState): Promise<string> {
  const task = await readStateArtifact(cwd, "task", state.taskFile);
  const plan = await readStateArtifact(cwd, "plan", state.planFile);
  return `${task}\n\n---\n\n${plan}`;
}
