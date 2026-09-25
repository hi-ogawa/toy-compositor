// Usage: node studio.ts <project.json> [--port 3000]
// Opens a project file in Remotion Studio. Edits in the props panel are
// written back to the project file through a small local endpoint.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

function main() {
  const projectFile = process.argv[2];
  if (!projectFile) {
    console.error("Usage: node studio.ts <project.json> [--port 3000]");
    process.exit(1);
  }
  const projectPath = path.resolve(projectFile);
  const portIndex = process.argv.indexOf("--port");
  const port = portIndex > 0 ? process.argv[portIndex + 1] : "3000";

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "POST" && req.url === "/save") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        JSON.parse(body); // refuse to write anything that is not JSON
        fs.writeFileSync(projectPath, body);
        console.error(`[studio-sync] saved ${path.relative(process.cwd(), projectPath)}`);
        res.end("ok");
      });
      return;
    }
    res.end();
  });

  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const here = import.meta.dirname;
    const studio = spawn(
      path.join(here, "node_modules/.bin/remotion"),
      [
        "studio",
        path.join(here, "src/index.ts"),
        `--public-dir=${path.dirname(projectPath)}`,
        `--port=${port}`,
      ],
      {
        cwd: here,
        stdio: "inherit",
        env: {
          ...process.env,
          REMOTION_PROJECT: fs.readFileSync(projectPath, "utf-8"),
          REMOTION_SAVE_URL: `http://127.0.0.1:${address.port}/save`,
        },
      },
    );
    studio.on("exit", (code) => {
      server.close();
      process.exit(code ?? 0);
    });
  });
}

main();
