import { useEffect, useState, useSyncExternalStore } from "react";
import { matchKeyboardEvent } from "../lib/keyboard";
import { EditorRuntime } from "../lib/runtime";
import { CompositionPreview } from "./composition-preview";
import { EditorHeader } from "./editor-header";
import { Inspector } from "./inspector";
import { PreviewMonitors } from "./preview-monitors";
import { Timeline } from "./timeline";
import { useEditorProject } from "./use-editor-project";
import { useWindowEvent } from "./use-window-event";

export function Editor({ projectPath }: { projectPath: string }) {
  const [runtime] = useState(() => new EditorRuntime());
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
  );
  const project = useEditorProject({ projectPath, runtime });

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
    <div className="flex h-screen flex-col">
      <EditorHeader
        file={state.file}
        saveStatus={project.saveStatus}
        onSave={() => project.save()}
      />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PreviewMonitors
            layer={previewLayer}
            resolveMediaUrl={project.resolveMediaUrl}
            composition={
              <CompositionPreview
                project={state.project}
                selection={selection}
                time={state.playhead}
                resolveMediaUrl={project.resolveMediaUrl}
              />
            }
          />
          <Timeline
            runtime={runtime}
            project={state.project}
            selection={selection}
            playhead={state.playhead}
          />
        </main>
        <aside
          className="w-72 shrink-0 overflow-y-auto border-l border-border"
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
