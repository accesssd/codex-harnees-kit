import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProjectContext } from "../src/context-builder.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("context-builder", () => {
  it("includes README.md and package.json contents when they exist", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harness-context-"));
    await writeFile(join(tempDir, "README.md"), "# Test Project\n", "utf8");
    await writeFile(join(tempDir, "package.json"), '{"name":"test-project"}\n', "utf8");

    const context = await buildProjectContext(tempDir);

    expect(context).toContain(`cwd: ${tempDir}`);
    expect(context).toContain("README.md:");
    expect(context).toContain("# Test Project");
    expect(context).toContain("package.json:");
    expect(context).toContain('"name":"test-project"');
  });

  it("truncates oversized context sources", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harness-context-"));
    await writeFile(join(tempDir, "README.md"), "a".repeat(4100), "utf8");

    const context = await buildProjectContext(tempDir);

    expect(context).toContain("[truncated]");
    expect(context).not.toContain("a".repeat(4100));
  });

  it("includes task file and run state when provided", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harness-context-"));
    await mkdir(join(tempDir, "tasks"), { recursive: true });
    await writeFile(join(tempDir, "tasks", "run-task.md"), "# Task\n\nClarify the redirect bug.\n", "utf8");

    const context = await buildProjectContext(tempDir, {
      taskFile: "tasks/run-task.md",
      runState: {
        runId: "run-123",
        status: "completed",
        workflow: "bugfix",
        workflowSource: "inferred",
        currentPhase: "brainstorm",
        taskFile: "tasks/run-task.md",
        planFile: "docs/superpowers/plans/run-123-plan.md",
        createdAt: "2026-04-19T00:00:00.000Z",
        updatedAt: "2026-04-19T00:00:00.000Z"
      }
    });

    expect(context).toContain("task file:");
    expect(context).toContain("Clarify the redirect bug.");
    expect(context).toContain("run state:");
    expect(context).toContain("\"planFile\": \"docs/superpowers/plans/run-123-plan.md\"");
  });
});
