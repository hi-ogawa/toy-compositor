import { useState } from "react";
import type { EditorRuntime, EditorState } from "../lib/runtime";
import { useLayerInteraction } from "./use-layer-interaction";
import { useLocatorInteraction } from "./use-locator-interaction";

/**
 * Composes the layer and locator interactions like toy-midi's
 * `useRecorderInteraction`, where selecting in one domain clears the other so
 * at most one selection, and one Delete handler, applies.
 */
export function useEditorInteraction({
  runtime,
  state,
}: {
  runtime: EditorRuntime;
  state: EditorState;
}) {
  const layerInteraction = useLayerInteraction({
    runtime,
    state,
    onSelect: () => locatorInteraction.select(undefined),
  });

  const locatorInteraction = useLocatorInteraction({
    runtime,
    state,
    onSelect: () => layerInteraction.clear(),
  });

  // A loaded project brings new layer and locator ids, so no selection
  // carries over from before it.
  const [file, setFile] = useState(state.file);
  if (state.file !== file) {
    setFile(state.file);
    clearSelection();
  }

  function clearSelection() {
    const hadSelection =
      layerInteraction.selection !== undefined ||
      locatorInteraction.selectedId !== undefined;
    layerInteraction.clear();
    locatorInteraction.select(undefined);
    return hadSelection;
  }

  return {
    layerInteraction,
    locatorInteraction,
    clearSelection,
  };
}
