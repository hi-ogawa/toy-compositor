import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp } from "node:fs/promises";
import path from "node:path";
import { expect, test as base } from "@playwright/test";

export const test = base.extend<{
  editor: { url: string; projectFile: string };
}>({
  editor: async ({}, use, testInfo) => {
    const directory = testInfo.outputPath("project");
    await cp("samples/synthetic", directory, { recursive: true });
    const projectFile = path.join(directory, "project.json");
    await using stack = new AsyncDisposableStack();
    let output = "";
    stack.defer(() =>
      testInfo.attach("editor server log", {
        body: output,
        contentType: "text/plain",
      }),
    );
    const server = spawn("pnpm", ["dev", "--port", "0"], {
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    const exited = once(server, "exit");
    stack.defer(async () => {
      if (server.exitCode === null) {
        server.kill("SIGTERM");
        await exited;
      }
    });
    server.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    server.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    // Use Playwright's default assertion timeout for server startup.
    await expect
      .poll(() => output.match(/http:\/\/localhost:\d+\//)?.[0])
      .toBeDefined();
    const origin = output.match(/http:\/\/localhost:\d+\//)![0];
    const projectPath = path.relative(process.cwd(), projectFile);
    const url = `${origin}?project=/files/${projectPath.split(path.sep).join("/")}`;
    await use({ url, projectFile });
  },
});
