// Vite middleware for the editor. It loads and saves one project file and
// serves the media it references, with range requests so video can seek.

import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";

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

export function editorApi({ projectFile }: { projectFile: string }): Plugin {
  const projectDir = path.dirname(projectFile);
  return {
    name: "editor-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        try {
          if (url.pathname === "/api/project" && req.method === "GET") {
            const content = await fs.promises.readFile(projectFile, "utf-8");
            sendJson(res, {
              file: path.relative(process.cwd(), projectFile),
              project: JSON.parse(content),
            });
            return;
          }
          if (url.pathname === "/api/project" && req.method === "PUT") {
            const project = JSON.parse(await readBody(req));
            await fs.promises.writeFile(
              projectFile,
              JSON.stringify(project, null, 2) + "\n",
            );
            sendJson(res, {});
            return;
          }
          if (url.pathname.startsWith("/media/")) {
            const src = decodeURIComponent(
              url.pathname.slice("/media/".length),
            );
            await serveFile({ req, res, file: path.resolve(projectDir, src) });
            return;
          }
        } catch (error) {
          res.statusCode = 500;
          res.end(error instanceof Error ? error.message : String(error));
          return;
        }
        next();
      });
    },
  };
}

function sendJson(res: ServerResponse, data: unknown) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function serveFile({
  req,
  res,
  file,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  file: string;
}) {
  const stat = await fs.promises.stat(file).catch(() => undefined);
  if (!stat?.isFile()) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader(
    "Content-Type",
    CONTENT_TYPES[path.extname(file).toLowerCase()] ??
      "application/octet-stream",
  );
  const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (!match || (!match[1] && !match[2])) {
    res.setHeader("Content-Length", stat.size);
    fs.createReadStream(file).pipe(res);
    return;
  }
  // "bytes=-n" asks for the last n bytes.
  const start = match[1] ? Number(match[1]) : stat.size - Number(match[2]);
  const end =
    match[1] && match[2]
      ? Math.min(Number(match[2]), stat.size - 1)
      : stat.size - 1;
  if (start < 0 || start > end) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${stat.size}`);
    res.end();
    return;
  }
  res.statusCode = 206;
  res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
  res.setHeader("Content-Length", end - start + 1);
  fs.createReadStream(file, { start, end }).pipe(res);
}
