import fs from "node:fs";
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

/**
 * Write by renaming a finished temp file over `file`, so a concurrent reader
 * sees the old or the new contents, never a truncated file.
 */
export function writeFileAtomicSync(file: string, data: string) {
  const tempFile = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, data);
  fs.renameSync(tempFile, file);
}
