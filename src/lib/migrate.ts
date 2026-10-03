import { readJson, writeJson } from "../utils/fs.ts";
import type { Layer, Project } from "./project.ts";

/** A rewrite of one older layer shape into the next one. */
type LayerFixup = {
  /** What is wrong with the old shape, completing "<layer> ...". */
  problem: string;
  /** Rewrite the layer, or return undefined when it does not have the old shape. */
  fix: (layer: Layer, project: Project) => Layer | undefined;
};

// In the order the format changed. The format has no version, so each fixup
// recognizes its own old shape and leaves a current layer alone, which also
// makes a second run change nothing.
const LAYER_FIXUPS: LayerFixup[] = [
  // A color layer's box became required, and without one it covered the whole
  // canvas.
  {
    problem: "has no box",
    fix: (layer, { canvas }) =>
      layer.type === "color" && !layer.box
        ? {
            ...layer,
            box: { x: 0, y: 0, width: canvas.width, height: canvas.height },
          }
        : undefined,
  },
];

/**
 * Rewrite a project file from older formats to the current one, or with
 * `check`, leave it as is. Return a description of each layer change, such as
 * `color layer "Tint" has no box`.
 */
export async function migrateProjectFile(
  projectFile: string,
  { check }: { check?: boolean },
) {
  const { project, changes } = migrateProject(
    await readJson<Project>(projectFile),
  );
  if (changes.length > 0 && !check) {
    await writeJson(projectFile, project);
  }
  return changes;
}

function migrateProject(project: Project): {
  project: Project;
  changes: string[];
} {
  const changes: string[] = [];
  const layers = project.layers.map((layer) => {
    for (const fixup of LAYER_FIXUPS) {
      const fixed = fixup.fix(layer, project);
      if (fixed) {
        changes.push(
          `${layer.type} layer "${layer.name ?? layer.type}" ${fixup.problem}`,
        );
        layer = fixed;
      }
    }
    return layer;
  });
  return { project: { ...project, layers }, changes };
}
