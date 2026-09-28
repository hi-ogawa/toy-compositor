// pkg.pr.new passes binary template files to StackBlitz as text files holding
// a download URL, so replace each one with the file it points to.
import fs from "node:fs/promises";
import path from "node:path";

const PREFIX = "https://pkg.pr.new/template/";

for (const name of await fs.readdir("projects", { recursive: true })) {
  const file = path.join("projects", name);
  if (!(await fs.stat(file)).isFile()) {
    continue;
  }
  const content = await fs.readFile(file, "utf-8");
  if (!content.startsWith(PREFIX)) {
    continue;
  }
  const res = await fetch(content.trim());
  if (!res.ok) {
    throw new Error(`Failed to download ${file}: ${res.status}`);
  }
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log(`Downloaded ${file}`);
}
