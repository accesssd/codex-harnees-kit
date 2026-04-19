import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_CONTEXT_SOURCE_CHARS = 4000;

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

export async function buildProjectContext(cwd: string): Promise<string> {
  const readme = await readIfExists(join(cwd, "README.md"));
  const packageJson = await readIfExists(join(cwd, "package.json"));

  return [
    `cwd: ${cwd}`,
    "",
    "README.md:",
    readme ? limitContextSource(readme) : "not found",
    "",
    "package.json:",
    packageJson ? limitContextSource(packageJson) : "not found"
  ].join("\n");
}
