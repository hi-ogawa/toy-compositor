import {
  CircleAlertIcon,
  ClapperboardIcon,
  HouseIcon,
  LoaderCircleIcon,
  MoreVerticalIcon,
  SaveCheckIcon,
  SaveIcon,
} from "lucide-react";
import { getHomePageUrl } from "../lib/routes";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "./ui/utils";
import type { SaveStatus } from "./use-editor-project";

export function EditorHeader({
  file,
  saveStatus,
  compositionSettingsSelected,
  onSave,
  onCompositionSettingsSelect,
}: {
  file: string;
  saveStatus: SaveStatus;
  compositionSettingsSelected: boolean;
  onSave: () => void;
  onCompositionSettingsSelect: () => void;
}) {
  return (
    <header className="flex h-[53px] shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4 shadow-sm">
      <span
        className="max-w-[320px] truncate font-mono text-sm text-neutral-300"
        title={file}
        data-testid="editor-project-file"
      >
        {file}
      </span>
      <EditorSaveButton status={saveStatus} onSave={onSave} />
      <div className="flex-1" />
      <Button
        aria-label="Composition settings"
        title="Composition settings"
        aria-pressed={compositionSettingsSelected}
        className={cn(
          "size-9",
          getToggleClassName(compositionSettingsSelected),
        )}
        onClick={onCompositionSettingsSelect}
      >
        <ClapperboardIcon className="size-5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            title="Editor menu"
            aria-label="Editor menu"
            className="size-9 text-neutral-300 hover:bg-neutral-700/50 hover:text-neutral-100"
          >
            <MoreVerticalIcon className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={getHomePageUrl()}>
              <HouseIcon />
              Home
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
  const canSave = status === "unsaved" || status === "error";
  const label = {
    saved: "All changes saved",
    unsaved: "Unsaved changes (Ctrl/Cmd+S to save)",
    saving: "Saving project",
    error: "Save failed (click or Ctrl/Cmd+S to retry)",
  }[status];
  const icon = {
    saved: <SaveCheckIcon className="size-4" />,
    unsaved: <SaveIcon className="size-4" />,
    saving: <LoaderCircleIcon className="size-3.5 animate-spin" />,
    error: <CircleAlertIcon className="size-3.5" />,
  }[status];
  return (
    <div className="group/save relative">
      <Button
        data-testid="editor-save-button"
        data-status={status}
        aria-label={label}
        aria-describedby="editor-save-tooltip"
        aria-disabled={!canSave}
        onClick={canSave ? onSave : undefined}
        className={cn(
          "size-8 border-transparent bg-transparent hover:bg-neutral-700/50",
          status !== "error" && "hover:text-neutral-100",
          status === "saved" && "text-neutral-500",
          status === "unsaved" && "text-neutral-300",
          status === "saving" && "text-neutral-400",
          status === "error" && "text-red-400 hover:text-red-300",
        )}
      >
        {icon}
      </Button>
      <span
        id="editor-save-tooltip"
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs font-normal whitespace-nowrap text-neutral-100 opacity-0 shadow-lg transition-opacity duration-200 group-focus-within/save:opacity-100 group-hover/save:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}
