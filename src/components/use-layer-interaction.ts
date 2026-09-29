import { useState } from "react";
import { applyLayerEdit, type LayerEditType } from "../lib/layer-edit";
import type { Layer } from "../lib/project";
import type { EditorRuntime, EditorState } from "../lib/runtime";

type LayerEdit = { type: LayerEditType; index: number; layer: Layer };

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
  const { layers, canvas } = state.project;

  function getEditedLayer({
    type,
    index,
    delta,
  }: {
    type: LayerEditType;
    index: number;
    delta: number;
  }): Layer {
    const layer = layers[index];
    return applyLayerEdit(layer, {
      type,
      delta,
      fps: canvas.fps,
      sourceDuration:
        layer.type === "video" || layer.type === "audio"
          ? state.sourceDurations[layer.src]
          : undefined,
    });
  }

  function startEdit({ type, index }: { type: LayerEditType; index: number }) {
    runtime.select({ type: "layer", index });
    setEdit({ type, index, layer: layers[index] });
  }

  function updateEdit(delta: number) {
    if (!edit) {
      return;
    }
    setEdit({ ...edit, layer: getEditedLayer({ ...edit, delta }) });
  }

  function finishEdit(delta: number) {
    if (!edit) {
      return;
    }
    setEdit(undefined);
    const layer = getEditedLayer({ ...edit, delta });
    // A drag that snaps back to where it started leaves the project unchanged.
    if (JSON.stringify(layer) !== JSON.stringify(layers[edit.index])) {
      runtime.updateLayer({ index: edit.index, update: layer });
    }
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
