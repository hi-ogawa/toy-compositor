import { cp } from "node:fs/promises";
import path from "node:path";
import type { TestInfo } from "@playwright/test";
import type { Project } from "../src/lib/project.ts";
import { execFileAsync } from "../src/utils/exec.ts";
import { editJson } from "../src/utils/fs.ts";

/** Run the CLI from source, as the published bin runs its build. */
export function runCli(args: string[]) {
  return execFileAsync(process.execPath, ["src/cli.ts", ...args]);
}

/** Copy the synthetic sample into the test's output folder, and return its project file. */
export async function copySample(
  testInfo: TestInfo,
  edit?: (project: Project) => void,
) {
  const directory = testInfo.outputPath("project");
  await cp("samples/synthetic", directory, { recursive: true });
  const projectFile = path.join(directory, "project.json");
  if (edit) {
    await editJson<Project>(projectFile, edit);
  }
  return projectFile;
}

/**
 * Copy a project file to a sibling named `name`, so the copy resolves the same
 * media, and return the copy.
 */
export async function copyProject(
  projectFile: string,
  { name, edit }: { name: string; edit: (project: Project) => void },
) {
  const file = path.join(path.dirname(projectFile), `${name}.json`);
  await cp(projectFile, file);
  await editJson<Project>(file, edit);
  return file;
}
