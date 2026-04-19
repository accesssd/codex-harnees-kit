export type CodexRunInput = {
  prompt: string;
  threadId?: string;
};

export type CodexRunResult = {
  threadId: string;
  output: string;
};

export interface CodexRunner {
  run(input: CodexRunInput): Promise<CodexRunResult>;
}

type CodexSdkModule = {
  Codex?: new () => {
    startThread(options?: { workingDirectory?: string; skipGitRepoCheck?: boolean }): CodexSdkThread;
    resumeThread(
      id: string,
      options?: { workingDirectory?: string; skipGitRepoCheck?: boolean }
    ): CodexSdkThread;
  };
};

type CodexSdkThread = {
  id: string | null;
  run(input: string): Promise<{ finalResponse: string }>;
};

export type CodexSdkRunnerOptions = {
  cwd?: string;
  skipGitRepoCheck?: boolean;
};

export class CodexSdkRunner implements CodexRunner {
  constructor(private readonly options: CodexSdkRunnerOptions = {}) {}

  async run(input: CodexRunInput): Promise<CodexRunResult> {
    const sdk = (await import("@openai/codex-sdk")) as CodexSdkModule;
    const Codex = sdk.Codex;

    if (!Codex) {
      throw new Error(
        "Codex SDK setup error: @openai/codex-sdk did not export Codex. Install or update @openai/codex-sdk and verify its package exports."
      );
    }

    const codex = new Codex();
    const threadOptions = {
      workingDirectory: this.options.cwd,
      skipGitRepoCheck: this.options.skipGitRepoCheck ?? true
    };
    const thread = input.threadId
      ? codex.resumeThread(input.threadId, threadOptions)
      : codex.startThread(threadOptions);
    const turn = await thread.run(input.prompt);
    const threadId = thread.id ?? input.threadId;

    if (!threadId) {
      throw new Error("Codex SDK did not provide a thread id after running the prompt.");
    }

    return {
      threadId,
      output: turn.finalResponse
    };
  }
}
