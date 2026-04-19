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
    tempDir = await mkdtemp(join(tmpdir(), "harness-engine-"));
    await writeTempProject(tempDir);

    const codexCalls: Array<{ prompt: string; threadId?: string }> = [];
    const codex = {
      async run(input: { prompt: string; threadId?: string }) {
        codexCalls.push(input);
        return {
          threadId: "thread-123",
          output: "Brainstorm output with a useful bug summary.",
          rawItems: [{ type: "tool_call", name: "shell" }]
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

    const promptPath = result.artifacts.find((artifact) => artifact.endsWith(".prompt.md"));
    const outputPath = result.artifacts.find((artifact) => artifact.endsWith(".output.md"));

    expect(promptPath).toBeDefined();
    expect(outputPath).toBeDefined();
    await expect(readTextFile(join(tempDir, promptPath!))).resolves.toContain("superpowers:brainstorming");
    await expect(readTextFile(join(tempDir, outputPath!))).resolves.toContain(
      "Brainstorm output with a useful bug summary."
    );
    await expect(readTextFile(join(tempDir, outputPath!))).resolves.toContain("## Codex turn items");
    await expect(readTextFile(join(tempDir, outputPath!))).resolves.toContain("\"tool_call\"");
    await expect(readTextFile(join(tempDir, "tasks", "run-123-task.md"))).resolves.toBe(
      "Brainstorm output with a useful bug summary."
    );

    await expect(
      readJsonFile(join(tempDir, ".harness", "runs", "run-123", "state.json"))
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
      readJsonFile(join(tempDir, ".harness", "runs", "run-123", "trace.json"))
    ).resolves.toEqual({
      runId: "run-123",
      phases: [
        {
          id: "brainstorm",
          skills: ["superpowers:brainstorming"],
          promptPath,
          outputPath,
          status: "completed"
        }
      ]
    });
  });

  it("persists failed phase state, trace, and artifact when Codex rejects", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harness-engine-"));
    await writeTempProject(tempDir);

    const codex = {
      async run() {
        throw new Error("boom");
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

    expect(result.status).toBe("failed");
    expect(result.summary).toBe("boom");
    expect(result.nextAction).toBe("Fix the failure and rerun this phase.");

    const promptPath = result.artifacts.find((artifact) => artifact.endsWith(".prompt.md"));
    const outputPath = result.artifacts.find((artifact) => artifact.endsWith(".output.md"));

    expect(promptPath).toBeDefined();
    expect(outputPath).toBeDefined();
    await expect(readTextFile(join(tempDir, outputPath!))).resolves.toContain("# Phase failed");
    await expect(readTextFile(join(tempDir, outputPath!))).resolves.toContain("boom");

    await expect(
      readJsonFile(join(tempDir, ".harness", "runs", "run-123", "state.json"))
    ).resolves.toMatchObject({
      runId: "run-123",
      status: "failed",
      currentPhase: "brainstorm"
    });
    await expect(
      readJsonFile(join(tempDir, ".harness", "runs", "run-123", "trace.json"))
    ).resolves.toEqual({
      runId: "run-123",
      phases: [
        {
          id: "brainstorm",
          skills: ["superpowers:brainstorming"],
          promptPath,
          outputPath,
          status: "failed"
        }
      ]
    });
  });

  it("keeps separate artifacts when the same phase is rerun", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harness-engine-"));
    await writeTempProject(tempDir);

    let count = 0;
    const codex = {
      async run() {
        count += 1;
        return {
          threadId: "thread-123",
          output: `Brainstorm output ${count}.`
        };
      }
    };

    const first = await runPhase({
      cwd: tempDir,
      runId: "run-123",
      workflow: "bugfix",
      workflowSource: "inferred",
      phaseId: "brainstorm",
      taskInput: "Fix the failing login redirect.",
      codex
    });
    const second = await runPhase({
      cwd: tempDir,
      runId: "run-123",
      workflow: "bugfix",
      workflowSource: "inferred",
      phaseId: "brainstorm",
      taskInput: "Fix the failing login redirect.",
      codex
    });

    const firstOutputPath = first.artifacts.find((artifact) => artifact.endsWith(".output.md"));
    const secondOutputPath = second.artifacts.find((artifact) => artifact.endsWith(".output.md"));

    expect(firstOutputPath).toBeDefined();
    expect(secondOutputPath).toBeDefined();
    expect(firstOutputPath).not.toBe(secondOutputPath);
    await expect(readTextFile(join(tempDir, firstOutputPath!))).resolves.toBe("Brainstorm output 1.");
    await expect(readTextFile(join(tempDir, secondOutputPath!))).resolves.toBe("Brainstorm output 2.");
    await expect(
      readJsonFile(join(tempDir, ".harness", "runs", "run-123", "trace.json"))
    ).resolves.toMatchObject({
      phases: [
        { outputPath: firstOutputPath, status: "completed" },
        { outputPath: secondOutputPath, status: "completed" }
      ]
    });
  });
});
