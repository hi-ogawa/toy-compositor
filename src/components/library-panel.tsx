import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { apiClient } from "../lib/api-client";
import type { MediaFile } from "../lib/media-file";
import type { Clip } from "../lib/project";
import type { EditorRuntime } from "../lib/runtime";
import { ClipTypeIcon } from "./clip-type-icon";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import { useWindowEvent } from "./use-window-event";

type LibraryItemSource = MediaFile | { type: "text" } | { type: "color" };

/**
 * Everything that can become a clip: the files in the project's `media/`
 * folder, which the user manages with the desktop file manager, and the
 * built-in text and color clips. Adding puts the clip on the selected layer at
 * the playhead.
 */
export function LibraryPanel({
  runtime,
  projectPath,
  layerId,
}: {
  runtime: EditorRuntime;
  projectPath: string;
  /** The selected layer, which clips are added to. */
  layerId?: string;
}) {
  const filesQuery = useQuery({
    queryKey: ["media-files", projectPath],
    queryFn: () => apiClient.listMediaFiles({ projectPath }),
  });
  // Switching back from the file manager focuses the window without changing
  // page visibility, so refetch on focus to pick up new files.
  useWindowEvent("focus", () => void filesQuery.refetch());
  const openFolderMutation = useMutation({
    mutationFn: () => apiClient.openMediaFolder({ projectPath }),
  });
  // Errors, such as no selected layer, show as the mutation error toast.
  const addClipMutation = useMutation({
    mutationFn: async (source: LibraryItemSource) => {
      if (!layerId) {
        throw new Error("Select a layer first");
      }
      switch (source.type) {
        case "text": {
          return runtime.addTextClip(layerId);
        }
        case "color": {
          return runtime.addColorClip(layerId);
        }
        default: {
          return runtime.addMediaClip({ layerId, file: source });
        }
      }
    },
  });
  const files = filesQuery.data ?? [];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1 text-xs">
      <div className="flex items-baseline px-3 pb-0.5 pt-2 text-[10px] text-neutral-500">
        <h3 className="font-medium uppercase tracking-wide">Media</h3>
        <button
          type="button"
          title="Open the project's media/ folder"
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
              onAdd={() => addClipMutation.mutate(file)}
            />
          ))}
        </ul>
      )}
      <h3 className="px-3 pb-0.5 pt-3 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        Built-in
      </h3>
      <ul aria-label="Built-in clips">
        <LibraryItem
          type="text"
          label="Text"
          onAdd={() => addClipMutation.mutate({ type: "text" })}
        />
        <LibraryItem
          type="color"
          label="Color"
          onAdd={() => addClipMutation.mutate({ type: "color" })}
        />
      </ul>
    </div>
  );
}

function LibraryItem({
  type,
  label,
  mono = false,
  onAdd,
}: {
  type: Clip["type"];
  label: string;
  mono?: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex h-7 cursor-default select-none items-center gap-2 pl-3 pr-1.5 hover:bg-neutral-700/40">
      <ClipTypeIcon type={type} />
      <span className={cn("truncate", mono && "font-mono")} title={label}>
        {label}
      </span>
      <Button
        aria-label={`Add ${label}`}
        title="Add to the selected layer at the playhead"
        className="ml-auto size-5 shrink-0 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
        onClick={onAdd}
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </li>
  );
}
