import { useQuery } from "@tanstack/react-query";
import {
  listProjectFiles,
  getProjectPageUrl,
  type ProjectEntry,
} from "../lib/project-file";

/** Start page listing the projects under the root, grouped by project directory. */
export function ProjectList() {
  const query = useQuery({
    queryKey: ["project-list"],
    retry: false,
    queryFn: listProjectFiles,
  });
  if (query.error) {
    return <p className="p-4 text-destructive">{query.error.message}</p>;
  }
  if (!query.data) {
    return null;
  }
  const { root, projects } = query.data;
  const dirs = Map.groupBy(projects, (entry) => entry.path.split("/")[0]!);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-lg font-medium">Toy Compositor</h1>
        <p className="font-mono text-sm text-muted-foreground">{root}</p>
      </header>
      {dirs.size === 0 && (
        <p className="text-sm text-muted-foreground">
          No projects yet. Put each project in its own directory under the root,
          with its project JSON files and their media.
        </p>
      )}
      <ul className="flex flex-col gap-4" data-testid="project-list">
        {[...dirs].map(([dir, entries]) => (
          <li key={dir}>
            <h2 className="font-medium">{dir}</h2>
            <ul className="mt-1 flex flex-col">
              {entries.map((entry) => (
                <ProjectRow key={entry.path} entry={entry} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectRow({ entry }: { entry: ProjectEntry }) {
  return (
    <li>
      <a
        href={getProjectPageUrl({ path: entry.path })}
        className="flex items-baseline gap-3 rounded px-2 py-1 text-sm hover:bg-accent"
      >
        <span className="font-mono">{entry.path.split("/").at(-1)}</span>
        <span className="text-xs text-muted-foreground">
          {entry.width}x{entry.height} {entry.output}
        </span>
      </a>
    </li>
  );
}
