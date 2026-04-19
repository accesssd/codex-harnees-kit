import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { RunState } from "./domain.js";

const MAX_CONTEXT_SOURCE_CHARS = 4000;
const execFileAsync = promisify(execFile);

export type ProjectContextInput = {
  taskFile?: string;
  runState?: RunState;
};

export async function readIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function limitContextSource(content: string): string {
  if (content.length <= MAX_CONTEXT_SOURCE_CHARS) {
    return content;
  }

  return `${content.slice(0, MAX_CONTEXT_SOURCE_CHARS)}\n[truncated]`;
}

export async function buildProjectContext(cwd: string, input: ProjectContextInput = {}): Promise<string> {
  const readme = await readIfExists(join(cwd, "README.md"));
  const packageJson = await readIfExists(join(cwd, "package.json"));
  const taskFileContent = input.taskFile ? await readIfExists(join(cwd, input.taskFile)) : undefined;
  const gitStatus = await readGitStatus(cwd);

  return [
    `cwd: ${cwd}`,
    "",
    "git status --short:",
    gitStatus,
    "",
    "README.md:",
    readme ? limitContextSource(readme) : "not found",
    "",
    "package.json:",
    packageJson ? limitContextSource(packageJson) : "not found",
    "",
    "task file:",
    taskFileContent ? limitContextSource(taskFileContent) : "not found",
    "",
    "run state:",
    input.runState ? JSON.stringify(input.runState, null, 2) : "not found"
  ].join("\n");
}

async function readGitStatus(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd });
    return stdout.trim() || "clean";
  } catch {
    return "unavailable";
  }
}
