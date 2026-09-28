#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { renderProject } from "./lib/render/render.ts";
import { DEFAULT_ROOT, serveEditor } from "./lib/server/serve.ts";

const HELP = `\
Usage:
  toy-compositor serve [dir] [--port <port>]
      Open the editor for projects under dir (default: ${DEFAULT_ROOT})
  toy-compositor render <project.json> <output> [--dry-run]
      Render a project to a video or still with ffmpeg`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string", default: "5190" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...args] = positionals;
  switch (command) {
    case "serve": {
      // The build places the client next to the bundled CLI.
      const clientDir = path.join(import.meta.dirname, "client");
      if (!fs.existsSync(path.join(clientDir, "index.html"))) {
        throw new Error(
          `Editor client not found at ${clientDir}. Run pnpm build first.`,
        );
      }
      const root = path.resolve(args[0] ?? DEFAULT_ROOT);
      const server = await serveEditor({
        root,
        port: Number(values.port),
        clientDir,
      });
      console.log(`Serving projects under ${root}`);
      const url = new URL(server.url!);
      url.hostname = "localhost";
      console.log(`Editor: ${url.href}`);
      break;
    }
    case "render": {
      const [projectFile, outFile] = args;
      if (!projectFile || !outFile) {
        console.error(HELP);
        process.exitCode = 1;
        return;
      }
      await renderProject({ projectFile, outFile, dryRun: values["dry-run"] });
      break;
    }
    default: {
      console.log(HELP);
      process.exitCode = values.help ? 0 : 1;
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
