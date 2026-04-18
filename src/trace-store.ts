import { join } from "node:path";
import { PhaseId, RunStatus } from "./domain.js";
import { readJsonFile, writeJsonFile, writeTextFile } from "./fs-utils.js";

export type PhaseArtifactKind = "prompt" | "output";

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

function tracePath(cwd: string, runId: string): string {
  return join(cwd, ".harnees", "runs", runId, "trace.json");
}

export function relativeArtifactPath(
  runId: string,
  phase: PhaseId,
  kind: PhaseArtifactKind
): string {
  return `.harnees/runs/${runId}/${phase}.${kind}.md`;
}

export async function writePhaseArtifact(
  cwd: string,
  runId: string,
  phase: PhaseId,
  kind: PhaseArtifactKind,
  content: string
): Promise<string> {
  const relativePath = relativeArtifactPath(runId, phase, kind);
  await writeTextFile(join(cwd, relativePath), content);
  return relativePath;
}

export async function appendTracePhase(
  cwd: string,
  runId: string,
  phase: TracePhase
): Promise<Trace> {
  const trace = await loadTraceOrCreate(cwd, runId);
  const phases = trace.phases.filter((item) => item.id !== phase.id);
  const updated = { runId, phases: [...phases, phase] };

  await writeJsonFile(tracePath(cwd, runId), updated);
  return updated;
}

async function loadTraceOrCreate(cwd: string, runId: string): Promise<Trace> {
  try {
    return await readJsonFile<Trace>(tracePath(cwd, runId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { runId, phases: [] };
    }

    throw error;
  }
}
