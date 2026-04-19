import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildStepTaskInput } from "../src/cli-helpers.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("cli-helpers", () => {
  it("builds step input from both task and plan artifacts", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harness-cli-"));
    await mkdir(join(tempDir, "tasks"), { recursive: true });
    await mkdir(join(tempDir, "docs", "superpowers", "plans"), { recursive: true });
    await writeFile(join(tempDir, "tasks", "run-123-task.md"), "# Task\n\nConfirm task details.\n", "utf8");
    await writeFile(
      join(tempDir, "docs", "superpowers", "plans", "run-123-plan.md"),
      "# Plan\n\nExecute with TDD.\n",
      "utf8"
    );

    const input = await buildStepTaskInput(tempDir, {
      runId: "run-123",
      status: "completed",
      workflow: "bugfix",
      workflowSource: "inferred",
      currentPhase: "plan",
      taskFile: "tasks/run-123-task.md",
      planFile: "docs/superpowers/plans/run-123-plan.md",
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z"
    });

    expect(input).toContain("task: tasks/run-123-task.md");
    expect(input).toContain("Confirm task details.");
    expect(input).toContain("plan: docs/superpowers/plans/run-123-plan.md");
    expect(input).toContain("Execute with TDD.");
  });
});
