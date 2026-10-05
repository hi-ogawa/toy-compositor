#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Server } from "srvx";
import {
  getDesktopEntryFile,
  installDesktopEntry,
} from "./lib/desktop-entry.ts";
import { updateProjectMedia } from "./lib/media-info.ts";
import { migrateAndValidateProject, type SavedProject } from "./lib/migrate.ts";
import { renderProject } from "./lib/render/render.ts";
import { createLiveConnections } from "./lib/server/live.ts";
import { openWithDefaultApp } from "./lib/server/open-default.ts";
import { createProjectRegistry, getConfigDir } from "./lib/server/registry.ts";
import {
  checkEditorServer,
  serveEditor,
  stopEditorServer,
} from "./lib/server/serve.ts";
import { createTray } from "./lib/server/tray/tray.ts";
import { execFileAsync } from "./utils/exec.ts";
import { readJson, writeJson } from "./utils/fs.ts";

const packageDir = path.dirname(
  fileURLToPath(import.meta.resolve("#package.json")),
);

const UPGRADE_SOURCE = "https://pkg.pr.new/hi-ogawa/toy-compositor@main";

const HELP = `\
Usage:
  toy-compositor serve [directory] [--port <port>] [--open | --tray]
      Open the editor for the project folders, adding directory to them first.
      --open opens it in the browser, reusing a server already on the port,
      and exits shortly after the last editor tab closes.
      --tray opens it the same way, but keeps running with a tray item,
      whose menu opens the editor again or quits (Linux)
  toy-compositor stop [--port <port>]
      Stop the running editor server, leaving another process on the port alone
  toy-compositor status [--port <port>]
      Show whether the editor server is running
  toy-compositor install-desktop [--tray]
      Add an app launcher entry that runs serve --open, or serve --tray (Linux)
  toy-compositor upgrade [source] [--port <port>]
      Install a new build globally with pnpm, rewrite the app launcher entry,
      and stop the running editor server, so the next launch uses the new build.
      source is a pkg.pr.new URL or a tarball, and defaults to the main build
  toy-compositor add <path>
      Add a project folder, given as the folder or a project file inside it
  toy-compositor render <project.json> <output> [--dry-run]
      Render a project to a video or still with ffmpeg
  toy-compositor update-media <project.json...>
      Record media info for the files that clips use in each project,
      which the editor and renderer need before they accept it
  toy-compositor migrate <project.json...> [--check]
      Rewrite each project from an older format to the current one.
      --check lists what would change without writing, and exits non-zero
      if anything would

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
      tray: { type: "boolean" },
      "dry-run": { type: "boolean" },
      check: { type: "boolean" },
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
        tray: values.tray,
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
        command: [
          process.execPath,
          import.meta.filename,
          "serve",
          values.tray ? "--tray" : "--open",
        ],
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
    case "migrate": {
      if (args.length === 0) {
        console.error(HELP);
        process.exitCode = 1;
        return;
      }
      await runMigrate(args, { check: values.check });
      break;
    }
    default: {
      console.log(HELP);
      process.exitCode = values.help ? 0 : 1;
    }
  }
}

async function runServe({
  directory,
  port,
  open,
  tray,
}: {
  directory?: string;
  port: number;
  open?: boolean;
  tray?: boolean;
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
      (open || tray) &&
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
  if (tray) {
    await openWithDefaultApp(url);
    // The tray's Quit stops the server the way `toy-compositor stop` does.
    const trayItem = await createTray({
      url,
      iconThemePath: clientDir,
      iconName: "icon",
      onOpen: () => {
        openWithDefaultApp(url).catch((error: unknown) => console.error(error));
      },
      onQuit: () => {
        stopEditorServer(port).catch((error: unknown) => console.error(error));
      },
    });
    await once(server.node!.server!, "close");
    trayItem.close();
  }
}

/**
 * The desktop entry names the package's CLI by its versioned path, so the newly
 * installed CLI writes it again.
 */
async function upgradeGlobalInstall(source: string) {
  // pnpm picks its version from the current directory's packageManager field,
  // and pnpm versions keep separate global folders, so run it from the home
  // directory to reach the same global install wherever upgrade runs.
  const cwd = os.homedir();
  if (fs.existsSync(source)) {
    source = path.resolve(source);
  }
  await runCommand("pnpm", ["add", "-g", source], { cwd });
  if (fs.existsSync(getDesktopEntryFile())) {
    const { stdout } = await execFileAsync("pnpm", ["bin", "-g"], { cwd });
    const cli = path.join(stdout.trim(), "toy-compositor");
    // Keep the entry's mode, which install-desktop writes as serve's option.
    const entry = await fs.promises.readFile(getDesktopEntryFile(), "utf8");
    const options = entry.includes('"--tray"') ? ["--tray"] : [];
    await runCommand(cli, ["install-desktop", ...options], { cwd });
  }
}

async function runCommand(
  command: string,
  args: string[],
  { cwd }: { cwd: string },
) {
  const child = spawn(command, args, { cwd, stdio: "inherit" });
  const [code] = await once(child, "close");
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${code}`);
  }
}

async function runMigrate(
  projectFiles: string[],
  { check }: { check?: boolean },
) {
  for (const projectFile of projectFiles) {
    const { project, changes } = await migrateAndValidateProject(
      await readJson<SavedProject>(projectFile),
    );
    if (changes.length === 0) {
      continue;
    }
    console.log(`${check ? "Would migrate" : "Migrated"} ${projectFile}`);
    for (const change of changes) {
      console.log(`  ${change}`);
    }
    if (check) {
      process.exitCode = 1;
    } else {
      await writeJson(projectFile, project);
    }
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
