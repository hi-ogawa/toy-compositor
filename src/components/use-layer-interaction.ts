import { useState } from "react";
import { applyLayerEdit, type LayerEditType } from "../lib/layer-edit";
import type { Layer } from "../lib/project";
import type { EditorRuntime, EditorState } from "../lib/runtime";

type LayerEdit = {
  type: LayerEditType;
  index: number;
  layer: Layer;
};

/**
 * Moves and trims the selected layer on the timeline, like toy-midi's
 * `useRecorderClipInteraction` for a single clip. A drag shows as a draft and
 * commits on release, so playback reschedules once rather than on every move.
 */
export function useLayerInteraction({
  runtime,
  state,
}: {
  runtime: EditorRuntime;
  state: EditorState;
}) {
  const [edit, setEdit] = useState<LayerEdit>();
  const { layers, canvas, media: mediaInfoMap } = state.project;

  function startEdit({ type, index }: { type: LayerEditType; index: number }) {
    runtime.select({ type: "layer", index });
    setEdit({ type, index, layer: layers[index] });
  }

  function getEditedLayer(edit: LayerEdit, delta: number): Layer {
    return applyLayerEdit(layers[edit.index], {
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
      index: edit.index,
      update: getEditedLayer(edit, delta),
    });
  }

  return {
    layers: edit ? layers.with(edit.index, edit.layer) : layers,
    editing: edit !== undefined,
    startEdit,
    updateEdit,
    finishEdit,
    cancelEdit: () => setEdit(undefined),
  };
}

export type LayerInteraction = ReturnType<typeof useLayerInteraction>;
