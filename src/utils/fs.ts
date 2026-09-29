import { readFile, writeFile } from "node:fs/promises";

/** Read a JSON file, change it in place with `edit`, and write it back. */
export async function editJson<T>({
  file,
  edit,
}: {
  file: string;
  edit: (json: T) => void;
}) {
  const json: T = JSON.parse(await readFile(file, "utf-8"));
  edit(json);
  await writeFile(file, JSON.stringify(json, null, 2) + "\n");
}
