import { readFile, writeFile } from "node:fs/promises";

export async function editJson<T>(file: string, edit: (json: T) => void) {
  const json = await readJson<T>(file);
  edit(json);
  await writeJson(file, json);
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf-8"));
}

export async function writeJson(
  file: string,
  json: unknown,
  options?: { flag?: string },
) {
  await writeFile(file, JSON.stringify(json, null, 2) + "\n", options);
}
