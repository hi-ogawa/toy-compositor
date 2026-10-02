#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Server } from "srvx";
import {
  getDesktopEntryFile,
  installDesktopEntry,
} from "./lib/desktop-entry.ts";
import { updateProjectMedia } from "./lib/media-info.ts";
import { renderProject } from "./lib/render/render.ts";
import { createLiveConnections } from "./lib/server/live.ts";
import { openWithDefaultApp } from "./lib/server/open-default.ts";
import { createProjectRegistry, getConfigDir } from "./lib/server/registry.ts";
import {
  checkEditorServer,
  serveEditor,
  stopEditorServer,
} from "./lib/server/serve.ts";
import { execFileAsync } from "./utils/exec.ts";

const packageDir = path.dirname(
  fileURLToPath(import.meta.resolve("#package.json")),
);

const UPGRADE_SOURCE = "https://pkg.pr.new/hi-ogawa/toy-compositor@main";

const HELP = `\
Usage:
  toy-compositor serve [directory] [--port <port>] [--open]
      Open the editor for the project folders, adding directory to them first.
      --open opens it in the browser, reusing a server already on the port,
      and exits shortly after the last editor tab closes
  toy-compositor stop [--port <port>]
      Stop the running editor server, leaving another process on the port alone
  toy-compositor status [--port <port>]
      Show whether the editor server is running
  toy-compositor install-desktop
      Add an app launcher entry that runs serve --open (Linux)
  toy-compositor upgrade [source] [--port <port>]
      Install the latest build globally with pnpm, or the build from source,
      update the app launcher entry, and stop the running editor server,
      so the next launch uses the new build
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

Source: https://github.com/hi-ogawa/toy-compositor`;

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
    case "stop": {
      const port = Number(values.port);
      console.log(
        (await stopEditorServer(port))
          ? `Stopped the editor on port ${port}`
          : `No editor running on port ${port}`,
      );
      break;
    }
    case "status": {
      const port = Number(values.port);
      console.log(
        (await checkEditorServer(port))
          ? `Editor running at http://localhost:${port}/`
          : `No editor running on port ${port}`,
      );
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
    case "upgrade": {
      await upgradeGlobalInstall(args[0] ?? UPGRADE_SOURCE);
      if (await stopEditorServer(Number(values.port))) {
        console.log(
          "Stopped the running editor. Launch it again to use the new build.",
        );
      }
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
  let server: Server;
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

/**
 * Install the package from `source` globally with pnpm, and rewrite the
 * desktop entry if one is installed. The entry names the package's CLI by its
 * versioned path, so the newly installed CLI writes it again.
 */
async function upgradeGlobalInstall(source: string) {
  await runCommand("pnpm", ["add", "-g", source]);
  if (fs.existsSync(getDesktopEntryFile())) {
    const { stdout } = await execFileAsync("pnpm", ["bin", "-g"]);
    const cli = path.join(stdout.trim(), "toy-compositor");
    await runCommand(cli, ["install-desktop"]);
  }
}

async function runCommand(command: string, args: string[]) {
  const child = spawn(command, args, { stdio: "inherit" });
  const [code] = await once(child, "close");
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${code}`);
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
