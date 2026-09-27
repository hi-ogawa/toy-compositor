import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp } from "node:fs/promises";
import path from "node:path";
import { expect, test as base, type Locator } from "@playwright/test";

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

export async function checkPlayback({ media }: { media: Locator }) {
  // Load the selected source and confirm native controls are available.
  await expect(media).toBeVisible();
  await expect(media).toHaveAttribute("controls", "");
  await expect
    .poll(() =>
      media.evaluate((element: HTMLMediaElement) => element.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  // Play the source and wait for its playback position to advance.
  await media.evaluate((element: HTMLMediaElement) => element.play());
  await expect
    .poll(() =>
      media.evaluate((element: HTMLMediaElement) => element.currentTime),
    )
    .toBeGreaterThan(0.2);
  // Pause and seek to one second, then wait for the new frame or sample.
  await media.evaluate((element: HTMLMediaElement) => {
    element.pause();
    element.currentTime = 1;
  });
  await expect
    .poll(() =>
      media.evaluate(
        (element: HTMLMediaElement) =>
          element.paused && !element.seeking && element.readyState >= 2,
      ),
    )
    .toBe(true);
  expect(
    await media.evaluate((element: HTMLMediaElement) => element.currentTime),
  ).toBeCloseTo(1, 2);
}
