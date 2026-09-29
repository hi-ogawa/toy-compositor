import {
  CircleAlertIcon,
  ClapperboardIcon,
  LoaderCircleIcon,
  PanelLeftIcon,
  PauseIcon,
  PlayIcon,
  SaveCheckIcon,
  SaveIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import type { SaveStatus } from "./use-editor-project";

export function EditorHeader({
  file,
  playhead,
  playing,
  saveStatus,
  sourceOpen,
  renderSettingsSelected,
  onPlayToggle,
  onSave,
  onSourceOpenChange,
  onRenderSettingsSelect,
}: {
  file: string;
  playhead: number;
  playing: boolean;
  saveStatus: SaveStatus;
  sourceOpen: boolean;
  renderSettingsSelected: boolean;
  onPlayToggle: () => void;
  onSave: () => void;
  onSourceOpenChange: (open: boolean) => void;
  onRenderSettingsSelect: () => void;
}) {
  return (
    <header className="flex h-[53px] shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4 shadow-sm">
      <Button
        aria-label={playing ? "Pause" : "Play"}
        title={playing ? "Pause (Space)" : "Play (Space)"}
        aria-pressed={playing}
        className={cn(
          "size-9",
          playing
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "text-neutral-300 hover:bg-neutral-700/50 hover:text-neutral-100",
        )}
        onClick={onPlayToggle}
      >
        {playing ? (
          <PauseIcon className="size-5" />
        ) : (
          <PlayIcon className="size-5" />
        )}
      </Button>
      <span
        className="font-mono text-sm tabular-nums text-neutral-300"
        data-testid="editor-time"
      >
        {playhead.toFixed(3)} s
      </span>
      <div className="flex-1" />
      <span
        className="max-w-[220px] truncate font-mono text-sm text-neutral-300"
        title={file}
        data-testid="editor-project-file"
      >
        {file}
      </span>
      <div className="h-5 w-px bg-neutral-600" />
      <Button
        aria-label={sourceOpen ? "Close source panel" : "Open source panel"}
        title={sourceOpen ? "Close source panel" : "Open source panel"}
        aria-controls="source-monitor"
        aria-expanded={sourceOpen}
        className={cn("size-9", getToggleClassName(sourceOpen))}
        onClick={() => onSourceOpenChange(!sourceOpen)}
      >
        <PanelLeftIcon className="size-5" />
      </Button>
      <Button
        aria-label="Render settings"
        title="Render settings"
        aria-pressed={renderSettingsSelected}
        className={cn("size-9", getToggleClassName(renderSettingsSelected))}
        onClick={onRenderSettingsSelect}
      >
        <ClapperboardIcon className="size-5" />
      </Button>
      <EditorSaveButton status={saveStatus} onSave={onSave} />
    </header>
  );
}

function getToggleClassName(active: boolean) {
  return active
    ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-700"
    : "text-neutral-300 hover:bg-neutral-700/50 hover:text-neutral-100";
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
    saved: <SaveCheckIcon className="size-5" />,
    unsaved: <SaveIcon className="size-5" />,
    saving: <LoaderCircleIcon className="size-4 animate-spin" />,
    error: <CircleAlertIcon className="size-4" />,
  }[status];
  return (
    <Button
      data-testid="editor-save-button"
      data-status={status}
      aria-label={label}
      title={label}
      disabled={status === "saving"}
      className={cn(
        "size-9 hover:bg-neutral-700/50",
        status === "error"
          ? "text-destructive"
          : status === "unsaved"
            ? "text-neutral-100"
            : "text-neutral-400 hover:text-neutral-100",
      )}
      onClick={onSave}
    >
      {icon}
    </Button>
  );
}
