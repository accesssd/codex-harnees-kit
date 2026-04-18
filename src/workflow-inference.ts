import { WorkflowInference, WorkflowName } from "./domain.js";

const BUGFIX_TERMS = ["bug", "fix", "失败", "报错", "卡住", "异常", "不能", "错误", "超时"];
const REVIEW_TERMS = ["review", "审查", "检查", "评审"];
const CI_TERMS = ["ci", "build", "pipeline", "测试失败", "构建失败"];

export function inferWorkflow(input: string, explicitWorkflow?: WorkflowName): WorkflowInference {
  if (explicitWorkflow) {
    return {
      workflow: explicitWorkflow,
      confidence: 1,
      rationale: [`用户显式指定了 ${explicitWorkflow} workflow。`],
      requiresConfirmation: false,
      source: "explicit"
    };
  }

  const normalized = input.toLowerCase();

  if (CI_TERMS.some((term) => normalized.includes(term))) {
    return {
      workflow: "ci-failure",
      confidence: 0.82,
      rationale: ["需求描述中包含 CI、build 或 pipeline 失败信号。"],
      requiresConfirmation: true,
      source: "inferred"
    };
  }

  if (BUGFIX_TERMS.some((term) => normalized.includes(term))) {
    return {
      workflow: "bugfix",
      confidence: 0.8,
      rationale: ["这个需求描述的是已有行为出错。", "预期结果是修复问题，而不是新增能力。"],
      requiresConfirmation: true,
      source: "inferred"
    };
  }

  if (REVIEW_TERMS.some((term) => normalized.includes(term))) {
    return {
      workflow: "review",
      confidence: 0.76,
      rationale: ["需求目标更像审查已有实现，而不是立即修改代码。"],
      requiresConfirmation: true,
      source: "inferred"
    };
  }

  return {
    workflow: "feature",
    confidence: 0.62,
    rationale: ["没有明显的 bug、CI 或 review 信号，默认按新功能处理。"],
    requiresConfirmation: true,
    source: "inferred"
  };
}
