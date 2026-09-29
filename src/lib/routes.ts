/** Get the start page URL that lists the projects. */
export function getHomePageUrl(): string {
  return "./";
}

/** Get the editor page URL that opens a project. */
export function getProjectPageUrl({ path }: { path: string }): string {
  return `?${new URLSearchParams({ project: path })}`;
}
