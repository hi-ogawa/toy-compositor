import { PanelLeftCloseIcon } from "lucide-react";
import type { EditorLayer, EditorRuntime } from "../lib/runtime";
import { LibraryPanel } from "./library-panel";
import { MediaPreview } from "./media-preview";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";

export type SideTab = "library" | "source";

/**
 * The editor's left panel: the Library to add layers from, and the Source
 * monitor for the selected layer's file.
 */
export function SidePanel({
  tab,
  layer,
  runtime,
  projectPath,
  resolveMediaUrl,
  onTabChange,
  onCollapse,
}: {
  tab: SideTab;
  layer?: EditorLayer;
  runtime: EditorRuntime;
  projectPath: string;
  resolveMediaUrl: (src: string) => string;
  onTabChange: (tab: SideTab) => void;
  onCollapse: () => void;
}) {
  const source = tab === "source" && layer && "src" in layer ? layer.src : "";
  return (
    <>
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 pl-1 pr-3 text-xs">
        <div role="tablist" aria-label="Side panel" className="flex h-full">
          <SideTabButton
            tab="library"
            label="Library"
            title="Media files and built-in layers to add."
            selected={tab === "library"}
            onSelect={onTabChange}
          />
          <SideTabButton
            tab="source"
            label="Source"
            title="Full source file, independent of project timing and layout."
            selected={tab === "source"}
            onSelect={onTabChange}
          />
        </div>
        {source && (
          <span
            className="truncate font-mono text-[10px] text-neutral-400"
            title={source}
          >
            {source}
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
        id={`side-panel-${tab}`}
        aria-labelledby={`side-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === "library" ? (
          <LibraryPanel runtime={runtime} projectPath={projectPath} />
        ) : (
          <MediaPreview layer={layer} resolveMediaUrl={resolveMediaUrl} />
        )}
      </div>
    </>
  );
}

function SideTabButton({
  tab,
  label,
  title,
  selected,
  onSelect,
}: {
  tab: SideTab;
  label: string;
  title: string;
  selected: boolean;
  onSelect: (tab: SideTab) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`side-tab-${tab}`}
      aria-selected={selected}
      aria-controls={`side-panel-${tab}`}
      title={title}
      className={cn(
        "-mb-px border-b-2 px-2 font-semibold",
        selected
          ? "border-sky-400 text-neutral-100"
          : "border-transparent text-neutral-400 hover:text-neutral-100",
      )}
      onClick={() => onSelect(tab)}
    >
      {label}
    </button>
  );
}
