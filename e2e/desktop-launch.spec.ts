import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_SERVER === "dev",
  "serve --open runs the built CLI, which only the build server builds",
);

// Stop the servers that a failed test leaves running.
const children: ChildProcess[] = [];
test.afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill();
  }
});

test("serve --open until the last tab closes", async ({ page }, testInfo) => {
  // Replace the platform's opener with a script that records the URL, so the
  // test opens it in its own browser instead.
  const dir = path.resolve(".local/e2e-desktop-launch", testInfo.testId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, "bin"), { recursive: true });
  const openedFile = path.join(dir, "opened.txt");
  for (const opener of ["xdg-open", "open"]) {
    const script = path.join(dir, "bin", opener);
    await writeFile(script, `#!/bin/sh\necho "$1" >> "${openedFile}"\n`);
    await chmod(script, 0o755);
  }
  const port = await getFreePort();
  const runServe = () => {
    const child = spawn(
      process.execPath,
      ["dist/server/cli.js", "serve", "--open", "--port", String(port)],
      {
        env: {
          ...process.env,
          PATH: `${path.join(dir, "bin")}${path.delimiter}${process.env.PATH}`,
          TOY_COMPOSITOR_CONFIG_DIR: path.join(dir, "config"),
        },
        stdio: "inherit",
      },
    );
    children.push(child);
    return child;
  };
  const readOpened = async () =>
    (await readFile(openedFile, "utf8").catch(() => "")).trim().split("\n");

  // Start the server and confirm it opened the start page.
  const server = runServe();
  const url = `http://localhost:${port}/`;
  await expect.poll(readOpened).toEqual([url]);
  await page.goto(url);
  await expect(page.getByText("No project folders yet")).toBeVisible();

  // Start a second one on the same port, and confirm it opens another tab on
  // the running server and exits.
  const second = runServe();
  expect(await waitForExit(second)).toBe(0);
  expect(await readOpened()).toEqual([url, url]);

  // Reload the tab and confirm the server outlives the grace period.
  await page.reload();
  await page.waitForTimeout(4000);
  expect(server.exitCode).toBe(null);

  // Close the last tab and confirm the server exits after the grace period.
  await page.close();
  expect(await waitForExit(server)).toBe(0);
});

async function waitForExit(child: ChildProcess) {
  if (child.exitCode === null) {
    await once(child, "exit");
  }
  return child.exitCode;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}
