import { PhaseId } from "./domain.js";
import { LoadedSkill } from "./skill-loader.js";

export const LANGUAGE_RULE =
  "默认使用中文回答、提问、总结和生成任务/计划文档。命令、代码、文件路径、包名、API 名称、workflow id、skill id 保持原文。";

export type BuildPhasePromptInput = {
  controllerPrompt: string;
  phaseTemplate: string;
  phaseId: PhaseId;
  objective: string;
  skills: LoadedSkill[];
  context: string;
  taskInput: string;
  runState: string;
};

function escapeMarkdownFence(content: string): string {
  return content.replaceAll("```", "``\\`");
}

function formatSkills(skills: LoadedSkill[]): string {
  if (skills.length === 0) {
    return "not found";
  }

  return skills
    .map(
      (skill) =>
        `## ${escapeMarkdownFence(skill.id)}\nPath: ${escapeMarkdownFence(skill.path)}\n\n${escapeMarkdownFence(skill.content)}`
    )
    .join("\n\n---\n\n");
}

export function buildPhasePrompt(input: BuildPhasePromptInput): string {
  const skillContent = formatSkills(input.skills);
  const body = input.phaseTemplate
    .replaceAll("{{phaseId}}", input.phaseId)
    .replaceAll("{{objective}}", input.objective)
    .replaceAll("{{runState}}", escapeMarkdownFence(input.runState))
    .replaceAll("{{context}}", escapeMarkdownFence(input.context))
    .replaceAll("{{taskInput}}", escapeMarkdownFence(input.taskInput))
    .replaceAll("{{skills}}", skillContent);

  return [input.controllerPrompt, LANGUAGE_RULE, body].join("\n\n---\n\n");
}
