import { cp, rm } from "node:fs/promises";
import path from "node:path";
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test as base,
} from "@playwright/test";

export const test = base.extend<{
  editor: { projectDir: string; url: string; projectFile: string };
}>({
  editor: async ({ request }, use, testInfo) => {
    // Copy the synthetic sample into its own project folder and register it,
    // so each test saves edits independently. Clear it first, so files a
    // previous run added do not carry over.
    const projectDir = getTestProjectDir(testInfo.testId);
    await rm(projectDir, { recursive: true, force: true });
    await cp("samples/synthetic", projectDir, { recursive: true });
    await addProjectFolder(request, projectDir);
    await use({
      projectDir,
      url: getProjectPageUrl({ dir: projectDir, file: "project.json" }),
      projectFile: path.join(projectDir, "project.json"),
    });
  },
});

/** The absolute path of a test's own project folder. */
export function getTestProjectDir(name: string) {
  return path.resolve(".local/e2e-projects", name);
}

/** Register a project folder with the server, as a typed path does. */
export async function addProjectFolder(
  request: APIRequestContext,
  dir: string,
) {
  const res = await request.post("/api/project-folders", {
    data: { path: dir },
  });
  expect(res.ok()).toBe(true);
}

/** The editor page URL for a project file, as the app links to it. */
export function getProjectPageUrl({
  dir,
  file,
}: {
  dir: string;
  file: string;
}) {
  return `/?${new URLSearchParams({ project: dir, file })}`;
}

/** Wait until an image element has loaded its source. */
export async function expectImageLoaded(image: Locator) {
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
}

/** Seek a video after its media is ready and wait for the requested time. */
export async function seekVideo(video: Locator, { time }: { time: number }) {
  await test.step(
    `Seek video to ${time}s`,
    async () => {
      await expect
        .poll(() =>
          video.evaluate((element: HTMLVideoElement) => element.readyState),
        )
        .toBeGreaterThanOrEqual(2);
      await video.evaluate((element: HTMLVideoElement, time) => {
        element.currentTime = time;
      }, time);
      await expect
        .poll(() =>
          video.evaluate((element: HTMLVideoElement) => element.currentTime),
        )
        .toBeCloseTo(time);
    },
    { box: true },
  );
}

/** Drag a locator horizontally from its center, and return where the pointer started. */
export async function dragBy(
  page: Page,
  locator: Locator,
  { deltaX, release = true }: { deltaX: number; release?: boolean },
) {
  return await test.step(
    `Drag by ${deltaX}px${release ? "" : " without releasing"}`,
    async () => {
      const bounds = await locator.boundingBox();
      expect(bounds).not.toBeNull();
      const x = bounds!.x + bounds!.width / 2;
      const y = bounds!.y + bounds!.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + deltaX, y, { steps: 4 });
      if (release) {
        await page.mouse.up();
      }
      return { x, y };
    },
    { box: true },
  );
}

/** Click a lane label or marker in the editor timeline by its accessible name. */
export async function clickTimelineButton(
  page: Page,
  { name }: { name: string },
) {
  await test.step(
    `Click ${name} in the timeline`,
    async () => {
      await page
        .getByTestId("editor-timeline")
        .getByRole("button", { name, exact: true })
        .click();
    },
    { box: true },
  );
}

/** Locate an inspector field by its label. */
export function getInspectorField(page: Page, { name }: { name: string }) {
  return page
    .getByTestId("inspector")
    .getByRole("textbox", { name, exact: true });
}

/** Type a value into an inspector field and commit it with Enter. */
export async function commitInspectorField(
  page: Page,
  { name, value }: { name: string; value: string },
) {
  await test.step(
    `Set ${name} to ${value}`,
    async () => {
      const field = getInspectorField(page, { name });
      await field.fill(value);
      await field.press("Enter");
    },
    { box: true },
  );
}

/** Expect inspector fields to show the given values. */
export async function expectInspectorFields(
  page: Page,
  fields: Record<string, string>,
) {
  await test.step(
    `Expect ${Object.entries(fields)
      .map(([name, value]) => `${name} ${value}`)
      .join(", ")}`,
    async () => {
      for (const [name, value] of Object.entries(fields)) {
        await expect(getInspectorField(page, { name })).toHaveValue(value);
      }
    },
    { box: true },
  );
}

/** Click the timeline ruler at an offset from its origin, which is project time 0. */
export async function seekTimelineByPixels(
  page: Page,
  { pixels }: { pixels: number },
) {
  await test.step(
    `Seek timeline to ${pixels}px`,
    async () => {
      const ruler = page
        .getByTestId("editor-timeline")
        .getByRole("button", { name: "Timeline ruler", exact: true });
      const box = (await ruler.boundingBox())!;
      await page.mouse.click(box.x + pixels, box.y + box.height / 2);
    },
    { box: true },
  );
}
