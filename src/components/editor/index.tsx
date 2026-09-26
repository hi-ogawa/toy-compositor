import { useEffect, useState, useSyncExternalStore } from "react";
import { useWindowEvent } from "../../hooks/use-window-event";
import { EditorRuntime } from "../../lib/editor/runtime";
import { matchKeyboardEvent } from "../../lib/keyboard";
import { cn } from "../ui/utils";
import { EditorHeader } from "./editor-header";
import { Inspector } from "./inspector";
import { useEditorProject } from "./use-editor-project";

export function Editor() {
  const [runtime] = useState(() => new EditorRuntime());
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
  );
  const project = useEditorProject({ runtime });

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
  const { layers, canvas } = state.project;
  return (
    <div className="flex h-screen flex-col">
      <EditorHeader
        file={state.file}
        saveStatus={project.saveStatus}
        onSave={() => project.save()}
      />
      <div className="flex min-h-0 flex-1">
        <nav
          className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border py-2 text-sm"
          data-testid="editor-layer-list"
        >
          <SelectableRow
            selected={selection?.type === "output"}
            onClick={() => runtime.select({ type: "output" })}
          >
            <span>Output</span>
            <span className="text-xs text-muted-foreground">
              {canvas.width}x{canvas.height} {canvas.fps}fps
            </span>
          </SelectableRow>
          <div className="mx-3 my-2 border-t border-border" />
          {/* Top layer first, like tracks in a timeline. */}
          {layers
            .map((layer, index) => ({ layer, index }))
            .reverse()
            .map(({ layer, index }) => (
              <SelectableRow
                key={index}
                selected={
                  selection?.type === "layer" && selection.index === index
                }
                onClick={() => runtime.select({ type: "layer", index })}
              >
                <span>{layer.name ?? layer.type}</span>
                <span className="text-xs text-muted-foreground">
                  {layer.type}
                </span>
              </SelectableRow>
            ))}
        </nav>
        <main className="min-w-0 flex-1" />
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-border">
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

function SelectableRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-baseline justify-between gap-2 px-3 py-1.5 text-left",
        selected ? "bg-accent" : "hover:bg-secondary",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
