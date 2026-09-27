import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test as base, type Locator } from "@playwright/test";

const test = base.extend<{
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
      const url = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(output || "Editor server startup timed out")),
          15_000,
        );
        const finish = (callback: () => void) => {
          clearTimeout(timeout);
          callback();
        };
        server.stdout.on("data", (chunk: Buffer) => {
          output += chunk.toString();
          const match = output.match(/http:\/\/localhost:\d+\//);
          if (match) {
            finish(() => resolve(match[0]));
          }
        });
        server.stderr.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        server.once("error", (error) => finish(() => reject(error)));
        server.once("exit", () => finish(() => reject(new Error(output))));
      });
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

test("preview synthetic sources and save an inspector edit", async ({
  page,
  editor,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(editor.url);
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "project.json",
  );
  const save = page.getByTestId("editor-save-button");
  await expect(save).toHaveAttribute("data-status", "saved");
  const layers = page.getByTestId("editor-layer-list");

  await layers
    .getByRole("button", { name: "video video", exact: true })
    .click();
  await checkPlayback({ media: page.locator("main video") });
  await layers
    .getByRole("button", { name: "audio audio", exact: true })
    .click();
  await expect(page.locator("main video")).toHaveCount(0);
  await checkPlayback({ media: page.locator("main audio") });
  await layers
    .getByRole("button", { name: "image image", exact: true })
    .click();
  await expect(page.locator("main audio")).toHaveCount(0);
  const image = page.getByRole("img", { name: "image", exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(save).toHaveAttribute("data-status", "saved");

  const x = page
    .getByTestId("inspector")
    .getByRole("textbox", { name: "x", exact: true });
  await x.fill("400");
  await x.press("Enter");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  const saved = JSON.parse(await readFile(editor.projectFile, "utf-8"));
  expect(saved.layers[2].box.x).toBe(400);

  await page.reload();
  await layers
    .getByRole("button", { name: "image image", exact: true })
    .click();
  await expect(x).toHaveValue("400");
  await expect(save).toHaveAttribute("data-status", "saved");
  expect(errors).toEqual([]);
});

async function checkPlayback({ media }: { media: Locator }) {
  await expect(media).toBeVisible();
  await expect(media).toHaveAttribute("controls", "");
  await expect
    .poll(() =>
      media.evaluate((element: HTMLMediaElement) => element.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await media.evaluate((element: HTMLMediaElement) => element.play());
  await expect
    .poll(() =>
      media.evaluate((element: HTMLMediaElement) => element.currentTime),
    )
    .toBeGreaterThan(0.2);
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
