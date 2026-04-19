import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonFile, readTextFile } from "../src/fs-utils.js";
import { appendTracePhase, writePhaseArtifact } from "../src/trace-store.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("trace-store", () => {
  it("writes phase artifacts under the run directory", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harness-trace-"));

    const relativePath = await writePhaseArtifact(
      tempDir,
      "2026-04-18-001",
      "brainstorm",
      "prompt",
      "# Prompt\n"
    );

    expect(relativePath).toBe(".harness/runs/2026-04-18-001/brainstorm.prompt.md");
    await expect(readTextFile(join(tempDir, relativePath))).resolves.toBe("# Prompt\n");
  });

  it("creates trace json and preserves duplicate phase records", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harness-trace-"));

    await appendTracePhase(tempDir, "2026-04-18-001", {
      id: "brainstorm",
      skills: ["superpowers:brainstorming"],
      promptPath: ".harness/runs/2026-04-18-001/brainstorm.prompt.md",
      outputPath: ".harness/runs/2026-04-18-001/brainstorm.output.md",
      status: "running"
    });
    await appendTracePhase(tempDir, "2026-04-18-001", {
      id: "brainstorm",
      skills: ["superpowers:brainstorming", "ecc:tdd-workflow"],
      promptPath: ".harness/runs/2026-04-18-001/brainstorm.prompt.md",
      outputPath: ".harness/runs/2026-04-18-001/brainstorm.output.md",
      status: "completed"
    });

    const trace = await readJsonFile(join(tempDir, ".harness", "runs", "2026-04-18-001", "trace.json"));
    expect(trace).toEqual({
      runId: "2026-04-18-001",
      phases: [
        {
          id: "brainstorm",
          skills: ["superpowers:brainstorming"],
          promptPath: ".harness/runs/2026-04-18-001/brainstorm.prompt.md",
          outputPath: ".harness/runs/2026-04-18-001/brainstorm.output.md",
          status: "running"
        },
        {
          id: "brainstorm",
          skills: ["superpowers:brainstorming", "ecc:tdd-workflow"],
          promptPath: ".harness/runs/2026-04-18-001/brainstorm.prompt.md",
          outputPath: ".harness/runs/2026-04-18-001/brainstorm.output.md",
          status: "completed"
        }
      ]
    });
  });
});
