import {
  CircleAlertIcon,
  LoaderCircleIcon,
  SaveCheckIcon,
  SaveIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import type { SaveStatus } from "./use-editor-project";

export function EditorHeader({
  file,
  saveStatus,
  onSave,
}: {
  file: string;
  saveStatus: SaveStatus;
  onSave: () => void;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-border px-3 py-2">
      <h1 className="shrink-0 font-medium">Toy Compositor</h1>
      <span
        className="truncate font-mono text-sm text-muted-foreground"
        data-testid="editor-project-file"
      >
        {file}
      </span>
      <div className="flex-1" />
      <EditorSaveButton status={saveStatus} onSave={onSave} />
    </header>
  );
}

function EditorSaveButton({
  status,
  onSave,
}: {
  status: SaveStatus;
  onSave: () => void;
}) {
  const label = {
    saved: "Saved",
    unsaved: "Save (Ctrl+S)",
    saving: "Saving",
    error: "Save failed, retry (Ctrl+S)",
  }[status];
  const icon = {
    saved: <SaveCheckIcon className="size-4" />,
    unsaved: <SaveIcon className="size-4" />,
    saving: <LoaderCircleIcon className="size-3.5 animate-spin" />,
    error: <CircleAlertIcon className="size-3.5" />,
  }[status];
  return (
    <Button
      data-testid="editor-save-button"
      data-status={status}
      aria-label={label}
      title={label}
      disabled={status === "saving"}
      className={
        status === "error"
          ? "size-8 text-destructive"
          : status === "unsaved"
            ? "size-8 hover:bg-accent"
            : "size-8 text-muted-foreground hover:bg-accent"
      }
      onClick={onSave}
    >
      {icon}
    </Button>
  );
}
