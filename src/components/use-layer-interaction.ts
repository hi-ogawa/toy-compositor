import { useState } from "react";
import { applyLayerEdit, type LayerEditType } from "../lib/layer-edit";
import type { Layer } from "../lib/project";
import type { EditorRuntime, EditorState } from "../lib/runtime";

type LayerEdit = {
  type: LayerEditType;
  id: string;
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
  const getLayer = (id: string) => layers.find((entry) => entry.id === id)!;

  function startEdit({ type, id }: { type: LayerEditType; id: string }) {
    runtime.select({ type: "layer", id });
    setEdit({ type, id, layer: getLayer(id).layer });
  }

  function getEditedLayer(edit: LayerEdit, delta: number): Layer {
    return applyLayerEdit(getLayer(edit.id).layer, {
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

  return {
    layers: edit
      ? layers.map((entry) =>
          entry.id === edit.id ? { ...entry, layer: edit.layer } : entry,
        )
      : layers,
    editing: edit !== undefined,
    startEdit,
    updateEdit,
    finishEdit,
    cancelEdit: () => setEdit(undefined),
  };
}

export type LayerInteraction = ReturnType<typeof useLayerInteraction>;
