import { useState } from "react";
import {
  applyCanvasEdit,
  applyTimeEdit,
  type CanvasEditDelta,
  type CanvasEditType,
  type TimeEditType,
} from "../lib/clip-edit";
import { matchKeyboardEvent } from "../lib/keyboard";
import type { Clip, VisualClip } from "../lib/project";
import { findClip, type EditorRuntime, type EditorState } from "../lib/runtime";

export type EditorSelection =
  | { type: "output" }
  | { type: "layer"; id: string }
  | { type: "clip"; id: string };

/** A drag's draft, of the clip's timing in seconds or its placement in canvas pixels. */
type ClipEdit =
  | { domain: "time"; type: TimeEditType; id: string; clip: Clip }
  | {
      domain: "canvas";
      type: CanvasEditType;
      id: string;
      original: VisualClip;
      clip: Clip;
    };

export type LayerInteraction = ReturnType<typeof useLayerInteraction>;

/**
 * Like toy-midi's `useRecorderClipInteraction` for a single clip, a drag shows
 * as a draft and commits on release, so playback reschedules once rather than
 * on every move.
 * It also holds the layer and output selections, because the inspector edits
 * those too.
 */
export function useLayerInteraction({
  runtime,
  state,
  onSelect,
}: {
  runtime: EditorRuntime;
  state: EditorState;
  /** Only coordinates selection domains by clearing selection in the other domain. */
  onSelect: () => void;
}) {
  const [edit, setEdit] = useState<ClipEdit>();
  const [selection, setSelection] = useState<EditorSelection>();
  const { layers, canvas, media: mediaInfoMap } = state.project;

  function select(selection: EditorSelection) {
    onSelect();
    setSelection(selection);
  }

  function startTimeEdit({ type, id }: { type: TimeEditType; id: string }) {
    select({ type: "clip", id });
    setEdit({ domain: "time", type, id, clip: findClip(layers, id)!.clip });
  }

  function getTimeEditedClip(
    edit: Extract<ClipEdit, { domain: "time" }>,
    delta: number,
  ): Clip {
    return applyTimeEdit(findClip(layers, edit.id)!.clip, {
      type: edit.type,
      delta,
      fps: canvas.fps,
      mediaInfoMap,
    });
  }

  function updateTimeEdit(delta: number) {
    if (edit?.domain !== "time") {
      return;
    }
    setEdit({ ...edit, clip: getTimeEditedClip(edit, delta) });
  }

  function finishTimeEdit(delta: number) {
    if (edit?.domain !== "time") {
      return;
    }
    commitEdit(edit.id, getTimeEditedClip(edit, delta));
  }

  function startCanvasEdit({
    type,
    id,
    clip,
  }: {
    type: CanvasEditType;
    id: string;
    clip: VisualClip;
  }) {
    select({ type: "clip", id });
    setEdit({ domain: "canvas", type, id, original: clip, clip });
  }

  function updateCanvasEdit(delta: CanvasEditDelta) {
    if (edit?.domain !== "canvas") {
      return;
    }
    setEdit({
      ...edit,
      clip: applyCanvasEdit(edit.original, { type: edit.type, delta }),
    });
  }

  function finishCanvasEdit(delta: CanvasEditDelta) {
    if (edit?.domain !== "canvas") {
      return;
    }
    commitEdit(
      edit.id,
      applyCanvasEdit(edit.original, { type: edit.type, delta }),
    );
  }

  function commitEdit(id: string, clip: Clip) {
    setEdit(undefined);
    runtime.updateClip({ id, update: clip });
  }

  /** Removes the selected layer, or the selected clip's layer, the only removal the editor has. */
  function handleRemoveShortcut(event: KeyboardEvent): boolean {
    if (
      !(selection?.type === "layer" || selection?.type === "clip") ||
      edit ||
      !(
        matchKeyboardEvent(event, "Delete") ||
        matchKeyboardEvent(event, "Backspace")
      )
    ) {
      return false;
    }
    runtime.removeLayer(
      selection.type === "layer"
        ? selection.id
        : findClip(layers, selection.id)!.layer.id,
    );
    setSelection(undefined);
    return true;
  }

  return {
    layers: edit
      ? layers.map((layer) => ({
          ...layer,
          clips: layer.clips.map((clip) =>
            clip.id === edit.id ? { ...edit.clip, id: edit.id } : clip,
          ),
        }))
      : layers,
    editing: edit !== undefined,
    selection,
    select,
    clear: () => {
      setEdit(undefined);
      setSelection(undefined);
    },
    startTimeEdit,
    updateTimeEdit,
    finishTimeEdit,
    startCanvasEdit,
    updateCanvasEdit,
    finishCanvasEdit,
    cancelEdit: () => setEdit(undefined),
    handleRemoveShortcut,
  };
}
