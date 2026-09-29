import {
  AudioLinesIcon,
  FilmIcon,
  ImageIcon,
  SquareIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";
import type { Layer } from "../lib/project";

/** Marks a layer type by icon, in timeline lanes and Library rows. */
export function LayerTypeIcon({ type }: { type: Layer["type"] }) {
  const Icon = LAYER_TYPE_ICONS[type];
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

const LAYER_TYPE_ICONS: Record<Layer["type"], LucideIcon> = {
  video: FilmIcon,
  audio: AudioLinesIcon,
  image: ImageIcon,
  text: TypeIcon,
  color: SquareIcon,
};
