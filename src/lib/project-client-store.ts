import { createLocalStorageStore } from "../utils/local-storage-store.ts";
import { DEFAULT_PIXELS_PER_SECOND } from "./timeline.ts";

/** Editor state for one project file that stays in this browser, outside the project file. */
export type ProjectClientState = {
  viewportStart: number;
  pixelsPerSecond: number;
  /** Absent until stored, so a project opens at its output start the first time. */
  playhead?: number;
};

export function createProjectClientStore(projectPath: string) {
  return createLocalStorageStore<ProjectClientState>({
    key: `toy-compositor:project-client:${projectPath}`,
    defaults: { viewportStart: 0, pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND },
  });
}
