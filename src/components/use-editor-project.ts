import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useWindowEvent } from "../hooks/use-window-event";
import { editorProjectStorage } from "../lib/project-storage";
import type { EditorRuntime } from "../lib/runtime";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export function useEditorProject({ runtime }: { runtime: EditorRuntime }) {
  const [dirty, setDirty] = useState(false);
  const revisionRef = useRef(0);

  const projectQuery = useQuery({
    queryKey: ["editor-project"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      runtime.deserializeProject(await editorProjectStorage.load());
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
      await editorProjectStorage.save(runtime.serializeProject());
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
  };
}
