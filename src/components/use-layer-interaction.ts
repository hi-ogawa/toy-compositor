import { useState } from "react";
import { applyLayerEdit, type LayerEditType } from "../lib/layer-edit";
import type { Range } from "../lib/layout";
import type { Layer } from "../lib/project";
import type { EditorLayer, EditorRuntime, EditorState } from "../lib/runtime";

type LayerEdit = {
  type: LayerEditType;
  id: string;
  source: Range;
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

  /** A video or audio layer is editable once its source's time range loads. */
  function getSourceRange(layer: Layer): Range | undefined {
    if (layer.type !== "video" && layer.type !== "audio") {
      return { start: -Infinity, end: Infinity };
    }
    const info = state.mediaInfos[layer.src];
    return info?.status === "fulfilled" && info.value.type !== "image"
      ? { start: info.value.start, end: info.value.end }
      : undefined;
  }

  function findLayer(id: string): EditorLayer {
    return layers.find((layer) => layer.id === id)!;
  }

  function startEdit({ type, id }: { type: LayerEditType; id: string }) {
    const layer = findLayer(id);
    const source = getSourceRange(layer);
    if (!source) {
      return;
    }
    runtime.select({ type: "layer", id });
    setEdit({ type, id, source, layer });
  }

  function getEditedLayer(edit: LayerEdit, delta: number): EditorLayer {
    const layer = applyLayerEdit(findLayer(edit.id), {
      type: edit.type,
      delta,
      fps: canvas.fps,
      source: edit.source,
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
    canEdit: (layer: Layer) => getSourceRange(layer) !== undefined,
    startEdit,
    updateEdit,
    finishEdit,
    cancelEdit: () => setEdit(undefined),
  };
}

export type LayerInteraction = ReturnType<typeof useLayerInteraction>;
