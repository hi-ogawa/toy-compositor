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
    const server = spawn(
      process.execPath,
      ["src/lib/server/dev-cli.ts", projectFile],
      { env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } },
    );
    let output = "";
    const exited = once(server, "exit");
    try {
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
      const url = output.match(/http:\/\/localhost:\d+\//)![0];
      await use({ url, projectFile });
    } finally {
      if (server.exitCode === null) {
        server.kill("SIGTERM");
        await exited;
      }
      await testInfo.attach("editor server log", {
        body: output,
        contentType: "text/plain",
      });
    }
  },
});
