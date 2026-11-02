import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// REMED-CLOSE · test isolation. The dev-server resolves its workspace (query store, journals, dev accounts) from
// HARDKAS_ROOT, else the process's working directory — the repository root under the test runner, whose .hardkas the
// canonical gate's guard watches. Imported FIRST by a test file (before ../src/*), this gives that file a temporary
// workspace of its own for the whole worker, removed when the worker exits.
if (!process.env.HARDKAS_ROOT) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-dev-server-test-"));
  process.env.HARDKAS_ROOT = dir;
  process.once("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // a leftover temporary directory is only disk space
    }
  });
}

export const ISOLATED_ROOT: string = process.env.HARDKAS_ROOT!;
