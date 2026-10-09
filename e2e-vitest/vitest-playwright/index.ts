// Generic Vitest E2E layer for the spike. It knows nothing about the app under
// test, so it shows the shape a first-class integration would need. This entry
// is for test files, and global setup imports `./setup.ts` instead, because
// `test.extend` cannot run in the main process where global setup runs.
export { expect } from "./expect.ts";
export { test } from "./fixtures.ts";
