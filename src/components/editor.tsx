import { PanelLeftOpenIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "../lib/keyboard";
import { EditorRuntime } from "../lib/runtime";
import { CollapsibleSplit } from "./collapsible-split";
import { CompositionPreview } from "./composition-preview";
import { EditorHeader } from "./editor-header";
import { Inspector } from "./inspector";
import { SidePanel, type SideTab } from "./side-panel";
import { Timeline } from "./timeline";
import { Button } from "./ui/button";
import { useEditorProject } from "./use-editor-project";
import { useLayerInteraction } from "./use-layer-interaction";
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
  const layerInteraction = useLayerInteraction({ runtime, state });
  const [sideOpen, setSideOpen] = useState(true);
  const [sideTab, setSideTab] = useState<SideTab>("library");

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
    if (layerInteraction.editing && matchKeyboardEvent(event, "Escape")) {
      event.preventDefault();
      layerInteraction.cancelEdit();
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
  const selectedLayer =
    selection?.type === "layer"
      ? state.project.layers.find((layer) => layer.id === selection.id)
      : undefined;
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
            open={sideOpen}
            sideId="side-panel"
            sideLabel="side panel"
            side={
              <SidePanel
                tab={sideTab}
                layer={selectedLayer}
                runtime={runtime}
                projectPath={projectPath}
                resolveMediaUrl={project.resolveMediaUrl}
                onTabChange={setSideTab}
                onCollapse={() => setSideOpen(false)}
              />
            }
            strip={
              <Button
                aria-label="Expand side panel"
                title="Library and Source"
                aria-expanded={false}
                aria-controls="side-panel"
                className="size-7 text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
                onClick={() => setSideOpen(true)}
              >
                <PanelLeftOpenIcon className="size-4" />
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
            layerInteraction={layerInteraction}
            runtime={runtime}
            project={state.project}
            selection={selection}
            playhead={state.playhead}
            playing={state.playing}
            audioSources={state.audioSources}
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
