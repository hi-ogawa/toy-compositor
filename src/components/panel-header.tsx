import type { ReactNode } from "react";
import { cn } from "./ui/utils";

/** The thin raised band that labels a region, following toy-midi's recorder bands. */
export function PanelHeader({
  title,
  titleTooltip,
  sizeClassName = "h-7 gap-2",
  children,
}: {
  title: ReactNode;
  titleTooltip?: string;
  /** Replaces the default height and gap, since `cn` does not merge conflicting classes. */
  sizeClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center border-b border-neutral-700 bg-neutral-800 px-3 text-xs",
        sizeClassName,
      )}
    >
      <h2 className="shrink-0 font-semibold" title={titleTooltip}>
        {title}
      </h2>
      {children}
    </div>
  );
}
