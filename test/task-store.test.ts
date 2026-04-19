import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonFile, writeJsonFile } from "../src/fs-utils.js";
import { createRunState, loadRunState, saveRunState } from "../src/task-store.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("fs-utils", () => {
  it("writes parent directories before JSON content", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harness-"));
    const filePath = join(tempDir, "nested", "state.json");

    await writeJsonFile(filePath, { status: "created" });

    await expect(readJsonFile(filePath)).resolves.toEqual({ status: "created" });
  });
});

describe("task-store", () => {
  it("creates, saves, and loads run state from the run state path", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harness-state-"));

    const created = await createRunState(tempDir, {
      runId: "2026-04-18-001",
      workflow: "bugfix",
      workflowSource: "inferred"
    });

    expect(created).toMatchObject({
      runId: "2026-04-18-001",
      status: "created",
      workflow: "bugfix",
      workflowSource: "inferred",
      currentPhase: "worktree"
    });
    expect(Date.parse(created.createdAt)).not.toBeNaN();
    expect(Date.parse(created.updatedAt)).not.toBeNaN();

    const filePath = join(tempDir, ".harness", "runs", "2026-04-18-001", "state.json");
    await expect(readJsonFile(filePath)).resolves.toMatchObject({
      runId: "2026-04-18-001",
      status: "created"
    });

    const saved = await saveRunState(tempDir, {
      ...created,
      status: "running",
      currentPhase: "brainstorm"
    });

    expect(saved.updatedAt).not.toBe(created.updatedAt);

    const loaded = await loadRunState(tempDir, "2026-04-18-001");
    expect(loaded).toEqual(saved);
    await expect(readFile(filePath, "utf8")).resolves.toContain('"currentPhase": "brainstorm"');
  });
});
