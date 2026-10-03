import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { getProjectPageUrl } from "../src/lib/routes.ts";
import {
  clickTimelineButton,
  expectImageLoaded,
  getTestProjectDir,
  registerFolder,
  test,
} from "./helper";

test("open projects from the start page", async ({ page, editor }) => {
  const { projectDir } = editor;

  // Open the editor without a project and confirm it lists this test's project
  // folder with its project files.
  await page.goto("/");
  const section = getFolderSection(page, projectDir);
  await expect(section.getByRole("link")).toHaveText([
    "project.json640x360 video",
    "thumbnail.json640x360 still",
  ]);

  // Open the thumbnail project from the list.
  await section.getByRole("link", { name: /thumbnail\.json/ }).click();
  await expect(page).toHaveURL(
    getProjectPageUrl({ path: path.join(projectDir, "thumbnail.json") }),
  );
  await expect(page.getByTestId("editor-project-file")).toHaveText(
    `${path.basename(projectDir)}/thumbnail.json`,
  );

  // Select the image in the Source tab and confirm its source resolves
  // relative to the project folder.
  await page.getByRole("tab", { name: "Source" }).click();
  await clickTimelineButton(page, { name: "Select Label backdrop region" });
  const image = page
    .locator("#side-panel")
    .getByRole("img", { name: "Label backdrop", exact: true });
  await expectImageLoaded(image);

  // Go back home from the editor menu and confirm the project list shows again.
  await page.getByRole("button", { name: "Editor menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(section.getByRole("link")).toHaveCount(2);
});

test("add a media folder and create a project file in it", async ({
  page,
}, testInfo) => {
  // Prepare a folder that only holds media, as a cover starts.
  const projectDir = getTestProjectDir(`${testInfo.testId}-new`);
  await rm(projectDir, { recursive: true, force: true });
  await cp("samples/synthetic/media", path.join(projectDir, "media"), {
    recursive: true,
  });

  // Add the folder by its typed path and confirm it lists no project files.
  await page.goto("/");
  await page.getByLabel("Project folder path").fill(projectDir);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const section = getFolderSection(page, projectDir);
  await expect(section).toContainText("No project files yet.");
  await expect(page.getByLabel("Project folder path")).toHaveValue("");

  // Create a vertical project file and confirm the editor opens it.
  await section.getByRole("button", { name: "New project file" }).click();
  await page.getByRole("menuitem", { name: /vertical-video/ }).click();
  await expect(page).toHaveURL(
    getProjectPageUrl({ path: path.join(projectDir, "vertical-video.json") }),
  );
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "vertical-video.json",
  );

  // Confirm the file holds an empty project on the preset's canvas.
  const project = JSON.parse(
    await readFile(path.join(projectDir, "vertical-video.json"), "utf-8"),
  );
  expect(project).toEqual({
    canvas: { width: 1080, height: 1920, fps: 30, background: "#000000" },
    output: { type: "video", start: 0, end: 10 },
    layers: [],
    locators: [],
    media: {},
  });

  // Go home and confirm the folder lists the new project file.
  await page.goto("/");
  await expect(section.getByRole("link")).toHaveText([
    "vertical-video.json1080x1920 video",
  ]);

  // Create the same file again and confirm it is refused without overwriting.
  await section.getByRole("button", { name: "New project file" }).click();
  await page.getByRole("menuitem", { name: /vertical-video/ }).click();
  await expect(
    page.getByText("vertical-video.json already exists"),
  ).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("add a folder by its project file, and remove folders from the list", async ({
  page,
  request,
}, testInfo) => {
  const projectDir = getTestProjectDir(`${testInfo.testId}-copy`);
  const missingDir = getTestProjectDir(`${testInfo.testId}-missing`);
  await rm(projectDir, { recursive: true, force: true });
  await cp("samples/synthetic", projectDir, { recursive: true });
  await rm(missingDir, { recursive: true, force: true });
  await mkdir(missingDir);
  await registerFolder(request, { directory: missingDir });
  await rm(missingDir, { recursive: true });

  // Add a project file's typed path and confirm its folder is listed.
  await page.goto("/");
  await page
    .getByLabel("Project folder path")
    .fill(path.join(projectDir, "thumbnail.json"));
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const section = getFolderSection(page, projectDir);
  await expect(section.getByRole("link")).toHaveCount(2);

  // Remove the folder and confirm it leaves the list while its files stay.
  const name = path.basename(projectDir);
  await section.getByRole("button", { name: `Remove ${name}` }).click();
  await expect(section).toHaveCount(0);
  await stat(path.join(projectDir, "project.json"));

  // Confirm a folder deleted from disk shows as missing, and remove it.
  const missing = getFolderSection(page, missingDir);
  await expect(missing).toContainText("Missing");
  await missing
    .getByRole("button", { name: `Remove ${path.basename(missingDir)}` })
    .click();
  await expect(missing).toHaveCount(0);

  // Add a path that is neither a folder nor a project file, and confirm it is refused.
  await page.getByLabel("Project folder path").fill(missingDir);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByText(`${missingDir} is not a folder or a project file`),
  ).toBeVisible();
});

/** Locate a registered folder's section on the start page by its path. */
function getFolderSection(page: Page, directory: string) {
  return page
    .getByTestId("project-list")
    .getByRole("listitem")
    .filter({ has: page.getByText(directory, { exact: true }) });
}
