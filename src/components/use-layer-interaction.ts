import { useState } from "react";
import {
  applyBoxEdit,
  type BoxEditDelta,
  type BoxEditType,
} from "../lib/box-edit";
import { applyClipEdit, type ClipEditType } from "../lib/clip-edit";
import { matchKeyboardEvent } from "../lib/keyboard";
import type { Clip } from "../lib/project";
import { findClip, type EditorRuntime, type EditorState } from "../lib/runtime";

export type EditorSelection =
  | { type: "output" }
  | { type: "layer"; id: string }
  | { type: "clip"; id: string };

type VisualClip = Exclude<Clip, { type: "audio" }>;

/** A drag's draft, of the clip's timing on the timeline or its box on the preview. */
type ClipEdit =
  | { domain: "time"; type: ClipEditType; id: string; clip: Clip }
  | {
      domain: "box";
      type: BoxEditType;
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

  function startEdit({ type, id }: { type: ClipEditType; id: string }) {
    select({ type: "clip", id });
    setEdit({ domain: "time", type, id, clip: findClip(layers, id)!.clip });
  }

  function getEditedClip(
    edit: Extract<ClipEdit, { domain: "time" }>,
    delta: number,
  ): Clip {
    return applyClipEdit(findClip(layers, edit.id)!.clip, {
      type: edit.type,
      delta,
      fps: canvas.fps,
      mediaInfoMap,
    });
  }

  function updateEdit(delta: number) {
    if (edit?.domain !== "time") {
      return;
    }
    setEdit({ ...edit, clip: getEditedClip(edit, delta) });
  }

  function finishEdit(delta: number) {
    if (edit?.domain !== "time") {
      return;
    }
    commitEdit(edit.id, getEditedClip(edit, delta));
  }

  function startBoxEdit({
    type,
    id,
    clip,
  }: {
    type: BoxEditType;
    id: string;
    clip: VisualClip;
  }) {
    select({ type: "clip", id });
    setEdit({ domain: "box", type, id, original: clip, clip });
  }

  function updateBoxEdit(delta: BoxEditDelta) {
    if (edit?.domain !== "box") {
      return;
    }
    setEdit({
      ...edit,
      clip: applyBoxEdit(edit.original, { type: edit.type, delta }),
    });
  }

  function finishBoxEdit(delta: BoxEditDelta) {
    if (edit?.domain !== "box") {
      return;
    }
    commitEdit(
      edit.id,
      applyBoxEdit(edit.original, { type: edit.type, delta }),
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
    startEdit,
    updateEdit,
    finishEdit,
    startBoxEdit,
    updateBoxEdit,
    finishBoxEdit,
    cancelEdit: () => setEdit(undefined),
    handleRemoveShortcut,
  };
}
