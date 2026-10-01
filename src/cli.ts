#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { installDesktopEntry } from "./lib/desktop-entry.ts";
import { updateProjectMedia } from "./lib/media-info.ts";
import { renderProject } from "./lib/render/render.ts";
import { createLiveConnections } from "./lib/server/live.ts";
import { openWithDefaultApp } from "./lib/server/open-default.ts";
import { createProjectRegistry, getConfigDir } from "./lib/server/registry.ts";
import {
  checkEditorServer,
  type EditorServer,
  serveEditor,
} from "./lib/server/serve.ts";

const packageDir = path.dirname(
  fileURLToPath(import.meta.resolve("#package.json")),
);

const HELP = `\
Usage:
  toy-compositor serve [directory] [--port <port>] [--open]
      Open the editor for the project folders, adding directory to them first.
      --open opens it in the browser, reusing a server already on the port,
      and exits shortly after the last editor tab closes
  toy-compositor install-desktop
      Add an app launcher entry that runs serve --open (Linux)
  toy-compositor add <path>
      Add a project folder, given as the folder or a project file inside it
  toy-compositor render <project.json> <output> [--dry-run]
      Render a project to a video or still with ffmpeg
  toy-compositor update-media <project.json...>
      Record media info for the files that layers use in each project,
      which the editor and renderer need before they accept it

Getting started: ${path.join(packageDir, "docs/getting-started.md")}
Project format:  ${path.join(packageDir, "docs/project-format.md")}
Sample project:  ${path.join(packageDir, "samples/synthetic")}
Folder list:     ${path.join(getConfigDir(), "projects.json")}

Source: https://github.com/hi-ogawa/toy-compositor
Update: pnpm add -g https://pkg.pr.new/hi-ogawa/toy-compositor@main`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string", default: "5190" },
      open: { type: "boolean" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...args] = positionals;
  switch (command) {
    case "serve": {
      await runServe({
        directory: args[0],
        port: Number(values.port),
        open: values.open,
      });
      break;
    }
    case "install-desktop": {
      const iconFile = path.join(getClientDir(), "icon.svg");
      const entryFile = await installDesktopEntry({
        command: [process.execPath, import.meta.filename, "serve", "--open"],
        iconFile,
      });
      console.log(`Installed ${entryFile}`);
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

/**
 * Serve the editor, and with `open`, open it in the browser, reusing an editor
 * server already on the port, and close after the last editor tab closes.
 */
async function runServe({
  directory,
  port,
  open,
}: {
  directory?: string;
  port: number;
  open?: boolean;
}) {
  const clientDir = getClientDir();
  const registry = createProjectRegistry({ configDir: getConfigDir() });
  if (directory) {
    console.log(`Added ${await registry.addFolder(directory)}`);
  }
  const url = `http://localhost:${port}/`;
  const live = createLiveConnections();
  let server: EditorServer;
  try {
    server = await serveEditor({ registry, live, port, clientDir });
  } catch (error) {
    // The server reads the registry on every request, so a tab on the
    // running one also lists a folder added above.
    if (
      open &&
      (error as NodeJS.ErrnoException).code === "EADDRINUSE" &&
      (await checkEditorServer(port))
    ) {
      await openWithDefaultApp(url);
      console.log(`Opened the editor already running at ${url}`);
      return;
    }
    throw error;
  }
  console.log(`Editor: ${url}`);
  if (open) {
    await openWithDefaultApp(url);
    await live.waitForLastClose({ graceMs: 3000 });
    console.log("Closing after the last editor tab closed");
    await server.close(true);
  }
}

// The build places the client next to the bundled CLI.
function getClientDir() {
  const clientDir = path.join(import.meta.dirname, "../client");
  if (!fs.existsSync(path.join(clientDir, "index.html"))) {
    throw new Error(
      `Editor client not found at ${clientDir}. Run pnpm build first.`,
    );
  }
  return clientDir;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
