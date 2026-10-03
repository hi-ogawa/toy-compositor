import {
  AudioLinesIcon,
  FilmIcon,
  ImageIcon,
  SquareIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";
import type { Clip } from "../lib/project";

export function ClipTypeIcon({ type }: { type: Clip["type"] }) {
  const Icon = CLIP_TYPE_ICONS[type];
  return (
    <Icon
      role="img"
      aria-label={type}
      className="size-3.5 shrink-0 text-neutral-400"
    >
      <title>{type}</title>
    </Icon>
  );
}

const CLIP_TYPE_ICONS: Record<Clip["type"], LucideIcon> = {
  video: FilmIcon,
  audio: AudioLinesIcon,
  image: ImageIcon,
  text: TypeIcon,
  color: SquareIcon,
};
