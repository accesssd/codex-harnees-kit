import { describe, expect, it } from "vitest";
import { inferWorkflow } from "../src/workflow-inference.js";

describe("workflow-inference", () => {
  it("infers bugfix for broken existing behavior", () => {
    const result = inferWorkflow("登录超时后页面会卡住");

    expect(result.workflow).toBe("bugfix");
    expect(result.source).toBe("inferred");
    expect(result.requiresConfirmation).toBe(true);
    expect(result.rationale.join("\n")).toContain("已有行为");
  });

  it("prioritizes bugfix signals over broad review terms", () => {
    const result = inferWorkflow("检查登录报错");

    expect(result.workflow).toBe("bugfix");
    expect(result.source).toBe("inferred");
  });

  it("honors explicit workflow override", () => {
    const result = inferWorkflow("整理登录模块", "review");

    expect(result.workflow).toBe("review");
    expect(result.source).toBe("explicit");
    expect(result.requiresConfirmation).toBe(false);
  });
});
