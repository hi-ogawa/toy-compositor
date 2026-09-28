import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { test } from "./helper";

test("preview synthetic sources and save an inspector edit", async ({
  page,
  editor,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Open the synthetic project and confirm it starts saved.
  await page.goto(editor.url);
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "project.json",
  );
  const save = page.getByTestId("editor-save-button");
  await expect(save).toHaveAttribute("data-status", "saved");
  const layers = page.getByTestId("editor-layer-list");

  // Select the video and confirm its source preview appears.
  await layers
    .getByRole("button", { name: "video video", exact: true })
    .click();
  await expect(page.locator("main video")).toBeVisible();

  // Switch to audio and confirm its preview replaces the video player.
  await layers
    .getByRole("button", { name: "audio audio", exact: true })
    .click();
  await expect(page.locator("main video")).toHaveCount(0);
  await expect(page.locator("main audio")).toBeVisible();

  // Select the image and confirm it loads without making the project dirty.
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

  // Edit the image position and save the change to the project file.
  const x = page
    .getByTestId("inspector")
    .getByRole("textbox", { name: "x", exact: true });
  await x.fill("400");
  await x.press("Enter");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  const savedProjectJson = JSON.parse(
    await readFile(editor.projectFile, "utf-8"),
  );
  expect(savedProjectJson.layers[2].box.x).toBe(400);

  // Reload the project and confirm the saved position survives.
  await page.reload();
  await layers
    .getByRole("button", { name: "image image", exact: true })
    .click();
  await expect(x).toHaveValue("400");
  await expect(save).toHaveAttribute("data-status", "saved");
  expect(errors).toEqual([]);
});

test("open projects from the start page and keep saves inside the root", async ({
  page,
  editor,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = new URL(editor.url);

  // Open the editor without a project and confirm it lists the cover's projects.
  await page.goto(url.origin);
  const list = page.getByTestId("project-list");
  await expect(list.getByRole("heading", { name: "synthetic" })).toBeVisible();
  await expect(list.getByRole("link")).toHaveText([
    "project.json640x360 video",
    "thumbnail.json640x360 still",
  ]);

  // Open the thumbnail project from the list.
  await list.getByRole("link", { name: /thumbnail\.json/ }).click();
  await expect(page).toHaveURL(
    /\?project=\/files\/synthetic\/thumbnail\.json$/,
  );
  await expect(page.getByTestId("editor-project-file")).toContainText(
    "thumbnail.json",
  );

  // Select the image and confirm its source resolves relative to the project file.
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

  // Reject saves outside the root, into hidden directories, and of non-JSON
  // files.
  const outside = await request.put(`${url.origin}/files/..%2Fescape.json`, {
    data: {},
  });
  expect(outside.status()).toBe(403);
  const hidden = await request.put(
    `${url.origin}/files/synthetic/.cache/escape.json`,
    {
      data: {},
    },
  );
  expect(hidden.status()).toBe(403);
  const media = await request.put(
    `${url.origin}/files/synthetic/media/image.png`,
    { data: {} },
  );
  expect(media.status()).toBe(403);
  expect(errors).toEqual([]);
});
