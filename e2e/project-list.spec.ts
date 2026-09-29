import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { clickTimelineButton, expectImageLoaded, test } from "./helper";

test("open projects from the start page", async ({ page, editor }) => {
  const { projectDir } = editor;

  // Open the editor without a project and confirm it lists this test's project
  // directory with its projects.
  await page.goto("/");
  const section = page
    .getByTestId("project-list")
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", { name: projectDir, exact: true }),
    });
  await expect(section.getByRole("link")).toHaveText([
    "project.json640x360 video",
    "thumbnail.json640x360 still",
  ]);

  // Open the thumbnail project from the list.
  await section.getByRole("link", { name: /thumbnail\.json/ }).click();
  await expect(page).toHaveURL(
    `/?${new URLSearchParams({ project: `${projectDir}/thumbnail.json` })}`,
  );
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "thumbnail.json",
  );

  // Select the image and confirm its source resolves relative to the project file.
  await clickTimelineButton(page, { name: "Label backdrop image" });
  const image = page
    .locator("#source-monitor")
    .getByRole("img", { name: "Label backdrop", exact: true });
  await expectImageLoaded(image);

  // Go back home from the editor menu and confirm the project list shows again.
  await page.getByRole("button", { name: "Editor menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(section.getByRole("link")).toHaveCount(2);
});

test("create a project from the start page", async ({ page }, testInfo) => {
  const projectDir = `${testInfo.testId}-new`;
  await rm(path.resolve(".local/e2e-projects", projectDir), {
    recursive: true,
    force: true,
  });

  // Answer the name prompt with this test's directory, and record every dialog.
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept(projectDir);
  });

  // Create a vertical project and confirm the editor opens its file.
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("menuitem", { name: /vertical-video/ }).click();
  await expect(page).toHaveURL(
    `/?${new URLSearchParams({ project: `${projectDir}/vertical-video.json` })}`,
  );
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "vertical-video.json",
  );

  // Confirm the file holds an empty project on the preset's canvas.
  const project = JSON.parse(
    await readFile(
      path.resolve(".local/e2e-projects", projectDir, "vertical-video.json"),
      "utf-8",
    ),
  );
  expect(project).toEqual({
    canvas: { width: 1080, height: 1920, fps: 30, background: "#000000" },
    output: { type: "video", start: 0, end: 10 },
    layers: [],
    locators: [],
  });

  // Go home and confirm the list shows the new project.
  await page.goto("/");
  const section = page
    .getByTestId("project-list")
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", { name: projectDir, exact: true }),
    });
  await expect(section.getByRole("link")).toHaveText([
    "vertical-video.json1080x1920 video",
  ]);

  // Create the same project again and confirm it is refused without overwriting.
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("menuitem", { name: /vertical-video/ }).click();
  await expect
    .poll(() => dialogs)
    .toEqual([
      "Project name",
      "Project name",
      `Failed to create project: ${projectDir}/vertical-video.json already exists`,
    ]);
  await expect(page).toHaveURL("/");
});
