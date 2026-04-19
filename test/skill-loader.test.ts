import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSkills } from "../src/skill-loader.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("skill-loader", () => {
  it("loads skill markdown by id", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harness-skills-"));
    const skillPath = join(tempDir, "brainstorming", "SKILL.md");
    await mkdir(join(tempDir, "brainstorming"), { recursive: true });
    await writeFile(skillPath, "# Brainstorming\n\nUse before coding.\n", "utf8");
    const registryPath = join(tempDir, "skills.json");
    await writeFile(
      registryPath,
      JSON.stringify({ "superpowers:brainstorming": skillPath }, null, 2),
      "utf8"
    );

    const skills = await loadSkills(registryPath, ["superpowers:brainstorming"]);

    expect(skills).toEqual([
      {
        id: "superpowers:brainstorming",
        path: skillPath,
        content: "# Brainstorming\n\nUse before coding.\n"
      }
    ]);
  });
});
