import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonFile, writeJsonFile } from "../src/fs-utils.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("fs-utils", () => {
  it("writes parent directories before JSON content", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "harnees-"));
    const filePath = join(tempDir, "nested", "state.json");

    await writeJsonFile(filePath, { status: "created" });

    await expect(readJsonFile(filePath)).resolves.toEqual({ status: "created" });
  });
});
