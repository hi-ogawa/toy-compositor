import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { apiClient } from "../lib/api-client";
import {
  CANVAS_PRESETS,
  type CanvasPreset,
  createEmptyProject,
} from "../lib/project";
import { getProjectPageUrl } from "../lib/routes";
import type { ProjectEntry } from "../lib/server/api";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/** Start page listing the projects under the root, grouped by project directory. */
export function ProjectList() {
  const query = useQuery({
    queryKey: ["project-list"],
    retry: false,
    queryFn: () => apiClient.listProjects(),
  });
  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-900">
      {/* Gradient glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_70%_70%_at_50%_0%,#10b9811f_0%,transparent_70%)]" />

      <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col px-8 py-12">
        <header className="shrink-0">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-100">
            Toy Compositor
          </h1>
          <p
            className="mt-1 truncate font-mono text-sm text-neutral-500"
            title={query.data?.root}
          >
            {query.data?.root}
          </p>
        </header>

        <main className="mt-10 min-h-0 flex-1">
          <div className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-700/70 bg-neutral-800/45 shadow-2xl shadow-black/20">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-700/70 p-4">
              <h2 className="font-semibold">Projects</h2>
              <NewProjectMenu />
            </div>
            <section
              aria-label="Projects"
              className="min-h-0 shrink overflow-y-auto p-3"
            >
              {query.error ? (
                <div className="p-8 text-center text-sm text-orange-300">
                  {query.error.message}
                </div>
              ) : !query.data ? null : query.data.projects.length === 0 ? (
                <div className="flex min-h-36 flex-col items-center justify-center text-center">
                  <p className="font-medium text-neutral-300">
                    No projects yet
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Create a project to begin.
                  </p>
                </div>
              ) : (
                <ProjectDirList projects={query.data.projects} />
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Create `<name>/<preset>.json` from a canvas preset and a prompted name, and
 * open it in the editor.
 */
function NewProjectMenu() {
  const createProjectMutation = useMutation({
    mutationFn: async ({
      path,
      preset,
    }: {
      path: string;
      preset: CanvasPreset;
    }) =>
      apiClient.createProject({ path, project: createEmptyProject(preset) }),
    onSuccess: (_, { path }) => {
      window.location.href = getProjectPageUrl({ path });
    },
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          disabled={createProjectMutation.isPending}
          className="gap-1.5 bg-emerald-600 px-4 py-2 text-sm text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500"
        >
          <PlusIcon className="size-4" />
          New project
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {CANVAS_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.name}
            onSelect={() => {
              const name = window.prompt("Project name")?.trim();
              if (name) {
                createProjectMutation.mutate({
                  path: `${name}/${preset.name}.json`,
                  preset,
                });
              }
            }}
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

function ProjectDirList({ projects }: { projects: ProjectEntry[] }) {
  const projectDirs = Map.groupBy(
    projects,
    (entry) => entry.path.split("/")[0]!,
  );
  return (
    <ul className="space-y-4" data-testid="project-list">
      {[...projectDirs].map(([projectDir, entries]) => (
        <li key={projectDir}>
          <h3 className="truncate px-1 pb-2 font-mono text-sm font-medium text-neutral-300">
            {projectDir}
          </h3>
          <ul className="space-y-2">
            {entries.map((entry) => (
              <ProjectRow key={entry.path} entry={entry} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
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
          {entry.path.split("/").at(-1)}
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          {entry.width}x{entry.height} {entry.output}
        </div>
      </a>
    </li>
  );
}
