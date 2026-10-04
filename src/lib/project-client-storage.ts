import { LocalStorageStore } from "../utils/local-storage-store.ts";
import { DEFAULT_PIXELS_PER_SECOND } from "./timeline.ts";

/** Editor state for one project file that stays in this browser, outside the project file. */
type ProjectClientState = {
  viewportStart: number;
  pixelsPerSecond: number;
  /** Absent until stored, so a project opens at its output start the first time. */
  playhead?: number;
};

const DEFAULT_PROJECT_CLIENT_STATE: ProjectClientState = {
  viewportStart: 0,
  pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
};

export type ProjectClientStorage = LocalStorageStore<ProjectClientState>;

export function createProjectClientStorage(
  projectPath: string,
): ProjectClientStorage {
  return new LocalStorageStore<ProjectClientState>({
    key: `toy-compositor:project-client:${projectPath}`,
    defaults: DEFAULT_PROJECT_CLIENT_STATE,
  });
}
