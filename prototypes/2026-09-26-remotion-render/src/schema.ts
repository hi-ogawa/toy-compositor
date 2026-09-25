// Zod schema for the project format, so the Studio props panel can edit
// every layer field instead of showing layers as "any (not editable)".

import { z } from "zod";
import type { Project } from "../../2026-09-26-ffmpeg-compiler/project.ts";

const box = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });

const crop = z.object({
  left: z.number().optional(),
  right: z.number().optional(),
  top: z.number().optional(),
  bottom: z.number().optional(),
});

const layer = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("video"),
    src: z.string(),
    start: z.number(),
    in: z.number(),
    out: z.number(),
    box,
    crop: crop.optional(),
  }),
  z.object({
    type: z.literal("audio"),
    src: z.string(),
    start: z.number(),
    in: z.number(),
    out: z.number(),
    fadeIn: z.number().optional(),
    fadeOut: z.number().optional(),
    muted: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("image"),
    src: z.string(),
    box,
    crop: crop.optional(),
    start: z.number().optional(),
    end: z.number().optional(),
  }),
  z.object({
    type: z.literal("text"),
    text: z.string(),
    box: z.object({ x: z.number(), y: z.number(), width: z.number() }),
    align: z.enum(["left", "center", "right"]).optional(),
    font: z.object({
      family: z.string(),
      size: z.number(),
      weight: z.number().optional(),
      lineSpacing: z.number().optional(),
    }),
    color: z.string(),
    outline: z.object({ width: z.number(), color: z.string() }).optional(),
    start: z.number().optional(),
    end: z.number().optional(),
  }),
  z.object({
    type: z.literal("color"),
    color: z.string(),
    opacity: z.number().optional(),
    box: box.optional(),
    start: z.number().optional(),
    end: z.number().optional(),
  }),
]);

export const projectSchema = z.object({
  canvas: z.object({
    width: z.number(),
    height: z.number(),
    fps: z.number(),
    background: z.string().optional(),
  }),
  output: z.discriminatedUnion("type", [
    z.object({ type: z.literal("video"), start: z.number(), end: z.number() }),
    z.object({ type: z.literal("still"), time: z.number() }),
  ]),
  layers: z.array(layer),
  // Probed by calculateMetadata, not part of the project file.
  sizes: z.record(z.string(), z.object({ width: z.number(), height: z.number() })).optional(),
}) satisfies z.ZodType<Project>;
