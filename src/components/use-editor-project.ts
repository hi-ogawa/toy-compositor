import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiClient, type ProjectLocation } from "../lib/api-client";
import { validateMedia } from "../lib/project";
import type { EditorRuntime } from "../lib/runtime";
import { useWindowEvent } from "./use-window-event";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export function useEditorProject({
  location,
  runtime,
}: {
  location: ProjectLocation;
  runtime: EditorRuntime;
}) {
  const [dirty, setDirty] = useState(false);
  const revisionRef = useRef(0);

  const projectQuery = useQuery({
    queryKey: ["editor-project", location.dir, location.file],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const projectFile = await apiClient.loadProject(location);
      validateMedia(projectFile.project);
      runtime.deserializeProject(projectFile);
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
      await apiClient.saveProject({
        ...location,
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
      apiClient.getMediaUrl({ src, dir: location.dir }),
  };
}
