import { cp } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, test as base } from "@playwright/test";

export const test = base.extend<{
  editor: { projectDir: string; url: string; projectFile: string };
}>({
  editor: async ({}, use, testInfo) => {
    // Copy the synthetic sample into its own project directory under the
    // server's projects root, so each test saves edits independently.
    const projectDir = testInfo.testId;
    const projectDirPath = path.resolve(".local/e2e-projects", projectDir);
    await cp("samples/synthetic", projectDirPath, { recursive: true });
    const url = `/?${new URLSearchParams({ project: `${projectDir}/project.json` })}`;
    await use({
      projectDir,
      url,
      projectFile: path.join(projectDirPath, "project.json"),
    });
  },
});

/** Wait until an image element has loaded its source. */
export async function expectImageLoaded(image: Locator) {
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
}
