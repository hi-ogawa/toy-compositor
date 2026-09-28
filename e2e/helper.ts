import { cp } from "node:fs/promises";
import path from "node:path";
import {
  expect,
  type Locator,
  type Page,
  test as base,
} from "@playwright/test";

export const test = base.extend<{
  editor: { projectDir: string; url: string; projectFile: string };
}>({
  editor: async ({}, use, testInfo) => {
    // Copy the synthetic sample into its own project directory under the
    // server's projects root, so each test saves edits independently.
    const projectDir = testInfo.testId;
    const projectDirPath = path.resolve(".local/e2e-projects", projectDir);
    await cp("samples/synthetic", projectDirPath, { recursive: true });
    const url = `/?${new URLSearchParams({ project: `${projectDir}/project.json` })}`;
    await use({
      projectDir,
      url,
      projectFile: path.join(projectDirPath, "project.json"),
    });
  },
});

/** Wait until an image element has loaded its source. */
export async function expectImageLoaded(image: Locator) {
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
}

/** Seek a video after its media is ready and wait for the requested time. */
export async function seekVideo({
  video,
  time,
}: {
  video: Locator;
  time: number;
}) {
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

/** Drag a locator horizontally from its center. */
export async function dragBy({
  page,
  locator,
  deltaX,
}: {
  page: Page;
  locator: Locator;
  deltaX: number;
}) {
  await test.step(
    `Drag by ${deltaX}px`,
    async () => {
      const bounds = await locator.boundingBox();
      expect(bounds).not.toBeNull();
      const x = bounds!.x + bounds!.width / 2;
      const y = bounds!.y + bounds!.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + deltaX, y, { steps: 4 });
      await page.mouse.up();
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

/** Click the timeline ruler where its tick labels place a project time. */
export async function seekTimeline(page: Page, { time }: { time: number }) {
  await test.step(
    `Seek timeline to ${time}s`,
    async () => {
      const ruler = page
        .getByTestId("editor-timeline")
        .getByRole("button", { name: "Timeline ruler", exact: true });
      const rulerBox = (await ruler.boundingBox())!;
      const ticks = await Promise.all(
        [0, 1].map(async (index) => {
          const tick = ruler.locator("span").nth(index);
          return {
            time: Number(await tick.textContent()),
            x: (await tick.boundingBox())!.x - rulerBox.x,
          };
        }),
      );
      const pixelsPerSecond =
        (ticks[1].x - ticks[0].x) / (ticks[1].time - ticks[0].time);
      await ruler.click({
        position: {
          x: ticks[0].x + (time - ticks[0].time) * pixelsPerSecond,
          y: rulerBox.height / 2,
        },
      });
    },
    { box: true },
  );
}
