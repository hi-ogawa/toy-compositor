import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  loadProjectFile,
  resolveProjectMediaUrl,
  saveProjectFile,
} from "../lib/project-file";
import type { EditorRuntime } from "../lib/runtime";
import { useWindowEvent } from "./use-window-event";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export function useEditorProject({
  projectUrl,
  runtime,
}: {
  projectUrl: string;
  runtime: EditorRuntime;
}) {
  const [dirty, setDirty] = useState(false);
  const revisionRef = useRef(0);

  const projectQuery = useQuery({
    queryKey: ["editor-project", projectUrl],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      runtime.deserializeProject(await loadProjectFile({ url: projectUrl }));
      return true;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Never write the empty default over a project that did not load.
      if (!projectQuery.isSuccess) {
        throw new Error("Cannot save before the project has loaded.");
      }
      const revision = revisionRef.current;
      await saveProjectFile({
        url: projectUrl,
        project: runtime.serializeProject(),
      });
      return revision;
    },
    onSuccess: (savedRevision) => {
      setDirty(revisionRef.current !== savedRevision);
    },
  });

  useEffect(() => {
    if (!projectQuery.isSuccess) {
      return;
    }
    return runtime.subscribePersistableState(() => {
      revisionRef.current += 1;
      setDirty(true);
    });
  }, [projectQuery.isSuccess, runtime]);

  useWindowEvent("beforeunload", (event) => {
    if (dirty) {
      event.preventDefault();
    }
  });

  const saveStatus: SaveStatus = saveMutation.isError
    ? "error"
    : saveMutation.isPending
      ? "saving"
      : dirty
        ? "unsaved"
        : "saved";
  return {
    initError: projectQuery.error ?? undefined,
    ready: projectQuery.isSuccess,
    save: saveMutation.mutate,
    saveStatus,
    resolveMediaUrl: (src: string) =>
      resolveProjectMediaUrl({ src, projectUrl }),
  };
}
