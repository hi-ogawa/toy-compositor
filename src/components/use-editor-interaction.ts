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

  return {
    layerInteraction,
    locatorInteraction,
  };
}
