import { join } from "node:path";
import { parse } from "yaml";
import { Workflow, WorkflowName, WorkflowSchema } from "./domain.js";
import { readTextFile } from "./fs-utils.js";

export async function loadWorkflow(cwd: string, name: WorkflowName): Promise<Workflow> {
  const workflowPath = join(cwd, "workflows", `${name}.yaml`);
  const content = await readTextFile(workflowPath);
  const parsed = parse(content);
  return WorkflowSchema.parse(parsed);
}
