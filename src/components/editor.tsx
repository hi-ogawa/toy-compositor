import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "../lib/keyboard";
import { EditorRuntime, type EditorLayer } from "../lib/runtime";
import type { ProjectLocation } from "../lib/server/api";
import { CollapsibleSplit } from "./collapsible-split";
import { CompositionPreview } from "./composition-preview";
import { EditorHeader } from "./editor-header";
import { Inspector } from "./inspector";
import { LibraryPanel } from "./library-panel";
import { MediaPreview } from "./media-preview";
import { Timeline } from "./timeline";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import { useEditorProject } from "./use-editor-project";
import { useLayerInteraction } from "./use-layer-interaction";
import { useTimeline } from "./use-timeline";
import { useWindowEvent } from "./use-window-event";

export function Editor({ location }: { location: ProjectLocation }) {
  const [runtime] = useState(() => new EditorRuntime());
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
  );
  const project = useEditorProject({ location, runtime });
  const timeline = useTimeline(runtime);
  const layerInteraction = useLayerInteraction({ runtime, state });
  const [sideOpen, setSideOpen] = useState(true);

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
      return;
    }
    if (layerInteraction.handleRemoveShortcut(event)) {
      event.preventDefault();
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
              <LibrarySourceTabs
                layer={selectedLayer}
                runtime={runtime}
                dir={location.dir}
                resolveMediaUrl={project.resolveMediaUrl}
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

function LibrarySourceTabs({
  layer,
  runtime,
  dir,
  resolveMediaUrl,
  onCollapse,
}: {
  layer?: EditorLayer;
  runtime: EditorRuntime;
  dir: string;
  resolveMediaUrl: (src: string) => string;
  onCollapse: () => void;
}) {
  const [tab, setTab] = useState<LibrarySourceTab>("library");
  return (
    <>
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 pl-1 pr-3 text-xs">
        <div
          role="tablist"
          aria-label="Library and Source"
          className="flex h-full"
        >
          {TABS.map(({ id, label, title }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${id}-tab`}
              aria-selected={tab === id}
              aria-controls={`${id}-tabpanel`}
              title={title}
              className={cn(
                "-mb-px border-b-2 px-2 font-semibold",
                tab === id
                  ? "border-sky-400 text-neutral-100"
                  : "border-transparent text-neutral-400 hover:text-neutral-100",
              )}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "source" && layer && "src" in layer && (
          <span
            className="truncate font-mono text-[10px] text-neutral-400"
            title={layer.src}
          >
            {layer.src}
          </span>
        )}
        <Button
          aria-label="Collapse side panel"
          title="Collapse side panel"
          aria-expanded={true}
          aria-controls="side-panel"
          className="ml-auto size-5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
          onClick={onCollapse}
        >
          <PanelLeftCloseIcon className="size-3.5" />
        </Button>
      </div>
      <div
        role="tabpanel"
        id={`${tab}-tabpanel`}
        aria-labelledby={`${tab}-tab`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === "library" ? (
          <LibraryPanel runtime={runtime} dir={dir} />
        ) : (
          <MediaPreview layer={layer} resolveMediaUrl={resolveMediaUrl} />
        )}
      </div>
    </>
  );
}

const TABS = [
  {
    id: "library",
    label: "Library",
    title: "Media files and built-in layers to add.",
  },
  {
    id: "source",
    label: "Source",
    title: "Full source file, independent of project timing and layout.",
  },
] as const;

type LibrarySourceTab = (typeof TABS)[number]["id"];
