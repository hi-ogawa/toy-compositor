import { useState } from "react";
import { applyClipEdit, type ClipEditType } from "../lib/clip-edit";
import { matchKeyboardEvent } from "../lib/keyboard";
import type { Clip } from "../lib/project";
import { findClip, type EditorRuntime, type EditorState } from "../lib/runtime";

export type EditorSelection =
  | { type: "output" }
  | { type: "layer"; id: string }
  | { type: "clip"; id: string };

type ClipEdit = {
  type: ClipEditType;
  id: string;
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

  function startEdit({ type, id }: { type: ClipEditType; id: string }) {
    select({ type: "clip", id });
    setEdit({ type, id, clip: findClip(layers, id)!.clip });
  }

  function getEditedClip(edit: ClipEdit, delta: number): Clip {
    return applyClipEdit(findClip(layers, edit.id)!.clip, {
      type: edit.type,
      delta,
      fps: canvas.fps,
      mediaInfoMap,
    });
  }

  function updateEdit(delta: number) {
    if (!edit) {
      return;
    }
    setEdit({ ...edit, clip: getEditedClip(edit, delta) });
  }

  function finishEdit(delta: number) {
    if (!edit) {
      return;
    }
    setEdit(undefined);
    runtime.updateClip({
      id: edit.id,
      update: getEditedClip(edit, delta),
    });
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
    startEdit,
    updateEdit,
    finishEdit,
    cancelEdit: () => setEdit(undefined),
    handleRemoveShortcut,
  };
}
