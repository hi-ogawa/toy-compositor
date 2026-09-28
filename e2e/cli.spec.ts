import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, readFile } from "node:fs/promises";
import http from "node:http";
import { expect, test } from "@playwright/test";
import { execFileAsync } from "../src/utils/exec.ts";

test("serve a project directory from the built CLI and save an edit", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  // Build the package and serve a copy of the synthetic sample with its CLI.
  await execFileAsync("pnpm", ["build"]);
  const root = testInfo.outputPath("projects");
  await cp("samples/synthetic", `${root}/synthetic`, { recursive: true });
  const server = spawn(
    process.execPath,
    ["dist/cli.js", "serve", root, "--port", "0"],
    { env: { ...process.env, NO_COLOR: "1" } },
  );
  let output = "";
  const exited = once(server, "exit");
  server.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    await expect.poll(() => output.match(/Editor: (\S+)/)?.[1]).toBeDefined();
    const url = output.match(/Editor: (\S+)/)![1]!;

    // Open the project from the start page and select the image to confirm
    // media loads.
    await page.goto(url);
    await page
      .getByTestId("project-list")
      .getByRole("link", { name: /project\.json/ })
      .click();
    await page
      .getByTestId("editor-layer-list")
      .getByRole("button", { name: "image image", exact: true })
      .click();
    const image = page.getByRole("img", { name: "image", exact: true });
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBeGreaterThan(0);

    // Edit the image position and save it into the served directory.
    const x = page
      .getByTestId("inspector")
      .getByRole("textbox", { name: "x", exact: true });
    await x.fill("400");
    await x.press("Enter");
    const save = page.getByTestId("editor-save-button");
    await save.click();
    await expect(save).toHaveAttribute("data-status", "saved");
    const saved = JSON.parse(
      await readFile(`${root}/synthetic/project.json`, "utf-8"),
    );
    expect(saved.layers[2].box.x).toBe(400);

    // Reject a request addressed to another host, as a DNS-rebound page would send.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const request = http.get(
        new URL("/api/project?path=synthetic/project.json", url),
        { headers: { host: "evil.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.on("error", reject);
    });
    expect(status).toBe(403);
    expect(errors).toEqual([]);
  } finally {
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await exited;
    }
    await testInfo.attach("cli server log", {
      body: output,
      contentType: "text/plain",
    });
  }
});
