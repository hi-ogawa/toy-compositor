import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp } from "node:fs/promises";
import path from "node:path";
import { expect, test as base } from "@playwright/test";

export const test = base.extend<{
  editor: { url: string; projectFile: string };
}>({
  editor: async ({}, use, testInfo) => {
    const root = testInfo.outputPath("projects");
    await cp("samples/synthetic", path.join(root, "synthetic"), {
      recursive: true,
    });
    const projectFile = path.join(root, "synthetic", "project.json");
    const server = spawn("pnpm", ["dev", "--port", "0"], {
      env: {
        ...process.env,
        TOY_COMPOSITOR_ROOT: root,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
      detached: true,
    });
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
      const origin = output.match(/http:\/\/localhost:\d+\//)![0];
      const url = `${origin}?project=/files/synthetic/project.json`;
      await use({ url, projectFile });
    } finally {
      if (server.exitCode === null) {
        // Stop pnpm and the Vite process it started.
        process.kill(-server.pid!, "SIGTERM");
        await exited;
      }
      await testInfo.attach("editor server log", {
        body: output,
        contentType: "text/plain",
      });
    }
  },
});
