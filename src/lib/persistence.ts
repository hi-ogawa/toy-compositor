import type { Project } from "./project.ts";
import type { EditorLayer, EditorLocator, EditorProject } from "./runtime.ts";

export function serializeEditorProject(project: EditorProject): Project {
  return {
    ...project,
    layers: project.layers.map(({ id: _id, ...layer }) => layer),
    locators: project.locators.map(({ id: _id, ...locator }) => locator),
  };
}

export function deserializeEditorProject(project: Project): EditorProject {
  return {
    ...project,
    layers: project.layers.map((layer): EditorLayer => ({
      ...layer,
      id: crypto.randomUUID(),
    })),
    locators: (project.locators ?? []).map((locator): EditorLocator => ({
      ...locator,
      id: crypto.randomUUID(),
    })),
  };
}

/** Check what consumers read without checking. */
export function validateProject(project: Project): void {
  for (const layer of project.layers) {
    if (layer.type === "color" && !layer.box) {
      throw new Error(
        `color layer "${layer.name ?? layer.type}" has no box, run migrate`,
      );
    }
    if (!("src" in layer)) {
      continue;
    }
    const label = `${layer.type} layer "${layer.name ?? layer.type}" (${layer.src})`;
    // A project file from before `media` has none at all.
    const mediaInfo = project.media?.[layer.src];
    if (!mediaInfo) {
      throw new Error(`${label} has no media info, run update-media`);
    }
    if (layer.type !== "audio" && !mediaInfo.video) {
      throw new Error(
        `${label} has no video stream, use a file with video or run update-media if the file changed`,
      );
    }
  }
}

/**
 * Rewrite a project from older formats, in the order the format changed, and
 * describe each layer change.
 */
export function migrateProject(project: Project): {
  project: Project;
  changes: string[];
} {
  const changes: string[] = [];
  const layers = project.layers.map((layer) => {
    const label = `${layer.type} layer "${layer.name ?? layer.type}"`;
    if (layer.type === "color" && !layer.box) {
      changes.push(`${label} has no box`);
      const { width, height } = project.canvas;
      layer = { ...layer, box: { x: 0, y: 0, width, height } };
    }
    return layer;
  });
  return { project: { ...project, layers }, changes };
}
