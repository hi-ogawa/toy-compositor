import type { ReactNode } from "react";
import { cn } from "./ui/utils";

/** The thin raised band that labels a region, following toy-midi's recorder bands. */
export function PanelHeader({
  title,
  titleTooltip,
  className,
  children,
}: {
  title: ReactNode;
  titleTooltip?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-7 shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-3 text-xs",
        className,
      )}
    >
      <h2 className="shrink-0 font-semibold" title={titleTooltip}>
        {title}
      </h2>
      {children}
    </div>
  );
}
