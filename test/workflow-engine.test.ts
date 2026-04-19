import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonFile, readTextFile } from "../src/fs-utils.js";
import { runPhase } from "../src/workflow-engine.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function writeTempProject(cwd: string): Promise<void> {
  const skillPath = join(cwd, "skills", "brainstorming", "SKILL.md");

  await mkdir(join(cwd, "workflows"), { recursive: true });
  await mkdir(join(cwd, "config"), { recursive: true });
  await mkdir(join(cwd, "prompts"), { recursive: true });
  await mkdir(join(cwd, "skills", "brainstorming"), { recursive: true });

  await writeFile(
    join(cwd, "workflows", "bugfix.yaml"),
    [
      "name: bugfix",
      "phases:",
      "  - id: brainstorm",
      "    skills:",
      "      - superpowers:brainstorming",
      "    objective: Clarify the bug and write the task file.",
      "    requiresConfirmation: false"
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(cwd, "config", "skills.json"),
    JSON.stringify({ "superpowers:brainstorming": skillPath }, null, 2),
    "utf8"
  );
  await writeFile(join(cwd, "prompts", "controller.md"), "# Controller\n", "utf8");
  await writeFile(
    join(cwd, "prompts", "phase.md"),
    [
      "phase={{phaseId}}",
      "objective={{objective}}",
      "state={{runState}}",
      "context={{context}}",
      "task={{taskInput}}",
      "skills={{skills}}"
    ].join("\n"),
    "utf8"
  );
  await writeFile(join(cwd, "README.md"), "# Temp Project\n", "utf8");
  await writeFile(skillPath, "# Brainstorming\n\nAsk sharp questions.\n", "utf8");
}

describe("workflow-engine", () => {
  it("runs a phase, persists artifacts, and updates run state", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harnees-engine-"));
    await writeTempProject(tempDir);

    const codexCalls: Array<{ prompt: string; threadId?: string }> = [];
    const codex = {
      async run(input: { prompt: string; threadId?: string }) {
        codexCalls.push(input);
        return {
          threadId: "thread-123",
          output: "Brainstorm output with a useful bug summary."
        };
      }
    };

    const result = await runPhase({
      cwd: tempDir,
      runId: "run-123",
      workflow: "bugfix",
      workflowSource: "inferred",
      phaseId: "brainstorm",
      taskInput: "Fix the failing login redirect.",
      codex
    });

    expect(result.status).toBe("completed");
    expect(result.summary).toContain("Brainstorm output");
    expect(codexCalls).toHaveLength(1);
    expect(codexCalls[0].threadId).toBeUndefined();
    expect(codexCalls[0].prompt).toContain("# Controller");
    expect(codexCalls[0].prompt).toContain("Fix the failing login redirect.");

    await expect(
      readTextFile(join(tempDir, ".harnees", "runs", "run-123", "brainstorm.prompt.md"))
    ).resolves.toContain("superpowers:brainstorming");
    await expect(
      readTextFile(join(tempDir, ".harnees", "runs", "run-123", "brainstorm.output.md"))
    ).resolves.toBe("Brainstorm output with a useful bug summary.");
    await expect(readTextFile(join(tempDir, "tasks", "run-123-task.md"))).resolves.toBe(
      "Brainstorm output with a useful bug summary."
    );

    await expect(
      readJsonFile(join(tempDir, ".harnees", "runs", "run-123", "state.json"))
    ).resolves.toMatchObject({
      runId: "run-123",
      status: "completed",
      workflow: "bugfix",
      workflowSource: "inferred",
      currentPhase: "brainstorm",
      threadId: "thread-123",
      taskFile: "tasks/run-123-task.md"
    });
    await expect(
      readJsonFile(join(tempDir, ".harnees", "runs", "run-123", "trace.json"))
    ).resolves.toEqual({
      runId: "run-123",
      phases: [
        {
          id: "brainstorm",
          skills: ["superpowers:brainstorming"],
          promptPath: ".harnees/runs/run-123/brainstorm.prompt.md",
          outputPath: ".harnees/runs/run-123/brainstorm.output.md",
          status: "completed"
        }
      ]
    });
  });
});
