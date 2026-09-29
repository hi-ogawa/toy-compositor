import type { ReactNode } from "react";

/** The thin raised band that labels a region, following toy-midi's recorder bands. */
export function PanelHeader({
  title,
  titleTooltip,
  children,
}: {
  title: ReactNode;
  titleTooltip?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-3 text-xs">
      <h2 className="shrink-0 font-semibold" title={titleTooltip}>
        {title}
      </h2>
      {children}
    </div>
  );
}
