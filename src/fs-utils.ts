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
