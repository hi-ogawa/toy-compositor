import { useEffect, useEffectEvent } from "react";
import {
  writeProjectView,
  type ProjectView,
} from "../lib/project-view-storage";
import type { EditorRuntime } from "../lib/runtime";
import type { TimelineView } from "./use-timeline";
import { useWindowEvent } from "./use-window-event";

/**
 * Restores the playhead from the view stored for the project, and stores the
 * view as it changes. The timeline takes the stored zoom and scroll itself.
 */
export function useProjectView({
  projectPath,
  runtime,
  ready,
  savedView,
  timeline,
}: {
  projectPath: string;
  runtime: EditorRuntime;
  ready: boolean;
  savedView?: ProjectView;
  timeline: TimelineView;
}) {
  const writeView = useEffectEvent(() => {
    // Before loading finishes, the playhead is not the project's yet.
    if (!ready) {
      return;
    }
    writeProjectView(projectPath, {
      viewportStart: timeline.viewportStart,
      pixelsPerSecond: timeline.pixelsPerSecond,
      playhead: runtime.store.get().playhead,
    });
  });

  // Loading seeks to the output start, so restore the playhead after it.
  useEffect(() => {
    if (ready && savedView) {
      runtime.seek(savedView.playhead);
    }
  }, [ready]);

  useEffect(() => {
    writeView();
  }, [ready, timeline.viewportStart, timeline.pixelsPerSecond]);

  // Skip the playhead while playing, which moves it every animation frame,
  // and store it where playback stops.
  useEffect(
    () =>
      runtime.store.subscribeWithSelector({
        selector: (state) => (state.playing ? undefined : state.playhead),
        listener: writeView,
      }),
    [runtime],
  );

  // Closing the tab during playback keeps where it was.
  useWindowEvent("pagehide", writeView);
}
