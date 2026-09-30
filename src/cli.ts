#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { updateProjectMedia } from "./lib/media-info.ts";
import { renderProject } from "./lib/render/render.ts";
import { createProjectRegistry, getConfigDir } from "./lib/server/registry.ts";
import { serveEditor } from "./lib/server/serve.ts";

const HELP = `\
Usage:
  toy-compositor serve [dir] [--port <port>]
      Open the editor for the project folders, adding dir to them first
  toy-compositor add <path>
      Add a project folder, given as the folder or a project file inside it
  toy-compositor render <project.json> <output> [--dry-run]
      Render a project to a video or still with ffmpeg
  toy-compositor update-media <project.json...>
      Record media info for the files that layers use in each project`;

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
      const clientDir = path.join(import.meta.dirname, "../client");
      if (!fs.existsSync(path.join(clientDir, "index.html"))) {
        throw new Error(
          `Editor client not found at ${clientDir}. Run pnpm build first.`,
        );
      }
      const registry = createProjectRegistry({ configDir: getConfigDir() });
      if (args[0]) {
        console.log(`Added ${await registry.addFolder(args[0])}`);
      }
      const server = await serveEditor({
        registry,
        port: Number(values.port),
        clientDir,
      });
      const url = new URL(server.url!);
      url.hostname = "localhost";
      console.log(`Editor: ${url.href}`);
      break;
    }
    case "add": {
      if (!args[0]) {
        console.error(HELP);
        process.exitCode = 1;
        return;
      }
      const registry = createProjectRegistry({ configDir: getConfigDir() });
      console.log(`Added ${await registry.addFolder(args[0])}`);
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
    case "update-media": {
      if (args.length === 0) {
        console.error(HELP);
        process.exitCode = 1;
        return;
      }
      for (const projectFile of args) {
        await updateProjectMedia(projectFile);
      }
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
