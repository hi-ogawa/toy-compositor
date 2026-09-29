import { MonitorPlayIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "../lib/keyboard";
import { EditorRuntime } from "../lib/runtime";
import { CollapsibleSplit } from "./collapsible-split";
import { CompositionPreview } from "./composition-preview";
import { EditorHeader } from "./editor-header";
import { Inspector } from "./inspector";
import { MediaPreview } from "./media-preview";
import { Timeline } from "./timeline";
import { Button } from "./ui/button";
import { useEditorProject } from "./use-editor-project";
import { useTimeline } from "./use-timeline";
import { useWindowEvent } from "./use-window-event";

export function Editor({ projectPath }: { projectPath: string }) {
  const [runtime] = useState(() => new EditorRuntime());
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
  );
  const project = useEditorProject({ projectPath, runtime });
  const timeline = useTimeline(runtime);
  const [sourceOpen, setSourceOpen] = useState(true);

  useEffect(() => {
    document.title = state.file
      ? `${state.file} - Toy Compositor`
      : "Toy Compositor";
  }, [state.file]);

  useWindowEvent("keydown", (event) => {
    if (matchKeyboardEvent(event, "Ctrl+S") && !event.repeat) {
      event.preventDefault();
      if (project.ready && project.saveStatus !== "saving") {
        project.save();
      }
      return;
    }
    if (!project.ready || isShortcutTextInputTarget(event.target)) {
      return;
    }
    if (timeline.handleFrameStepShortcut(event)) {
      event.preventDefault();
      return;
    }
    if (matchKeyboardEvent(event, "Space") && !event.repeat) {
      event.preventDefault();
      void runtime.togglePlayback();
    }
  });

  if (project.initError) {
    return <p className="p-4 text-destructive">{project.initError.message}</p>;
  }
  if (!project.ready) {
    return null;
  }

  const { selection } = state;
  const { layers } = state.project;
  const previewLayer =
    selection?.type === "layer" ? layers[selection.index] : undefined;
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-900 text-neutral-100">
      <EditorHeader
        file={state.file}
        saveStatus={project.saveStatus}
        compositionSettingsSelected={selection?.type === "output"}
        onSave={() => project.save()}
        onCompositionSettingsSelect={() => runtime.select({ type: "output" })}
      />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <CollapsibleSplit
            open={sourceOpen}
            sideId="source-monitor"
            sideLabel="source panel"
            side={
              <MediaPreview
                layer={previewLayer}
                resolveMediaUrl={project.resolveMediaUrl}
                onCollapse={() => setSourceOpen(false)}
              />
            }
            strip={
              <Button
                aria-label="Expand source panel"
                title="Source"
                aria-expanded={false}
                aria-controls="source-monitor"
                className="size-7 text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
                onClick={() => setSourceOpen(true)}
              >
                <MonitorPlayIcon className="size-4" />
              </Button>
            }
            main={
              <CompositionPreview
                project={state.project}
                selection={selection}
                time={state.playhead}
                runtime={runtime}
                resolveMediaUrl={project.resolveMediaUrl}
              />
            }
          />
          <Timeline
            timeline={timeline}
            runtime={runtime}
            project={state.project}
            selection={selection}
            playhead={state.playhead}
            playing={state.playing}
          />
        </main>
        <aside
          className="w-72 shrink-0 overflow-y-auto border-l border-neutral-700 bg-neutral-800"
          aria-label="Inspector"
        >
          <Inspector
            runtime={runtime}
            project={state.project}
            selection={selection}
          />
        </aside>
      </div>
    </div>
  );
}
