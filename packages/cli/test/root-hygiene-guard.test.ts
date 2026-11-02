import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rootHygiene } from "../../../scripts/vitest-root-hygiene.js";

// -----------------------------------------------------------------------------
// REMED-CLOSE · test isolation: the guard every test level runs around the whole run. A file added, changed or removed
// in the repository root's .hardkas fails the run by name, and so does the directory itself when a run creates or
// removes it; what was already there is only compared, never removed. Here it watches a directory of its own.
// Canonical level.
// -----------------------------------------------------------------------------

let dir = "";
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-root-hygiene-"));
  fs.mkdirSync(path.join(dir, "dev-accounts"));
  fs.writeFileSync(path.join(dir, "store.db"), "pre-existing");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("REMED-CLOSE · the root .hardkas guard", () => {
  it("a run that leaves the directory as it was passes, and the files already there stay untouched", () => {
    const g = rootHygiene(dir);
    g.setup();
    expect(() => g.teardown()).not.toThrow();
    expect(fs.readFileSync(path.join(dir, "store.db"), "utf8")).toBe("pre-existing");
  });

  it("a new file, a changed one, a removed one or a new directory fails the run, each by name", () => {
    const g = rootHygiene(dir);
    g.setup();
    fs.writeFileSync(path.join(dir, "escrow-store.json"), "{}");
    fs.writeFileSync(path.join(dir, "store.db"), "rewritten by a test");
    fs.mkdirSync(path.join(dir, "locks"));
    fs.rmSync(path.join(dir, "dev-accounts"), { recursive: true });
    let message = "";
    try {
      g.teardown();
    } catch (e: any) {
      message = String(e?.message);
    }
    expect(message).toMatch(/^TEST_ROOT_HARDKAS_WRITTEN: /);
    expect(message).toMatch(/added \[.*escrow-store\.json/);
    expect(message).toMatch(/added \[.*locks/);
    expect(message).toMatch(/changed \[store\.db\]/);
    expect(message).toMatch(/removed \[dev-accounts/);
  });

  it("a root .hardkas that does not exist and is not created passes; one created by the run fails, even left empty", () => {
    const missing = path.join(dir, "absent", ".hardkas");
    const g = rootHygiene(missing);
    g.setup();
    expect(() => g.teardown()).not.toThrow();
    g.setup();
    fs.mkdirSync(missing, { recursive: true });
    expect(() => g.teardown()).toThrow(/added \[\.\/\]/);
    fs.rmSync(missing, { recursive: true });
    g.setup();
    fs.mkdirSync(missing, { recursive: true });
    fs.writeFileSync(path.join(missing, "localnet.json"), "{}");
    expect(() => g.teardown()).toThrow(/added \[\.\/, localnet\.json\]/);
  });

  it("a run that removes the whole directory fails, naming it and what it held", () => {
    const g = rootHygiene(dir);
    g.setup();
    fs.rmSync(dir, { recursive: true });
    expect(() => g.teardown()).toThrow(/removed \[\.\/, dev-accounts\/, store\.db\]/);
    fs.mkdirSync(dir);
  });
});
