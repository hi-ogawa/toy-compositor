import { useState } from "react";
import { matchKeyboardEvent } from "../lib/keyboard";
import { applyLayerEdit, type LayerEditType } from "../lib/layer-edit";
import type { Layer } from "../lib/project";
import type { EditorRuntime, EditorState } from "../lib/runtime";

export type EditorSelection =
  | { type: "output" }
  | { type: "layer"; id: string };

type LayerEdit = {
  type: LayerEditType;
  id: string;
  layer: Layer;
};

export type LayerInteraction = ReturnType<typeof useLayerInteraction>;

/**
 * Moves and trims the selected layer on the timeline, like toy-midi's
 * `useRecorderClipInteraction` for a single clip. A drag shows as a draft and
 * commits on release, so playback reschedules once rather than on every move.
 * It also holds the output selection, because Composition settings is the
 * other thing the inspector edits.
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
  const [edit, setEdit] = useState<LayerEdit>();
  const [selection, setSelection] = useState<EditorSelection>();
  const { layers, canvas, media: mediaInfoMap } = state.project;
  const getLayer = (id: string) => layers.find((layer) => layer.id === id)!;

  function select(selection: EditorSelection) {
    onSelect();
    setSelection(selection);
  }

  function startEdit({ type, id }: { type: LayerEditType; id: string }) {
    select({ type: "layer", id });
    setEdit({ type, id, layer: getLayer(id) });
  }

  function getEditedLayer(edit: LayerEdit, delta: number): Layer {
    return applyLayerEdit(getLayer(edit.id), {
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
    setEdit({ ...edit, layer: getEditedLayer(edit, delta) });
  }

  function finishEdit(delta: number) {
    if (!edit) {
      return;
    }
    setEdit(undefined);
    runtime.updateLayer({
      id: edit.id,
      update: getEditedLayer(edit, delta),
    });
  }

  function handleRemoveShortcut(event: KeyboardEvent): boolean {
    if (
      selection?.type !== "layer" ||
      edit ||
      !(
        matchKeyboardEvent(event, "Delete") ||
        matchKeyboardEvent(event, "Backspace")
      )
    ) {
      return false;
    }
    runtime.removeLayer(selection.id);
    setSelection(undefined);
    return true;
  }

  return {
    layers: edit
      ? layers.map((layer) =>
          layer.id === edit.id ? { ...edit.layer, id: edit.id } : layer,
        )
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
