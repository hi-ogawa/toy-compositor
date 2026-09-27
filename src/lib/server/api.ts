// Fetch handler for the editor. It loads and saves one project file and
// serves the media it references, with range requests so video can seek.

import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export function createEditorHandler({ projectFile }: { projectFile: string }) {
  const projectDir = path.dirname(projectFile);
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/project" && request.method === "GET") {
        const content = await fs.promises.readFile(projectFile, "utf-8");
        return Response.json({
          file: path.relative(process.cwd(), projectFile),
          project: JSON.parse(content),
        });
      }
      if (url.pathname === "/api/project" && request.method === "PUT") {
        const project = await request.json();
        await fs.promises.writeFile(
          projectFile,
          JSON.stringify(project, null, 2) + "\n",
        );
        return Response.json({});
      }
      if (url.pathname.startsWith("/media/")) {
        const src = decodeURIComponent(url.pathname.slice("/media/".length));
        return await serveFile({
          request,
          file: path.resolve(projectDir, src),
        });
      }
      return new Response(null, { status: 404 });
    } catch (error) {
      return new Response(
        error instanceof Error ? error.message : String(error),
        {
          status: 500,
        },
      );
    }
  };
}

async function serveFile({
  request,
  file,
}: {
  request: Request;
  file: string;
}) {
  const stat = await fs.promises.stat(file).catch(() => undefined);
  if (!stat?.isFile()) {
    return new Response(null, { status: 404 });
  }
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type":
      CONTENT_TYPES[path.extname(file).toLowerCase()] ??
      "application/octet-stream",
  });
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (!match || (!match[1] && !match[2])) {
    headers.set("Content-Length", String(stat.size));
    return new Response(
      Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>,
      { headers },
    );
  }
  // "bytes=-n" asks for the last n bytes.
  const start = match[1] ? Number(match[1]) : stat.size - Number(match[2]);
  const end =
    match[1] && match[2]
      ? Math.min(Number(match[2]), stat.size - 1)
      : stat.size - 1;
  if (start < 0 || start > end) {
    headers.set("Content-Range", `bytes */${stat.size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(
    Readable.toWeb(
      fs.createReadStream(file, { start, end }),
    ) as ReadableStream<Uint8Array>,
    {
      status: 206,
      headers,
    },
  );
}
