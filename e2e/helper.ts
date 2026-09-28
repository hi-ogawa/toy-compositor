import { cp } from "node:fs/promises";
import path from "node:path";
import { test as base } from "@playwright/test";

export const test = base.extend<{
  editor: { url: string; projectFile: string };
}>({
  editor: async ({}, use, testInfo) => {
    // Copy the synthetic sample into its own cover under the server's
    // projects root, so each test saves edits independently.
    const cover = testInfo.testId;
    const directory = path.resolve(".local/e2e-projects", cover);
    await cp("samples/synthetic", directory, { recursive: true });
    const url = `/?${new URLSearchParams({ project: `${cover}/project.json` })}`;
    await use({ url, projectFile: path.join(directory, "project.json") });
  },
});
