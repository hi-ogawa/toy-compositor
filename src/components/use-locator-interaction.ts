import { useEffect, useState } from "react";
import { matchKeyboardEvent } from "../lib/keyboard";
import type { Output } from "../lib/project";
import type { EditorRuntime, EditorState } from "../lib/runtime";
import { snapToFrame } from "../lib/timeline";
import { clamp } from "../utils/math";

export type RenderMarkerType = "start" | "end" | "time";

/**
 * Moves apply to the project as they drag, without a draft like layer edits
 * keep, because neither locators nor the output reschedule playback.
 */
export function useLocatorInteraction({
  runtime,
  state,
  onSelect,
}: {
  runtime: EditorRuntime;
  state: EditorState;
  /** Only coordinates selection domains by clearing selection in the other domain. */
  onSelect: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const { project, playhead } = state;
  const { fps } = project.canvas;

  // Drop a selected locator that is gone, such as after loading a project.
  useEffect(() => {
    setSelectedId((current) =>
      project.locators.some((locator) => locator.id === current)
        ? current
        : undefined,
    );
  }, [project.locators]);

  function select(id: string | undefined) {
    if (id !== undefined) {
      onSelect();
    }
    setSelectedId(id);
  }

  function add() {
    select(runtime.addLocator(snapToFrame(playhead, fps)));
  }

  function move(id: string, time: number) {
    runtime.updateLocator(id, { time: Math.max(0, snapToFrame(time, fps)) });
  }

  function rename(id: string, label: string) {
    runtime.updateLocator(id, { label });
  }

  /** Deletes the selected locator, which excludes a selected layer, so only one remove shortcut applies. */
  function handleRemoveShortcut(event: KeyboardEvent): boolean {
    if (
      selectedId === undefined ||
      !(
        matchKeyboardEvent(event, "Delete") ||
        matchKeyboardEvent(event, "Backspace")
      )
    ) {
      return false;
    }
    runtime.deleteLocator(selectedId);
    select(undefined);
    return true;
  }

  function moveRenderMarker(type: RenderMarkerType, time: number) {
    runtime.setOutput(getMovedOutput(project.output, { type, time, fps }));
  }

  return {
    locators: project.locators,
    selectedId,
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
