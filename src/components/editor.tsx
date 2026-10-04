import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePointerDrag } from "../hooks/use-pointer-drag";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "../lib/keyboard";
import { EditorRuntime, findClip, type ClipLocation } from "../lib/runtime";
import { clamp } from "../utils/math";
import { CollapsibleSplit } from "./collapsible-split";
import { CompositionPreview } from "./composition-preview";
import { EditorHeader } from "./editor-header";
import { Inspector } from "./inspector";
import { LibraryPanel } from "./library-panel";
import { MediaPreview } from "./media-preview";
import { Timeline } from "./timeline";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import { useEditorInteraction } from "./use-editor-interaction";
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
  const { layerInteraction, locatorInteraction, clearSelection } =
    useEditorInteraction({ runtime, state });
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
    if (matchKeyboardEvent(event, "Escape") && clearSelection()) {
      event.preventDefault();
      return;
    }
    if (timeline.handleFrameStepShortcut(event)) {
      event.preventDefault();
      return;
    }
    if (matchKeyboardEvent(event, "L")) {
      event.preventDefault();
      locatorInteraction.add();
      return;
    }
    if (matchKeyboardEvent(event, "Space") && !event.repeat) {
      event.preventDefault();
      void runtime.togglePlayback();
      return;
    }
    if (
      layerInteraction.handleRemoveShortcut(event) ||
      locatorInteraction.handleRemoveShortcut(event)
    ) {
      event.preventDefault();
    }
  });

  if (project.initError) {
    return <p className="p-4 text-destructive">{project.initError.message}</p>;
  }
  if (!project.ready) {
    return null;
  }

  const { selection } = layerInteraction;
  const selectedClip =
    selection?.type === "clip"
      ? findClip(state.project.layers, selection.id)
      : undefined;
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-900 text-neutral-100">
      <EditorHeader
        file={state.file}
        saveStatus={project.saveStatus}
        compositionSettingsSelected={selection?.type === "output"}
        onSave={() => project.save()}
        onCompositionSettingsSelect={() =>
          layerInteraction.select({ type: "output" })
        }
      />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <CollapsibleSplit
            open={sideOpen}
            sideId="side-panel"
            sideLabel="side panel"
            side={
              <LibrarySourceTabs
                selected={selectedClip}
                runtime={runtime}
                projectPath={projectPath}
                resolveMediaUrl={project.resolveMediaUrl}
                onLayerAdd={(clipId) =>
                  layerInteraction.select({ type: "clip", id: clipId })
                }
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
            locatorInteraction={locatorInteraction}
            runtime={runtime}
            project={state.project}
            selection={selection}
            playhead={state.playhead}
            playing={state.playing}
            audioSources={state.audioSources}
            onClearSelection={clearSelection}
          />
        </main>
        <InspectorPanel>
          <Inspector
            runtime={runtime}
            project={state.project}
            selection={selection}
          />
        </InspectorPanel>
      </div>
    </div>
  );
}

function InspectorPanel({ children }: { children: ReactNode }) {
  const DEFAULT_INSPECTOR_WIDTH = 288;
  const MIN_INSPECTOR_WIDTH = 200;
  const MAX_INSPECTOR_WIDTH = 640;

  const [width, setWidth] = useState(DEFAULT_INSPECTOR_WIDTH);
  const resizeRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      return width;
    },
    onMove: (_event, { data, deltaX }) =>
      setWidth(clamp(data - deltaX, MIN_INSPECTOR_WIDTH, MAX_INSPECTOR_WIDTH)),
  });
  return (
    <>
      <div
        ref={resizeRef}
        title="Resize inspector"
        className="relative z-40 w-px shrink-0 cursor-ew-resize touch-none bg-neutral-700 after:absolute after:inset-y-0 after:-left-1 after:w-2 hover:bg-neutral-500"
      />
      <aside
        className="shrink-0 overflow-y-auto bg-neutral-800"
        aria-label="Inspector"
        style={{ width }}
      >
        {children}
      </aside>
    </>
  );
}

function LibrarySourceTabs({
  selected,
  runtime,
  projectPath,
  resolveMediaUrl,
  onLayerAdd,
  onCollapse,
}: {
  selected?: ClipLocation;
  runtime: EditorRuntime;
  projectPath: string;
  resolveMediaUrl: (src: string) => string;
  /** Receives the id of the new layer's clip. */
  onLayerAdd: (clipId: string) => void;
  onCollapse: () => void;
}) {
  const clip = selected?.clip;
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
        {tab === "source" && clip && "src" in clip && (
          <span
            className="truncate font-mono text-[10px] text-neutral-400"
            title={clip.src}
          >
            {clip.src}
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
          <LibraryPanel
            runtime={runtime}
            projectPath={projectPath}
            onLayerAdd={onLayerAdd}
          />
        ) : (
          <MediaPreview selected={selected} resolveMediaUrl={resolveMediaUrl} />
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
