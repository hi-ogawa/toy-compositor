export function getHomePageUrl(): string {
  return "./";
}

export function getProjectPageUrl({ path }: { path: string }): string {
  return `?${new URLSearchParams({ project: path })}`;
}
