/** Where the editor was looking in a project, kept in the browser rather than the project file. */
export type ProjectView = {
  viewportStart: number;
  pixelsPerSecond: number;
  playhead: number;
};

export function readProjectView(projectPath: string): ProjectView | undefined {
  // Storage can be unavailable, such as in a private window, and then the
  // editor opens at its defaults.
  try {
    const json = localStorage.getItem(getProjectViewKey(projectPath));
    return json ? (JSON.parse(json) as ProjectView) : undefined;
  } catch {
    return undefined;
  }
}

export function writeProjectView(projectPath: string, view: ProjectView): void {
  try {
    localStorage.setItem(getProjectViewKey(projectPath), JSON.stringify(view));
  } catch {}
}

function getProjectViewKey(projectPath: string) {
  return `toy-compositor:project-view:${projectPath}`;
}
