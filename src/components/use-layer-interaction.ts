import { useState } from "react";
import { applyLayerEdit, type LayerEditType } from "../lib/layer-edit";
import type { Layer } from "../lib/project";
import type { EditorLayer, EditorRuntime, EditorState } from "../lib/runtime";

type LayerEdit = {
  type: LayerEditType;
  id: string;
  sourceDuration: number;
  layer: EditorLayer;
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
  const { layers, canvas } = state.project;

  /** A video or audio layer is editable once its source duration loads. */
  function getSourceDuration(layer: Layer): number | undefined {
    if (layer.type !== "video" && layer.type !== "audio") {
      return Infinity;
    }
    const duration = state.sourceDurations[layer.src];
    return duration?.status === "fulfilled" ? duration.value : undefined;
  }

  function findLayer(id: string): EditorLayer {
    return layers.find((layer) => layer.id === id)!;
  }

  function startEdit({ type, id }: { type: LayerEditType; id: string }) {
    const layer = findLayer(id);
    const sourceDuration = getSourceDuration(layer);
    if (sourceDuration === undefined) {
      return;
    }
    runtime.select({ type: "layer", id });
    setEdit({ type, id, sourceDuration, layer });
  }

  function getEditedLayer(edit: LayerEdit, delta: number): EditorLayer {
    const layer = applyLayerEdit(findLayer(edit.id), {
      type: edit.type,
      delta,
      fps: canvas.fps,
      sourceDuration: edit.sourceDuration,
    });
    return { ...layer, id: edit.id };
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
    runtime.updateLayer({ id: edit.id, update: getEditedLayer(edit, delta) });
  }

  return {
    layers: edit
      ? layers.map((layer) => (layer.id === edit.id ? edit.layer : layer))
      : layers,
    editing: edit !== undefined,
    canEdit: (layer: Layer) => getSourceDuration(layer) !== undefined,
    startEdit,
    updateEdit,
    finishEdit,
    cancelEdit: () => setEdit(undefined),
  };
}

export type LayerInteraction = ReturnType<typeof useLayerInteraction>;
