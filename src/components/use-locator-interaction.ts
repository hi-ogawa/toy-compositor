import { useState } from "react";
import { matchKeyboardEvent } from "../lib/keyboard";
import type { Output } from "../lib/project";
import type { EditorRuntime, EditorState } from "../lib/runtime";
import { snapToFrame } from "../lib/timeline";
import { clamp } from "../utils/math";

export type RenderMarkerType = "start" | "end" | "time";

/**
 * Adds, moves, renames, and deletes locators, and moves the render markers,
 * like toy-midi's `useRecorderLocatorInteraction`. Moves apply as they drag,
 * because neither locators nor the output reschedule playback.
 */
export function useLocatorInteraction({
  runtime,
  state,
}: {
  runtime: EditorRuntime;
  state: EditorState;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const { project, playhead } = state;
  const { fps } = project.canvas;

  // Selecting a layer or the output clears the locator selection, like
  // toy-midi's clearing across selection domains.
  if (state.selection && selectedIndex !== undefined) {
    setSelectedIndex(undefined);
  }

  function select(index: number | undefined) {
    if (index !== undefined) {
      runtime.select(undefined);
    }
    setSelectedIndex(index);
  }

  function add() {
    select(runtime.addLocator(snapToFrame(playhead, fps)));
  }

  function move(index: number, time: number) {
    runtime.updateLocator({
      index,
      update: { time: Math.max(0, snapToFrame(time, fps)) },
    });
  }

  function rename(index: number, label: string) {
    runtime.updateLocator({ index, update: { label } });
  }

  /** Deletes the selected locator, which excludes a selected layer, so only one remove shortcut applies. */
  function handleRemoveShortcut(event: KeyboardEvent): boolean {
    if (
      selectedIndex === undefined ||
      !(
        matchKeyboardEvent(event, "Delete") ||
        matchKeyboardEvent(event, "Backspace")
      )
    ) {
      return false;
    }
    runtime.deleteLocator(selectedIndex);
    select(undefined);
    return true;
  }

  /** Keeps render start at least one frame before render end, and the reverse. */
  function moveRenderMarker(type: RenderMarkerType, time: number) {
    runtime.setOutput(getMovedOutput(project.output, { type, time, fps }));
  }

  return {
    locators: project.locators ?? [],
    selectedIndex,
    select,
    add,
    move,
    rename,
    handleRemoveShortcut,
    moveRenderMarker,
  };
}

export type LocatorInteraction = ReturnType<typeof useLocatorInteraction>;

function getMovedOutput(
  output: Output,
  { type, time, fps }: { type: RenderMarkerType; time: number; fps: number },
): Output {
  const frame = 1 / fps;
  switch (output.type) {
    case "video": {
      return type === "start"
        ? {
            ...output,
            start: snapToFrame(clamp(time, 0, output.end - frame), fps),
          }
        : {
            ...output,
            end: snapToFrame(Math.max(time, output.start + frame), fps),
          };
    }
    case "still": {
      return { ...output, time: Math.max(0, snapToFrame(time, fps)) };
    }
  }
}
