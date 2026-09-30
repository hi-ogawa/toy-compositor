import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlusIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { apiClient } from "../lib/api-client";
import {
  CANVAS_PRESETS,
  type CanvasPreset,
  createEmptyProject,
} from "../lib/project";
import { getProjectPageUrl } from "../lib/routes";
import type { ProjectEntry, ProjectFolder } from "../lib/server/api";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const PROJECT_LIST_QUERY_KEY = ["project-list"];

/** Start page listing the registered project folders with their project files. */
export function ProjectList() {
  const query = useQuery({
    queryKey: PROJECT_LIST_QUERY_KEY,
    retry: false,
    queryFn: () => apiClient.listProjects(),
  });
  const add = query.data?.add;
  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-900">
      {/* Gradient glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_70%_70%_at_50%_0%,#10b9811f_0%,transparent_70%)]" />

      <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col px-8 py-12">
        <header className="shrink-0">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-100">
            Toy Compositor
          </h1>
        </header>

        <main className="mt-10 min-h-0 flex-1">
          <div className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-700/70 bg-neutral-800/45 shadow-2xl shadow-black/20">
            <div className="shrink-0 border-b border-neutral-700/70 p-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold">Projects</h2>
                {add?.dialog && <AddFolderDialogButtons dialog={add.dialog} />}
              </div>
              {add && <AddFolderPathForm />}
            </div>
            <section
              aria-label="Projects"
              className="min-h-0 shrink overflow-y-auto p-3"
            >
              {query.error ? (
                <div className="p-8 text-center text-sm text-orange-300">
                  {query.error.message}
                </div>
              ) : !query.data ? null : query.data.folders.length === 0 ? (
                <div className="flex min-h-36 flex-col items-center justify-center text-center">
                  <p className="font-medium text-neutral-300">
                    No project folders yet
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Add a folder to begin.
                  </p>
                </div>
              ) : (
                <ul className="space-y-4" data-testid="project-list">
                  {query.data.folders.map((folder) => (
                    <FolderSection
                      key={folder.directory}
                      folder={folder}
                      removable={!!add}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Register a folder picked in the server's native dialog. Linux dialogs pick
 * either folders or files, so a secondary link picks a project file there.
 */
function AddFolderDialogButtons({
  dialog,
}: {
  dialog: "zenity" | "osascript";
}) {
  const queryClient = useQueryClient();
  const pickMutation = useMutation({
    mutationFn: (kind: "folder" | "file") =>
      apiClient.pickProjectFolder({ kind }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: PROJECT_LIST_QUERY_KEY }),
  });
  return (
    <div className="flex items-center gap-3">
      {dialog === "zenity" && (
        <button
          type="button"
          disabled={pickMutation.isPending}
          className="text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-100"
          onClick={() => pickMutation.mutate("file")}
        >
          or pick a project file
        </button>
      )}
      <Button
        disabled={pickMutation.isPending}
        className="gap-1.5 bg-emerald-600 px-4 py-2 text-sm text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500"
        onClick={() => pickMutation.mutate("folder")}
      >
        <FolderPlusIcon className="size-4" />
        Add project folder
      </Button>
    </div>
  );
}

/** Register a typed folder or project file path, which works without a native dialog. */
function AddFolderPathForm() {
  const queryClient = useQueryClient();
  const [path, setPath] = useState("");
  const addMutation = useMutation({
    mutationFn: (path: string) => apiClient.addProjectFolder({ path }),
    onSuccess: async () => {
      setPath("");
      await queryClient.invalidateQueries({ queryKey: PROJECT_LIST_QUERY_KEY });
    },
  });
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (path.trim()) {
          addMutation.mutate(path.trim());
        }
      }}
    >
      <input
        aria-label="Project folder path"
        placeholder="Folder or project file path"
        value={path}
        onChange={(event) => setPath(event.target.value)}
        className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900/60 px-3 py-1.5 font-mono text-sm outline-none placeholder:text-neutral-600 focus:border-neutral-500"
      />
      <Button
        type="submit"
        disabled={addMutation.isPending}
        className="px-3 text-sm text-neutral-200 hover:bg-neutral-700"
      >
        Add
      </Button>
    </form>
  );
}

function FolderSection({
  folder,
  removable,
}: {
  folder: ProjectFolder;
  removable: boolean;
}) {
  const queryClient = useQueryClient();
  const removeMutation = useMutation({
    mutationFn: () =>
      apiClient.removeProjectFolder({ directory: folder.directory }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: PROJECT_LIST_QUERY_KEY }),
  });
  const name = folder.directory.split(/[\\/]/).at(-1)!;
  return (
    <li>
      <div className="flex items-center gap-3 px-1 pb-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-mono text-sm font-medium text-neutral-300">
            {name}
          </h3>
          <p
            className="truncate font-mono text-xs text-neutral-500"
            title={folder.directory}
          >
            {folder.directory}
          </p>
        </div>
        {folder.missing ? (
          <span className="text-xs text-orange-300">Missing</span>
        ) : (
          <NewProjectFileMenu directory={folder.directory} />
        )}
        {removable && (
          <Button
            aria-label={`Remove ${name}`}
            title="Remove from the list, keeping its files"
            disabled={removeMutation.isPending}
            className="size-7 border-transparent text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
            onClick={() => removeMutation.mutate()}
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
      {!folder.missing &&
        (folder.files.length === 0 ? (
          <p className="px-1 text-sm text-neutral-500">No project files yet.</p>
        ) : (
          <ul className="space-y-2">
            {folder.files.map((entry) => (
              <ProjectRow key={entry.path} entry={entry} />
            ))}
          </ul>
        ))}
    </li>
  );
}

/** Create `<folder>/<preset>.json` from a canvas preset, and open it in the editor. */
function NewProjectFileMenu({ directory }: { directory: string }) {
  const createProjectMutation = useMutation({
    mutationFn: async (preset: CanvasPreset) => {
      const path = `${directory}/${preset.name}.json`;
      await apiClient.createProject({
        path,
        project: createEmptyProject(preset),
      });
      return path;
    },
    onSuccess: (path) => {
      window.location.href = getProjectPageUrl({ path });
    },
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          disabled={createProjectMutation.isPending}
          className="gap-1 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
        >
          <PlusIcon className="size-3.5" />
          New project file
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {CANVAS_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.name}
            onSelect={() => createProjectMutation.mutate(preset)}
          >
            {preset.name}
            <span className="ml-auto pl-4 text-xs text-neutral-500">
              {preset.width}x{preset.height}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectRow({ entry }: { entry: ProjectEntry }) {
  return (
    <li>
      <a
        href={getProjectPageUrl({ path: entry.path })}
        className="flex h-16 w-full flex-col justify-center rounded-lg border border-neutral-700/60 bg-neutral-800/70 px-4 transition-colors hover:bg-neutral-800"
      >
        <div className="truncate font-mono text-sm font-medium">
          {entry.path.split(/[\\/]/).at(-1)}
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          {entry.width}x{entry.height} {entry.output}
        </div>
      </a>
    </li>
  );
}
