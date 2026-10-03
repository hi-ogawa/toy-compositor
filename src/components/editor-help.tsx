import { Dialog } from "./ui/dialog";

type HelpSectionData = {
  title: string;
  items: { action: string; keys?: string; gesture?: string }[];
};

const sections: HelpSectionData[] = [
  {
    title: "Transport",
    items: [
      { action: "Play / pause", keys: "Space" },
      { action: "Step backward / forward one frame", keys: "Left / Right" },
      {
        action: "Step backward / forward ten frames",
        keys: "Shift + Left / Right",
      },
    ],
  },
  {
    title: "Timeline",
    items: [
      {
        action: "Seek to a position",
        gesture: "Click ruler / empty locator row",
      },
      {
        action: "Scroll timeline horizontally",
        gesture: "Wheel over timeline",
      },
      { action: "Zoom at pointer", keys: "Ctrl", gesture: " + wheel" },
    ],
  },
  {
    title: "Layers",
    items: [
      { action: "Select a layer", gesture: "Click layer / lane label" },
      { action: "Move a layer in time", gesture: "Drag layer body" },
      { action: "Trim a layer", gesture: "Drag either layer edge" },
      { action: "Cancel layer move or trim", keys: "Esc" },
      { action: "Remove selected layer", keys: "Delete / Backspace" },
      { action: "Clear selection", keys: "Esc" },
    ],
  },
  {
    title: "Markers and locators",
    items: [
      { action: "Add locator at playhead", keys: "L" },
      {
        action: "Select and seek to a marker",
        gesture: "Click locator / render marker",
      },
      {
        action: "Move a locator or render marker",
        gesture: "Drag marker",
      },
      {
        action: "Rename locator",
        gesture: "Hover / select, then click pencil",
      },
      { action: "Remove selected locator", keys: "Delete / Backspace" },
    ],
  },
  {
    title: "Inspector",
    items: [
      {
        action: "Open composition settings",
        gesture: "Click header button / render marker",
      },
      {
        action: "Move selected layer in stack",
        gesture: "Click Move up / Move down",
      },
      { action: "Commit field edit", keys: "Enter", gesture: " / blur" },
      { action: "Cancel field edit", keys: "Esc" },
      { action: "Nudge numeric field", keys: "Up / Down" },
      {
        action: "Nudge numeric field by ten steps",
        keys: "Shift + Up / Down",
      },
    ],
  },
  {
    title: "Project",
    items: [{ action: "Save project", keys: "Ctrl / Cmd + S" }],
  },
];

export function EditorHelp({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Editor quick reference"
      data-testid="editor-help"
      size="wide"
    >
      <div className="max-h-[calc(90vh-8rem)] overflow-y-auto">
        <div className="columns-2 gap-10">
          {sections.map((section) => (
            <HelpSection key={section.title} section={section} />
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function HelpSection({ section }: { section: HelpSectionData }) {
  return (
    <section className="mb-7 break-inside-avoid">
      <h3 className="mb-3 text-sm font-semibold text-sky-300">
        {section.title}
      </h3>
      <dl>
        {section.items.map((item) => (
          <div
            key={item.action}
            className="flex min-h-[34px] items-center justify-between gap-3"
          >
            <dt className="text-[13px] text-neutral-200">{item.action}</dt>
            <dd className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-neutral-400">
              {item.keys && (
                <kbd className="whitespace-nowrap rounded border border-b-2 border-neutral-600 bg-neutral-700/60 px-1.5 py-0.5 font-sans text-[11px] text-neutral-300">
                  {item.keys}
                </kbd>
              )}
              {item.gesture}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
