import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, test } from "@playwright/test";
import { execFileAsync } from "../src/utils/exec.ts";

test("open the synthetic sample from the static build", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  // Build the static site and serve it without the editor's file server.
  await execFileAsync("pnpm", ["build"]);
  const server = spawn("pnpm", ["preview", "--port", "0"], {
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    detached: true,
  });
  let output = "";
  const exited = once(server, "exit");
  server.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    await expect
      .poll(() => output.match(/http:\/\/localhost:\d+\//)?.[0])
      .toBeDefined();
    const url = output.match(/http:\/\/localhost:\d+\//)![0];

    // Open the bundled sample and confirm it loads.
    await page.goto(`${url}?project=/files/samples/synthetic/project.json`);
    await expect(page.getByTestId("editor-project-file")).toContainText(
      "project.json",
    );
    const layers = page.getByTestId("editor-layer-list");

    // Select the video and confirm its source resolves next to the project.
    await layers
      .getByRole("button", { name: "video video", exact: true })
      .click();
    const video = page.locator("main video");
    await expect
      .poll(() =>
        video.evaluate((element: HTMLVideoElement) => element.readyState),
      )
      .toBeGreaterThanOrEqual(1);

    // Select the image and confirm it loads too.
    await layers
      .getByRole("button", { name: "image image", exact: true })
      .click();
    const image = page.getByRole("img", { name: "image", exact: true });
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBeGreaterThan(0);

    // Edit the image position and confirm saving reports the build as read-only.
    const x = page
      .getByTestId("inspector")
      .getByRole("textbox", { name: "x", exact: true });
    await x.fill("400");
    await x.press("Enter");
    const save = page.getByTestId("editor-save-button");
    await save.click();
    await expect(save).toHaveAttribute("data-status", "error");
    await expect(page.getByText("This build is read-only.")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (server.exitCode === null) {
      process.kill(-server.pid!, "SIGTERM");
      await exited;
    }
    await testInfo.attach("preview server log", {
      body: output,
      contentType: "text/plain",
    });
  }
});
