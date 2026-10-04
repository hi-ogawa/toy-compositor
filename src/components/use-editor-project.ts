import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "../lib/api-client";
import type { ProjectClientState } from "../lib/project-client-store";
import type { EditorRuntime } from "../lib/runtime";
import type { LocalStorageStore } from "../utils/local-storage-store";
import { useWindowEvent } from "./use-window-event";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export function useEditorProject({
  projectPath,
  runtime,
  clientStore,
}: {
  projectPath: string;
  runtime: EditorRuntime;
  clientStore: LocalStorageStore<ProjectClientState>;
}) {
  const [dirty, setDirty] = useState(false);
  const revisionRef = useRef(0);

  const projectQuery = useQuery({
    queryKey: ["editor-project", projectPath],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const result = await apiClient.loadProject({ path: projectPath });
      if (!result.ok) {
        throw new Error(result.error);
      }
      runtime.deserializeProject(result.value);
      // Loading seeks to the output start, so return to where the project was
      // last left instead.
      const { playhead } = clientStore.store.get();
      if (playhead !== undefined) {
        runtime.seek(playhead);
      }
      const { changes } = result.value;
      if (changes.length > 0) {
        toast.info("Migrated the project file", {
          description: changes.join(", "),
        });
      }
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
        path: projectPath,
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

  // Store the playhead where it stops, skipping playback, which moves it every
  // animation frame.
  useEffect(() => {
    if (!projectQuery.isSuccess) {
      return;
    }
    return runtime.store.subscribeWithSelector({
      selector: (state) => (state.playing ? undefined : state.playhead),
      listener: storePlayhead,
    });
  }, [projectQuery.isSuccess, runtime]);

  function storePlayhead() {
    clientStore.update({ playhead: runtime.store.get().playhead });
  }

  // Closing the tab during playback keeps where it was.
  useWindowEvent("pagehide", () => {
    if (projectQuery.isSuccess) {
      storePlayhead();
    }
  });

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
      apiClient.getMediaUrl({ src, projectPath }),
  };
}
