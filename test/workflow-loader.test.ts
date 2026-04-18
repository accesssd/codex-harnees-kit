import { describe, expect, it } from "vitest";
import { loadWorkflow } from "../src/workflow-loader.js";

describe("workflow-loader", () => {
  it("loads bugfix workflow with the Superpowers lifecycle phases", async () => {
    const workflow = await loadWorkflow(process.cwd(), "bugfix");

    expect(workflow.name).toBe("bugfix");
    expect(workflow.phases.map((phase) => phase.id)).toEqual([
      "worktree",
      "brainstorm",
      "plan",
      "execute",
      "review",
      "verify",
      "finish"
    ]);
    expect(workflow.phases[1].skills).toContain("superpowers:brainstorming");
  });
});
