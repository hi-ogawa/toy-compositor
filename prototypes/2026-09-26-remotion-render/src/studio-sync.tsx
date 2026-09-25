// Save props edited in the Studio props panel back to the project file.
// Studio's own save rewrites inline defaultProps in the root .tsx file, so
// studio.ts runs a small endpoint instead and passes its URL as REMOTION_SAVE_URL.

import { useEffect, useRef } from "react";
import { getRemotionEnvironment } from "remotion";
import type { Project } from "../../2026-09-26-ffmpeg-compiler/project.ts";

export function StudioSync({ project }: { project: Project }) {
  const json = JSON.stringify(project, null, 2) + "\n";
  const saved = useRef<string | undefined>(undefined);

  useEffect(() => {
    const url = process.env.REMOTION_SAVE_URL;
    if (!url || !getRemotionEnvironment().isStudio) return;
    // The first props are what was loaded from the file.
    if (saved.current === undefined) {
      saved.current = json;
      return;
    }
    if (json === saved.current) return;
    const timer = setTimeout(() => {
      saved.current = json;
      fetch(url, { method: "POST", body: json }).catch((e) => console.error("[studio-sync] save failed", e));
    }, 300);
    return () => clearTimeout(timer);
  }, [json]);

  return null;
}
