import { expect } from "@playwright/test";
import { dragBy, test } from "./helper";

test("restore the panel layout when reopening the editor", async ({
  page,
  editor,
}) => {
  // Open the project, widen the inspector, raise the timeline, switch the
  // preview to hide content outside the canvas, and fold the side panel.
  await page.goto(editor.url);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const timeline = page.getByTestId("editor-timeline");
  const initialTimelineHeight = (await timeline.boundingBox())!.height;
  await dragBy(page, page.getByTitle("Resize inspector"), { deltaX: -100 });
  await dragBy(page, page.getByTitle("Resize timeline"), { deltaY: -50 });
  const inspectorWidth = (await inspector.boundingBox())!.width;
  const timelineHeight = (await timeline.boundingBox())!.height;
  expect(timelineHeight).toBeGreaterThan(initialTimelineHeight);
  const clipToCanvas = page.getByTitle(
    "Hide content outside the canvas, as in the render",
  );
  await clipToCanvas.click();
  await expect(clipToCanvas).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Collapse side panel", exact: true })
    .click();
  const expandSidePanel = page.getByRole("button", {
    name: "Expand side panel",
    exact: true,
  });
  await expect(expandSidePanel).toBeVisible();

  // Reopen the project, and confirm the layout comes back without marking the
  // project as having unsaved changes.
  await page.reload();
  await expect(expandSidePanel).toBeVisible();
  await expect(clipToCanvas).toHaveAttribute("aria-pressed", "true");
  expect((await inspector.boundingBox())!.width).toBe(inspectorWidth);
  expect((await timeline.boundingBox())!.height).toBe(timelineHeight);
  await expect(page.getByTestId("editor-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});
