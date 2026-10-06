import { cp, rm } from "node:fs/promises";
import path from "node:path";
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test as base,
} from "@playwright/test";
import { getProjectPageUrl } from "../src/lib/routes.ts";

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
    await registerFolder(request, { directory: projectDir });
    const projectFile = path.join(projectDir, "project.json");
    await use({
      projectDir,
      url: getProjectPageUrl({ path: projectFile }),
      projectFile,
    });
  },
});

/** The absolute path of a test's own project folder. */
export function getTestProjectDir(name: string) {
  return path.resolve(".local/e2e-projects", name);
}

/**
 * Register a folder through the server, which runs registry changes in turn.
 * Workers writing the registry file themselves would drop each other's folders.
 */
export async function registerFolder(
  request: APIRequestContext,
  { directory }: { directory: string },
) {
  const response = await request.post("/api/rpc/addProjectFolder", {
    data: { path: directory },
  });
  expect(response.ok()).toBe(true);
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
  {
    deltaX = 0,
    deltaY = 0,
    release = true,
  }: { deltaX?: number; deltaY?: number; release?: boolean },
) {
  return await test.step(
    `Drag by (${deltaX}, ${deltaY})px${release ? "" : " without releasing"}`,
    async () => {
      const bounds = await locator.boundingBox();
      expect(bounds).not.toBeNull();
      const x = bounds!.x + bounds!.width / 2;
      const y = bounds!.y + bounds!.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + deltaX, y + deltaY, { steps: 4 });
      if (release) {
        await page.mouse.up();
      }
      return { x, y };
    },
    { box: true },
  );
}

/** Click a clip region or marker in the editor timeline by its accessible name. */
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

/** Click the composition preview at a point in canvas pixels. */
export async function clickCanvasAt(page: Page, point: CanvasPoint) {
  await test.step(
    `Click the canvas at (${point.x}, ${point.y})`,
    async () => {
      const { x, y } = await getCanvasPagePoint(page, point);
      await page.mouse.click(x, y);
    },
    { box: true },
  );
}

/** Like `dragBy`, from a point on the composition preview and by canvas pixels. */
export async function dragCanvasBy(
  page: Page,
  point: CanvasPoint,
  {
    deltaX = 0,
    deltaY = 0,
    release = true,
  }: { deltaX?: number; deltaY?: number; release?: boolean },
) {
  await test.step(
    `Drag the canvas from (${point.x}, ${point.y}) by (${deltaX}, ${deltaY})${release ? "" : " without releasing"}`,
    async () => {
      const start = await getCanvasPagePoint(page, point);
      const end = await getCanvasPagePoint(page, {
        x: point.x + deltaX,
        y: point.y + deltaY,
      });
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 4 });
      if (release) {
        await page.mouse.up();
      }
    },
    { box: true },
  );
}

type CanvasPoint = { x: number; y: number };

/** Convert a point in canvas pixels to page pixels through the preview scale. */
async function getCanvasPagePoint(page: Page, { x, y }: CanvasPoint) {
  const canvas = page.getByTestId("composition-canvas");
  const bounds = (await canvas.boundingBox())!;
  const width = await canvas.evaluate(
    (element: HTMLElement) => element.offsetWidth,
  );
  const scale = bounds.width / width;
  return { x: bounds.x + x * scale, y: bounds.y + y * scale };
}

/** Expect the inspector's title to name what it inspects, such as a clip's layer. */
export async function expectInspectorTitle(
  page: Page,
  { name }: { name: string },
) {
  await test.step(
    `Expect the inspector to show ${name}`,
    async () => {
      await expect(
        page
          .getByTestId("inspector")
          .getByRole("heading", { name, exact: true }),
      ).toBeVisible();
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

/**
 * Click the timeline ruler, or empty space in another seeking row, at an
 * offset from its origin, which is project time 0.
 */
export async function seekTimelineByPixels(
  page: Page,
  {
    pixels,
    name = "Timeline ruler",
  }: { pixels: number; name?: "Timeline ruler" | "Locator row" },
) {
  await test.step(
    `Seek timeline to ${pixels}px from ${name}`,
    async () => {
      const target = page
        .getByTestId("editor-timeline")
        .getByRole("button", { name, exact: true });
      const box = (await target.boundingBox())!;
      await page.mouse.click(box.x + pixels, box.y + box.height / 2);
    },
    { box: true },
  );
}
