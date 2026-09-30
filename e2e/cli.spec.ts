import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { execFileAsync } from "../src/utils/exec.ts";

test("help points to bundled docs and sample that exist", async () => {
  // Print the CLI help and read the paths it gives for the bundled files.
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.ts",
    "--help",
  ]);
  const paths = ["Getting started", "Project format", "Sample project"].map(
    (label) => stdout.match(new RegExp(`^${label}: +(.*)$`, "m"))?.[1],
  );

  // Check that every path exists, so a renamed doc or sample fails here.
  for (const file of paths) {
    expect(file).toBeDefined();
    expect(existsSync(file!)).toBe(true);
  }
});
