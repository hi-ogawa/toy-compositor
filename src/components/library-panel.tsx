import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { apiClient } from "../lib/api-client";
import type { MediaFile } from "../lib/media-file";
import type { Layer } from "../lib/project";
import type { EditorRuntime } from "../lib/runtime";
import { LayerTypeIcon } from "./layer-type-icon";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import { useWindowEvent } from "./use-window-event";

/**
 * Everything that can become a layer: the files in the project's `media/`
 * folder, which the user manages with the desktop file manager, and the
 * built-in text and color layers.
 */
export function LibraryPanel({
  runtime,
  dir,
}: {
  runtime: EditorRuntime;
  dir: string;
}) {
  const [highlighted, setHighlighted] = useState<string>();
  const filesQuery = useQuery({
    queryKey: ["media-files", dir],
    queryFn: () => apiClient.listMediaFiles({ dir }),
  });
  // Switching back from the file manager focuses the window without changing
  // page visibility, so refetch on focus to pick up new files.
  useWindowEvent("focus", () => void filesQuery.refetch());
  const openFolderMutation = useMutation({
    mutationFn: () => apiClient.openMediaFolder({ dir }),
  });
  const addMediaMutation = useMutation({
    mutationFn: (file: MediaFile) => runtime.addMediaLayer(file),
  });
  const files = filesQuery.data ?? [];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1 text-xs">
      <div className="flex items-baseline px-3 pb-0.5 pt-2 text-[10px] text-neutral-500">
        <h3 className="font-mono">media/</h3>
        <button
          type="button"
          className="ml-auto text-[11px] text-neutral-400 underline underline-offset-2 hover:text-neutral-100"
          onClick={() => openFolderMutation.mutate()}
        >
          Open folder
        </button>
      </div>
      {filesQuery.isError ? (
        <p role="alert" className="px-3 py-1 text-destructive">
          {filesQuery.error.message}
        </p>
      ) : filesQuery.isSuccess && files.length === 0 ? (
        <p className="px-3 py-1 text-neutral-500">No files yet.</p>
      ) : (
        <ul aria-label="Media files">
          {files.map((file) => (
            <LibraryItem
              key={file.src}
              type={file.type}
              label={file.src.replace(/^media\//, "")}
              mono
              highlighted={highlighted === file.src}
              onHighlight={() => setHighlighted(file.src)}
              onAdd={() => addMediaMutation.mutate(file)}
            />
          ))}
        </ul>
      )}
      <h3 className="px-3 pb-0.5 pt-3 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        Built-in
      </h3>
      <ul aria-label="Built-in layers">
        <LibraryItem
          type="text"
          label="Text"
          highlighted={highlighted === "text"}
          onHighlight={() => setHighlighted("text")}
          onAdd={() => runtime.addTextLayer()}
        />
        <LibraryItem
          type="color"
          label="Color"
          highlighted={highlighted === "color"}
          onHighlight={() => setHighlighted("color")}
          onAdd={() => runtime.addColorLayer()}
        />
      </ul>
    </div>
  );
}

/** A row that adds its layer from the `+` button or a double-click, while a single click only highlights it. */
function LibraryItem({
  type,
  label,
  mono = false,
  highlighted,
  onHighlight,
  onAdd,
}: {
  type: Layer["type"];
  label: string;
  mono?: boolean;
  highlighted: boolean;
  onHighlight: () => void;
  onAdd: () => void;
}) {
  return (
    <li
      className={cn(
        "flex h-7 cursor-default select-none items-center gap-2 pl-3 pr-1.5",
        highlighted ? "bg-sky-400/15" : "hover:bg-neutral-700/40",
      )}
      onClick={onHighlight}
      onDoubleClick={onAdd}
    >
      <LayerTypeIcon type={type} />
      <span className={cn("truncate", mono && "font-mono")} title={label}>
        {label}
      </span>
      <Button
        aria-label={`Add ${label}`}
        title="Add as layer"
        className="ml-auto size-5 shrink-0 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
        onClick={(event) => {
          event.stopPropagation();
          onAdd();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </li>
  );
}
