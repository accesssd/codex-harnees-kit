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
