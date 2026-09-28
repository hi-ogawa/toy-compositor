import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { editorProjectStorage, getProjectUrl } from "../lib/project-storage";
import type { EditorRuntime } from "../lib/runtime";
import { useWindowEvent } from "./use-window-event";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export function useEditorProject({ runtime }: { runtime: EditorRuntime }) {
  const [dirty, setDirty] = useState(false);
  const revisionRef = useRef(0);

  const projectQuery = useQuery({
    queryKey: ["editor-project"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const url = getProjectUrl();
      if (!url) {
        throw new Error(
          "No project to open. Add ?project=<url> to the page URL, for example ?project=/files/samples/synthetic/project.json",
        );
      }
      runtime.deserializeProject(await editorProjectStorage.load({ url }));
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
      await editorProjectStorage.save({
        url: runtime.store.get().file,
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
  };
}
