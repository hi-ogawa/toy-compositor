import { createLocalStorageStore } from "../utils/local-storage-store.ts";
import { DEFAULT_PIXELS_PER_SECOND } from "./timeline.ts";

export type ProjectView = {
  viewportStart: number;
  pixelsPerSecond: number;
  /** Absent until stored, so a project opens at its output start the first time. */
  playhead?: number;
};

/** Where the editor was looking in one project file. */
export function createProjectViewStore(projectPath: string) {
  return createLocalStorageStore<ProjectView>({
    key: `toy-compositor:project-view:${projectPath}`,
    defaults: { viewportStart: 0, pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND },
  });
}
