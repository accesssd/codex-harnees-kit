import { z } from "zod";

export const PhaseIdSchema = z.enum([
  "worktree",
  "brainstorm",
  "plan",
  "execute",
  "review",
  "verify",
  "finish"
]);

export type PhaseId = z.infer<typeof PhaseIdSchema>;

export const WorkflowNameSchema = z.enum(["bugfix", "feature", "review", "ci-failure"]);
export type WorkflowName = z.infer<typeof WorkflowNameSchema>;

export const RunStatusSchema = z.enum([
  "created",
  "waiting_for_user",
  "running",
  "completed",
  "blocked",
  "failed"
]);

export type RunStatus = z.infer<typeof RunStatusSchema>;

export const WorkflowPhaseSchema = z.object({
  id: PhaseIdSchema,
  skills: z.array(z.string()).default([]),
  objective: z.string(),
  stopCondition: z.string().optional(),
  requiresConfirmation: z.boolean().default(false)
});

export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>;

export const WorkflowSchema = z.object({
  name: WorkflowNameSchema,
  phases: z.array(WorkflowPhaseSchema).min(1)
});

export type Workflow = z.infer<typeof WorkflowSchema>;

export const RunStateSchema = z.object({
  runId: z.string(),
  status: RunStatusSchema,
  workflow: WorkflowNameSchema,
  workflowSource: z.enum(["inferred", "explicit"]),
  currentPhase: PhaseIdSchema,
  threadId: z.string().optional(),
  taskFile: z.string().optional(),
  planFile: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type RunState = z.infer<typeof RunStateSchema>;

export type WorkflowInference = {
  workflow: WorkflowName;
  confidence: number;
  rationale: string[];
  requiresConfirmation: boolean;
  source: "inferred" | "explicit";
};

export type PhaseResult = {
  status: RunStatus;
  summary: string;
  nextAction: string;
  artifacts: string[];
};
