import fs from "node:fs";
import { Readable } from "node:stream";
import { getMediaContentType } from "../media-file.ts";

/** An error that becomes a response with its status and message. */
export class HttpError extends Error {
  status: number;
  constructor({ status, message }: { status: number; message: string }) {
    super(message);
    this.status = status;
  }
}

/** A required query parameter, or a 400 error. */
export function getParam(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) {
    throw new HttpError({ status: 400, message: `Missing ?${name}=` });
  }
  return value;
}

/** Turn a thrown error into a response, keeping an `HttpError`'s status. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return new Response(error.message, { status: error.status });
  }
  return new Response(error instanceof Error ? error.message : String(error), {
    status: 500,
  });
}

/**
 * Stream a file, honoring the single `bytes=<start>-[<end>]` ranges that media
 * elements send when seeking. Other ranges get the whole file, which HTTP
 * allows.
 */
export async function serveFile({
  file,
  request,
}: {
  file: string;
  request: Request;
}): Promise<Response> {
  const { size } = await fs.promises.stat(file);
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": getMediaContentType(file) ?? "application/octet-stream",
  });
  const range = request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (range && start >= size) {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(undefined, { status: 416, headers });
  }
  headers.set("Content-Length", String(end - start + 1));
  if (range) {
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  const body =
    request.method === "HEAD"
      ? undefined
      : (Readable.toWeb(
          fs.createReadStream(file, { start, end }),
        ) as ReadableStream);
  return new Response(body, { status: range ? 206 : 200, headers });
}
