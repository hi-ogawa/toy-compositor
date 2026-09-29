import { expect } from "@playwright/test";
import { DEFAULT_PIXELS_PER_SECOND } from "../src/lib/timeline.ts";
import {
  getInspectorField,
  seekTimelineByPixels,
  clickTimelineButton,
  test,
} from "./helper";

test("navigate the timeline without editing the project", async ({
  page,
  editor,
}) => {
  // Open the synthetic project.
  await page.goto(editor.url);
  const time = page.getByTestId("timeline-time");

  // Click the render start marker and confirm it opens Render settings.
  await clickTimelineButton(page, { name: "Render start" });
  await expect(
    page
      .getByTestId("inspector")
      .getByRole("heading", { name: "Render settings", exact: true }),
  ).toBeVisible();
  await expect(getInspectorField(page, { name: "start" })).toHaveValue("0");

  // Click the locator and confirm the composition video follows the playhead.
  await clickTimelineButton(page, { name: "thumbnail" });
  await expect(time).toContainText("1.500 s");
  const video = page.getByTestId("composition-canvas").locator("video");
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeCloseTo(1.5);

  // Click the ruler at 1.12 s and confirm the playhead snaps to frame 34 (1.133 s).
  await seekTimelineByPixels(page, {
    pixels: 1.12 * DEFAULT_PIXELS_PER_SECOND,
  });
  await expect(time).toContainText("1.133 s");

  // Step one frame forward with ArrowRight and ten frames back with
  // Shift+ArrowLeft, landing on frames 35 (1.167 s) and 25 (0.833 s).
  await page.keyboard.press("ArrowRight");
  await expect(time).toContainText("1.167 s");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(time).toContainText("0.833 s");

  // Step back past the start and confirm the playhead stays at 0.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
  await expect(time).toContainText("0.000 s");
  await page.keyboard.press("ArrowLeft");
  await expect(time).toContainText("0.000 s");

  // Confirm navigation did not mark the project as having unsaved changes.
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});

test("scroll and zoom the timeline with the wheel", async ({
  page,
  editor,
}) => {
  // Open the synthetic project and scroll left past the start, and confirm the
  // viewport stays at 0 so the ruler point 0.5 s in still seeks to 0.5 s.
  await page.goto(editor.url);
  const time = page.getByTestId("timeline-time");
  const ruler = page
    .getByTestId("editor-timeline")
    .getByRole("button", { name: "Timeline ruler", exact: true });
  const box = (await ruler.boundingBox())!;
  const y = box.y + box.height / 2;
  const pointerX = 0.5 * DEFAULT_PIXELS_PER_SECOND;
  await page.mouse.move(box.x + pointerX, y);
  await page.mouse.wheel(0, -500);
  await seekTimelineByPixels(page, { pixels: pointerX });
  await expect(time).toContainText("0.500 s");

  // Scroll right by 1 s at the default zoom, and confirm the same ruler point
  // now seeks to 1.5 s.
  const scrollX = 1 * DEFAULT_PIXELS_PER_SECOND;
  await page.mouse.wheel(0, scrollX);
  await expect(ruler.locator("span").first()).toHaveText("1");
  await seekTimelineByPixels(page, { pixels: pointerX });
  await expect(time).toContainText("1.500 s");

  // Zoom in by 10% with Ctrl+wheel 1.5 s into the viewport, which is 2.5 s.
  // The point under the pointer stays at 2.5 s, and one second to its right
  // at the zoomed scale is 3.5 s.
  const zoomAnchorX = 1.5 * DEFAULT_PIXELS_PER_SECOND;
  const zoomedPixelsPerSecond = 1.1 * DEFAULT_PIXELS_PER_SECOND;
  await page.mouse.move(box.x + zoomAnchorX, y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(ruler.locator("span").first()).toHaveText("2");
  await seekTimelineByPixels(page, { pixels: zoomAnchorX });
  await expect(time).toContainText("2.500 s");
  await seekTimelineByPixels(page, {
    pixels: zoomAnchorX + zoomedPixelsPerSecond,
  });
  await expect(time).toContainText("3.500 s");
});

test("play the composition and step by frames", async ({ page, editor }) => {
  // Open the synthetic project, where the video starts at 0.
  await page.goto(editor.url);
  const timeline = page.getByTestId("editor-timeline");
  const time = page.getByTestId("timeline-time");
  const video = page.getByTestId("composition-canvas").locator("video");
  const readPlayhead = async () => parseFloat((await time.textContent())!);

  // Play and confirm the playhead advances with the video playing.
  await timeline.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    timeline.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect.poll(playhead).toBeGreaterThan(0.5);
  expect(
    await video.evaluate((element: HTMLVideoElement) => element.paused),
  ).toBe(false);

  // Pause with Space and confirm the playhead lands on a frame that the paused
  // video shows.
  await page.keyboard.press("Space");
  await expect(
    timeline.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  expect(
    await video.evaluate((element: HTMLVideoElement) => element.paused),
  ).toBe(true);
  const paused = await readPlayhead();
  expect(Math.abs(paused * 30 - Math.round(paused * 30))).toBeLessThan(0.05);
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeCloseTo(paused, 2);

  // Step one frame forward, then ten back with Shift.
  await page.keyboard.press("ArrowRight");
  await expect.poll(playhead).toBeCloseTo(paused + 1 / 30, 2);
  await page.keyboard.press("Shift+ArrowLeft");
  await expect.poll(playhead).toBeCloseTo(paused - 9 / 30, 2);

  // Confirm playback did not mark the project as having unsaved changes.
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});
